"use server";

import { cookies } from "next/headers";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { BookingChannel, BookingStatus } from "@/generated/prisma/enums";
import { ForbiddenError, assertBookingAccess, assertUser, canAccessBranch, isAdmin, type CurrentUser } from "@/lib/auth";
import { getAvailability } from "@/lib/availability";
import { BookingError, cancelBooking, createBooking, matchWaitlist, rescheduleBooking, updateBookingStatus } from "@/lib/booking";
import { CatalogError } from "@/lib/catalog";
import { customerPhone, insideWindow, notifyWaitlist, sendOutbound } from "@/lib/conversations";
import { BRANCH_COOKIE } from "@/lib/dashboard";
import { db } from "@/lib/prisma";
import { formatLocal, humanDateTime } from "@/lib/time";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; alternatives?: Array<{ start: string; label: string }> };

const STAFF_ROLES = ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"] as const;

async function run<T>(fn: () => Promise<T>, okMessage?: string, tz = "America/Lima"): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data, message: okMessage };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof ForbiddenError || e instanceof CatalogError) return { ok: false, error: e.message };
    if (e instanceof BookingError) {
      return {
        ok: false,
        error: e.message,
        alternatives: e.alternatives.map((s) => ({ start: new Date(s.start).toISOString(), label: humanDateTime(s.start, tz) })),
      };
    }
    console.error(e);
    return { ok: false, error: "Ocurrió un error inesperado." };
  }
}

export async function setBranch(value: string) {
  const user = await assertUser();
  const v = z.string().max(40).parse(value);
  if (v !== "all" && !canAccessBranch(user, v)) throw new ForbiddenError();
  (await cookies()).set(BRANCH_COOKIE, v, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}

export async function changeStatus(bookingId: string, status: string) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES, "STYLIST"]);
    const to = z.enum(BookingStatus).parse(status);
    await assertBookingAccess(user, bookingId);
    if (user.role === "STYLIST" && !["IN_PROGRESS", "COMPLETED"].includes(to)) {
      throw new ForbiddenError("Como especialista solo puedes iniciar o completar tus citas.");
    }
    const prisma = await db();
    const updated = await updateBookingStatus(prisma, { bookingId, to, isAdmin: isAdmin(user) });
    if (to === "CANCELLED") {
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { items: true } });
      const entry = await matchWaitlist(prisma, b);
      if (entry) await notifyWaitlist(prisma, entry, b.startsAt);
    }
    return updated.status;
  }, "Estado actualizado");
}

const moveSchema = z.object({
  bookingId: z.string().min(1),
  start: z.iso.datetime({ offset: true }),
  stylistId: z.string().min(1).optional(),
});

/** Arrastrar y soltar en la agenda: mueve y/o reasigna. */
export async function moveBooking(input: z.input<typeof moveSchema>) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    const data = moveSchema.parse(input);
    await assertBookingAccess(user, data.bookingId);
    const b = await rescheduleBooking(await db(), {
      bookingId: data.bookingId,
      start: new Date(data.start),
      stylistId: data.stylistId,
      keepStylists: !data.stylistId,
      staff: true,
    });
    return { code: b.code };
  }, "Reserva movida");
}

const createSchema = z.object({
  branchId: z.string().min(1, "Elige una sede"),
  phone: z.string().trim().min(9, "Teléfono inválido").max(20),
  name: z.string().trim().max(80).optional(),
  serviceIds: z.array(z.string().min(1)).min(1, "Elige al menos un servicio").max(5),
  stylistId: z.string().optional(),
  start: z.iso.datetime({ offset: true, message: "Elige un horario" }),
  channel: z.enum(BookingChannel).default("DASHBOARD"),
  notes: z.string().max(500).optional(),
});

export async function createStaffBooking(input: z.input<typeof createSchema>) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    const data = createSchema.parse(input);
    if (!canAccessBranch(user, data.branchId)) throw new ForbiddenError();
    const b = await createBooking(await db(), {
      branchId: data.branchId,
      phone: data.phone,
      customerName: data.name || null,
      items: data.serviceIds.map((serviceId) => ({ serviceId, stylistId: data.stylistId || null })),
      start: new Date(data.start),
      channel: data.channel,
      notes: data.notes,
      createdById: user.id,
      staff: true,
      walkIn: data.channel === "WALK_IN",
    });
    return { code: b.code };
  }, "Reserva creada");
}

