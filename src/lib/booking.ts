import "server-only";
import type { BookingChannel, BookingStatus } from "@/generated/prisma/client";
import type { Db, Tx } from "./prisma";
import { getAvailability, validateStart, type RequestedItem } from "./availability";
import type { Slot } from "./availability-engine";
import { STATUS_LABELS } from "./labels";
import { addDaysKey, localDateKey } from "./time";
import { bookingCode, normalizePhone } from "./utils";

export class BookingError extends Error {
  constructor(
    message: string,
    public code: "SLOT_TAKEN" | "POLICY" | "NOT_FOUND" | "INVALID" | "TRANSITION",
    public alternatives: Slot[] = [],
  ) {
    super(message);
  }
}

export { CHANNEL_LABELS, STATUS_LABELS } from "./labels";

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function allowedTransitions(from: BookingStatus, isAdmin = false): BookingStatus[] {
  if (isAdmin && from === "NO_SHOW") return ["CONFIRMED", "COMPLETED"];
  return TRANSITIONS[from];
}

/** Bloqueo transaccional por clave de texto (se libera al terminar la transacción). */
async function lock(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Orden de bloqueo fijo para evitar interbloqueos: primero la sede+día,
 * luego todas las especialistas candidatas+día en orden alfabético.
 */
async function lockForSlot(tx: Tx, branchId: string, dateKey: string, items: RequestedItem[]) {
  await lock(tx, `branch:${branchId}:${dateKey}`);
  const fixed = items.map((i) => i.stylistId).filter((x): x is string => Boolean(x));
  const needsAny = items.some((i) => !i.stylistId);
  let ids = fixed;
  if (needsAny) {
    const candidates = await tx.stylist.findMany({
      where: { schedules: { some: { branchId } }, services: { some: { serviceId: { in: items.map((i) => i.serviceId) } } } },
      select: { id: true },
    });
    ids = [...fixed, ...candidates.map((c) => c.id)];
  }
  for (const id of [...new Set(ids)].sort()) await lock(tx, `stylist:${id}:${dateKey}`);
}

async function alternativesNear(prisma: Db, branchId: string, items: RequestedItem[], start: Date, excludeBookingId?: string) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const key = localDateKey(start, branch.timezone);
  const loose = items.map((i) => ({ ...i, stylistId: null }));
  const near = (slots: Slot[]) => slots.sort((a, b) => Math.abs(a.start - start.getTime()) - Math.abs(b.start - start.getTime())).slice(0, 3);
  // 1) mismo día y misma especialista, 2) mismo día con cualquiera, 3) la próxima semana con la misma, 4) con cualquiera.
  const attempts: Array<[RequestedItem[], string]> = [
    [items, key],
    [loose, key],
    [items, addDaysKey(key, 7)],
    [loose, addDaysKey(key, 7)],
  ];
  for (const [req, toKey] of attempts) {
    const { days } = await getAvailability(prisma, { branchId, items: req, fromKey: key, toKey, excludeBookingId });
    const slots = days.flatMap((d) => d.slots);
    if (slots.length) return near(slots);
  }
  return [];
}

export async function upsertCustomer(prisma: Db | Tx, phoneRaw: string, name?: string | null) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new BookingError("El teléfono no es válido.", "INVALID");
  return prisma.customer.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name: name ?? null },
  });
}

async function uniqueCode(tx: Tx) {
  for (let i = 0; i < 8; i++) {
    const code = bookingCode();
    if (!(await tx.booking.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("No se pudo generar un código de reserva único");
}

function itemRows(slot: Slot) {
  return slot.items.map((it, position) => ({
    serviceId: it.serviceId,
    variantId: it.variantId,
    stylistId: it.stylistId,
    position,
    startsAt: new Date(it.start),
    endsAt: new Date(it.end),
    busyUntil: new Date(it.busyUntil),
    processingStart: it.processingStart ? new Date(it.processingStart) : null,
    processingEnd: it.processingEnd ? new Date(it.processingEnd) : null,
    durationMin: it.durationMin,
    priceCents: it.priceCents,
  }));
}

export interface CreateBookingInput {
  branchId: string;
  phone: string;
  customerName?: string | null;
  items: RequestedItem[];
  start: Date;
  channel: BookingChannel;
  notes?: string | null;
  createdById?: string | null;
  /** Reservas creadas por el staff: se saltan políticas de cliente. */
  staff?: boolean;
  walkIn?: boolean;
}

export async function createBooking(prisma: Db, input: CreateBookingInput) {
  if (input.items.length === 0 || input.items.length > 5) throw new BookingError("Elige entre 1 y 5 servicios.", "INVALID");
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || !branch.active) throw new BookingError("La sede no existe o no está activa.", "NOT_FOUND");
  const dateKey = localDateKey(input.start, branch.timezone);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const customer = await upsertCustomer(tx, input.phone, input.customerName);
        let status: BookingStatus = input.walkIn ? "IN_PROGRESS" : "CONFIRMED";

        if (!input.staff) {
          if (customer.noShowCount >= branch.noShowBlockAt) {
            throw new BookingError("Por tu historial de inasistencias, una asesora confirmará tu cita personalmente.", "POLICY");
          }
          const active = await tx.booking.count({
            where: { customerId: customer.id, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gt: new Date() } },
          });
          if (active >= branch.maxActiveBookings) {
            throw new BookingError(`Ya tienes ${active} citas activas; el máximo es ${branch.maxActiveBookings}.`, "POLICY");
          }
          if (customer.noShowCount >= branch.noShowWarnAt) status = "PENDING";
        }

        await lockForSlot(tx, branch.id, dateKey, input.items);
        const { slot } = await validateStart(tx, {
          branchId: branch.id,
          items: input.items,
          start: input.start,
          ignoreLead: input.staff,
        });
        if (!slot) throw new BookingError("Ese horario acaba de ocuparse.", "SLOT_TAKEN");

        return tx.booking.create({
          data: {
            code: await uniqueCode(tx),
            customerId: customer.id,
            branchId: branch.id,
            status,
            channel: input.channel,
            startsAt: new Date(slot.start),
            endsAt: new Date(slot.end),
            totalCents: slot.totalCents,
            notes: input.notes ?? null,
            createdById: input.createdById ?? null,
            confirmedAt: status === "CONFIRMED" ? new Date() : null,
            items: { create: itemRows(slot) },
          },
          include: { items: { include: { service: true, stylist: true } }, branch: true, customer: true },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (err instanceof BookingError && err.code === "SLOT_TAKEN") {
      err.alternatives = await alternativesNear(prisma, branch.id, input.items, input.start);
    }
    throw err;
  }
}

/** ¿Está dentro de la ventana de cambio gratuito? */
export function withinFreeWindow(startsAt: Date, cancelWindowHours: number, now = new Date()) {
  return startsAt.getTime() - now.getTime() >= cancelWindowHours * 3_600_000;
}

export async function rescheduleBooking(
  prisma: Db,
  opts: { bookingId: string; start: Date; stylistId?: string | null; keepStylists?: boolean; staff?: boolean },
) {
  const booking = await prisma.booking.findUnique({ where: { id: opts.bookingId }, include: { items: { orderBy: { position: "asc" } }, branch: true } });
  if (!booking) throw new BookingError("No encontré esa reserva.", "NOT_FOUND");
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) throw new BookingError("Esta reserva ya no se puede reprogramar.", "TRANSITION");
  if (!opts.staff && !withinFreeWindow(booking.startsAt, booking.branch.cancelWindowHours)) {
    throw new BookingError(`Solo se puede reprogramar hasta ${booking.branch.cancelWindowHours} h antes.`, "POLICY");
  }
  const items: RequestedItem[] = booking.items.map((i) => ({
    serviceId: i.serviceId,
    variantId: i.variantId,
    stylistId: opts.stylistId !== undefined ? opts.stylistId : opts.keepStylists ? i.stylistId : null,
  }));
  const dateKey = localDateKey(opts.start, booking.branch.timezone);

  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockForSlot(tx, booking.branchId, dateKey, items);
        const { slot } = await validateStart(tx, {
          branchId: booking.branchId,
          items,
          start: opts.start,
          excludeBookingId: booking.id,
          ignoreLead: opts.staff,
        });
        if (!slot) throw new BookingError("Ese horario no está disponible.", "SLOT_TAKEN");
        await tx.bookingItem.deleteMany({ where: { bookingId: booking.id } });
        return tx.booking.update({
          where: { id: booking.id },
          data: {
            startsAt: new Date(slot.start),
            endsAt: new Date(slot.end),
            // El precio se mantiene congelado salvo que cambie la especialista.
            totalCents: opts.stylistId !== undefined ? slot.totalCents : booking.totalCents,
            reminder24hSentAt: null,
            reminder2hSentAt: null,
            items: {
              create: itemRows(slot).map((row, idx) => ({
                ...row,
                priceCents: opts.stylistId !== undefined ? row.priceCents : (booking.items[idx]?.priceCents ?? row.priceCents),
              })),
            },
          },
          include: { items: { include: { service: true, stylist: true } }, branch: true, customer: true },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (err instanceof BookingError && err.code === "SLOT_TAKEN") {
      err.alternatives = await alternativesNear(prisma, booking.branchId, items, opts.start, booking.id);
    }
    throw err;
  }
}

export async function cancelBooking(prisma: Db, opts: { bookingId: string; reason?: string; staff?: boolean }) {
  const booking = await prisma.booking.findUnique({ where: { id: opts.bookingId }, include: { branch: true } });
  if (!booking) throw new BookingError("No encontré esa reserva.", "NOT_FOUND");
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) throw new BookingError("Esta reserva ya no se puede cancelar.", "TRANSITION");
  if (!opts.staff && !withinFreeWindow(booking.startsAt, booking.branch.cancelWindowHours)) {
    throw new BookingError(`Solo se puede cancelar sin cargo hasta ${booking.branch.cancelWindowHours} h antes.`, "POLICY");
  }
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: opts.reason ?? null },
    include: { items: true, branch: true },
  });
  const waitlist = await matchWaitlist(prisma, updated);
  return { booking: updated, waitlist };
}