const availabilitySchema = z.object({
  branchId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1).max(5),
  stylistId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function staffAvailability(input: z.input<typeof availabilitySchema>) {
  try {
    const user = await assertUser([...STAFF_ROLES]);
    const data = availabilitySchema.parse(input);
    if (!canAccessBranch(user, data.branchId)) throw new ForbiddenError();
    const { days, timezone } = await getAvailability(await db(), {
      branchId: data.branchId,
      items: data.serviceIds.map((serviceId) => ({ serviceId, stylistId: data.stylistId || null })),
      fromKey: data.date,
      ignoreLead: true,
    });
    return {
      ok: true as const,
      slots: (days[0]?.slots ?? []).map((s) => ({
        start: new Date(s.start).toISOString(),
        label: formatLocal(s.start, timezone, "HH:mm"),
        stylists: [...new Set(s.items.map((i) => i.stylistName))].join(" + "),
        totalCents: s.totalCents,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Error", slots: [] };
  }
}

export async function cancelWithReason(bookingId: string, reason: string) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    await assertBookingAccess(user, bookingId);
    const prisma = await db();
    const { waitlist, booking } = await cancelBooking(prisma, { bookingId, reason: z.string().max(200).parse(reason) || undefined, staff: true });
    if (waitlist) await notifyWaitlist(prisma, waitlist, booking.startsAt);
  }, "Reserva cancelada");
}

// ─── Clientas ────────────────────────────────────────────────────────────────

async function assertCustomerAccess(user: CurrentUser, customerId: string) {
  if (user.branchIds === null) return;
  const prisma = await db();
  const found = await prisma.customer.findFirst({
    where: {
      id: customerId,
      OR: [
        {
          bookings: {
            some: {
              branchId: { in: user.branchIds },
              ...(user.role === "STYLIST" ? { items: { some: { stylistId: user.stylistId ?? "-" } } } : {}),
            },
          },
        },
        ...(user.role === "STYLIST" ? [] : [{ preferredBranchId: { in: user.branchIds } }]),
      ],
    },
    select: { id: true },
  });
  if (!found) throw new ForbiddenError("No tienes acceso a esta clienta.");
}

const customerSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.union([z.email("Correo inválido"), z.literal("")]).optional(),
  skinType: z.string().max(60).optional(),
  hairType: z.string().max(60).optional(),
  allergies: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.string().max(300).optional(),
  marketingOptIn: z.boolean().optional(),
});

export async function updateCustomer(customerId: string, input: z.input<typeof customerSchema>) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES, "STYLIST"]);
    await assertCustomerAccess(user, customerId);
    const d = customerSchema.parse(input);
    const prisma = await db();
    const current = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: d.name || null,
        email: d.email || null,
        skinType: d.skinType || null,
        hairType: d.hairType || null,
        allergies: d.allergies || null,
        notes: d.notes || null,
        tags: d.tags ? [...new Set(d.tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12) : [],
        marketingOptIn: d.marketingOptIn ?? current.marketingOptIn,
        marketingOptInAt: d.marketingOptIn && !current.marketingOptIn ? new Date() : current.marketingOptInAt,
      },
    });
  }, "Ficha guardada");
}

const noteSchema = z.object({
  title: z.string().trim().min(2, "Ponle un título").max(120),
  formula: z.string().max(500).optional(),
  body: z.string().max(2000).optional(),
});

export async function addTechnicalNote(customerId: string, input: z.input<typeof noteSchema>) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES, "STYLIST"]);
    await assertCustomerAccess(user, customerId);
    const d = noteSchema.parse(input);
    await (await db()).technicalNote.create({
      data: { customerId, stylistId: user.stylistId, title: d.title, formula: d.formula || null, body: d.body || null },
    });
  }, "Nota técnica agregada");
}

// ─── Conversaciones ──────────────────────────────────────────────────────────

async function assertConversation(user: CurrentUser, conversationId: string) {
  const c = await (await db()).conversation.findUnique({ where: { id: conversationId } });
  if (!c) throw new ForbiddenError("Conversación no encontrada.");
  if (user.branchIds && c.branchId && !user.branchIds.includes(c.branchId)) throw new ForbiddenError();
  return c;
}

export async function takeOver(conversationId: string, take: boolean) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    await assertConversation(user, conversationId);
    const prisma = await db();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: take ? { aiPaused: true, status: "HUMAN", assignedUserId: user.id } : { aiPaused: false, status: "BOT", assignedUserId: null },
    });
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUT",
        author: "SYSTEM",
        body: take ? `${user.name} tomó la conversación` : `${user.name} devolvió la conversación al asistente`,
      },
    });
  });
}

export async function staffReply(conversationId: string, text: string) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    const conv = await assertConversation(user, conversationId);
    const body = z.string().trim().min(1, "Escribe un mensaje").max(4000).parse(text);
    if (!insideWindow(conv)) {
      throw new ForbiddenError("Pasaron más de 24 h desde el último mensaje de la clienta: WhatsApp solo permite plantillas aprobadas.");
    }
    const prisma = await db();
    if (!conv.aiPaused) {
      await prisma.conversation.update({ where: { id: conv.id }, data: { aiPaused: true, status: "HUMAN", assignedUserId: user.id } });
    }
    await sendOutbound(prisma, conv, { type: "text", body }, "STAFF", user.id);
    return customerPhone(conv);
  });
}

export async function markConversationRead(conversationId: string) {
  const user = await assertUser([...STAFF_ROLES]);
  await assertConversation(user, conversationId);
  await (await db()).conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
}

export async function closeConversation(conversationId: string) {
  return run(async () => {
    const user = await assertUser([...STAFF_ROLES]);
    await assertConversation(user, conversationId);
    await (await db()).conversation.update({ where: { id: conversationId }, data: { status: "CLOSED", aiPaused: false, unreadCount: 0 } });
  }, "Conversación cerrada");
}

/** Invalida la landing cuando cambia el catálogo (se usa desde Configuración). */
export async function invalidateCatalog() {
  updateTag("catalog");
}