/** Busca la entrada de lista de espera más antigua compatible con el hueco liberado y la marca como avisada. */
export async function matchWaitlist(
  prisma: Db,
  booking: { branchId: string; startsAt: Date; items: Array<{ serviceId: string; stylistId: string }> },
) {
  const serviceIds = booking.items.map((i) => i.serviceId);
  const stylistIds = booking.items.map((i) => i.stylistId);
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      branchId: booking.branchId,
      status: "WAITING",
      dateFrom: { lte: booking.startsAt },
      dateTo: { gte: booking.startsAt },
      serviceIds: { hasSome: serviceIds },
    },
    include: { customer: true, branch: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const match = entries.find((e) => !e.stylistId || stylistIds.includes(e.stylistId));
  if (!match) return null;
  await prisma.waitlistEntry.update({ where: { id: match.id }, data: { status: "NOTIFIED", notifiedAt: new Date() } });
  return match;
}

export async function updateBookingStatus(prisma: Db, opts: { bookingId: string; to: BookingStatus; isAdmin?: boolean }) {
  const booking = await prisma.booking.findUnique({ where: { id: opts.bookingId }, include: { items: true } });
  if (!booking) throw new BookingError("No encontré esa reserva.", "NOT_FOUND");
  if (!allowedTransitions(booking.status, opts.isAdmin).includes(opts.to)) {
    throw new BookingError(`No se puede pasar de ${STATUS_LABELS[booking.status]} a ${STATUS_LABELS[opts.to]}.`, "TRANSITION");
  }
  if (opts.to === "CANCELLED") return (await cancelBooking(prisma, { bookingId: booking.id, staff: true })).booking;

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: opts.to,
        confirmedAt: opts.to === "CONFIRMED" ? now : undefined,
        completedAt: opts.to === "COMPLETED" ? now : undefined,
      },
    });
    if (opts.to === "NO_SHOW") {
      await tx.customer.update({ where: { id: booking.customerId }, data: { noShowCount: { increment: 1 } } });
    } else if (booking.status === "NO_SHOW") {
      await tx.customer.update({ where: { id: booking.customerId }, data: { noShowCount: { decrement: 1 } } });
    }
    if (opts.to === "COMPLETED") await refreshPreferences(tx, booking.customerId);
    return updated;
  });
}

/** Sede y especialista preferidas = las más frecuentes de las últimas 10 citas completadas. */
async function refreshPreferences(tx: Tx, customerId: string) {
  const recent = await tx.booking.findMany({
    where: { customerId, status: "COMPLETED" },
    orderBy: { startsAt: "desc" },
    take: 10,
    select: { branchId: true, items: { select: { stylistId: true } } },
  });
  const top = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  await tx.customer.update({
    where: { id: customerId },
    data: {
      preferredBranchId: top(recent.map((r) => r.branchId)),
      preferredStylistId: top(recent.flatMap((r) => r.items.map((i) => i.stylistId))),
    },
  });
}
