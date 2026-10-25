import "server-only";
import type { Conversation, Prisma } from "@/generated/prisma/client";
import type { Db } from "./prisma";
import { config } from "./config";
import { maybeSummarize, runAgent } from "./ai-agent";
import { runFallbackBot } from "./fallback-bot";
import { humanDateTime } from "./time";
import { markRead, outboundText, sendTemplate, sendWhatsApp, type Inbound, type Outbound } from "./whatsapp";

const SIM_PREFIX = "sim:";
export const simulatorKey = (phone: string) => `${SIM_PREFIX}${phone}`;
/** Teléfono real de la clienta (sin el prefijo del simulador). */
export const customerPhone = (c: Pick<Conversation, "phone">) => (c.phone.startsWith(SIM_PREFIX) ? c.phone.slice(SIM_PREFIX.length) : c.phone);

const WINDOW_MS = 24 * 3_600_000;
export const insideWindow = (c: Pick<Conversation, "lastInboundAt" | "isSimulator">) =>
  c.isSimulator || (c.lastInboundAt != null && Date.now() - c.lastInboundAt.getTime() < WINDOW_MS);

/** Envía (si corresponde) y guarda un mensaje saliente. */
export async function sendOutbound(
  prisma: Db,
  conversation: Conversation,
  msg: Outbound,
  author: "BOT" | "STAFF" | "SYSTEM",
  authorUserId?: string,
) {
  let waMessageId: string | null = null;
  let status = "simulated";
  if (!conversation.isSimulator && config.whatsappEnabled) {
    try {
      waMessageId = await sendWhatsApp(customerPhone(conversation), msg);
      status = "sent";
    } catch (err) {
      console.error("[whatsapp] envío fallido", err);
      status = "failed";
    }
  }
  const created = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUT",
      author,
      type: msg.type,
      body: outboundText(msg),
      payload: msg as unknown as Prisma.InputJsonValue,
      waMessageId,
      status,
      authorUserId: authorUserId ?? null,
    },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: created.createdAt } });
  return created;
}

/**
 * Registra un mensaje entrante. Devuelve null si ya se había procesado (Meta reintenta webhooks).
 */
export async function recordInbound(prisma: Db, inbound: Inbound, opts: { simulator?: boolean } = {}) {
  const phone = opts.simulator ? simulatorKey(inbound.from) : inbound.from;
  if (await prisma.message.findUnique({ where: { waMessageId: inbound.waMessageId }, select: { id: true } })) return null;

  const customer = await prisma.customer.findUnique({ where: { phone: inbound.from } });
  if (customer && !customer.name && inbound.name) await prisma.customer.update({ where: { id: customer.id }, data: { name: inbound.name } });
  const now = new Date(inbound.timestamp || Date.now());
  const conversation = await prisma.conversation.upsert({
    where: { phone },
    create: {
      phone,
      isSimulator: Boolean(opts.simulator),
      customerId: customer?.id,
      branchId: customer?.preferredBranchId,
      lastInboundAt: now,
      lastMessageAt: now,
      unreadCount: 1,
    },
    update: {
      lastInboundAt: now,
      lastMessageAt: now,
      unreadCount: { increment: 1 },
      ...(customer ? { customerId: customer.id } : {}),
      // Una conversación cerrada vuelve a quedar en manos del bot.
    },
  });
  if (conversation.status === "CLOSED") await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "BOT", aiPaused: false } });

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "IN",
        author: "CUSTOMER",
        type: inbound.type,
        body: inbound.text,
        payload: { replyId: inbound.replyId, location: inbound.location } as Prisma.InputJsonValue,
        waMessageId: inbound.waMessageId,
        createdAt: now,
      },
    });
  } catch (err) {
    // Carrera entre dos reintentos simultáneos: el índice único decide.
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }
  return prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
}

/** Respuesta automática a una conversación (IA o flujo de respaldo). */
export async function respond(prisma: Db, conversationId: string, inbound: Inbound) {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (conversation.aiPaused || conversation.status === "HUMAN") return;
  if (!conversation.isSimulator) void markRead(inbound.waMessageId);

  const phone = customerPhone(conversation);
  if (inbound.replyId?.startsWith("r:")) {
    const reply = await handleReminderReply(prisma, phone, inbound.replyId);
    if (reply) {
      await sendOutbound(prisma, conversation, reply, "BOT");
      return;
    }
  }
  let outbox: Outbound[] = [];
  const useFallback = !config.aiEnabled || inbound.replyId?.startsWith("fb:");
  try {
    outbox = useFallback
      ? await runFallbackBot(prisma, { phone, text: inbound.text, replyId: inbound.replyId, location: inbound.location, conversationId })
      : await runAgent(prisma, conversationId, phone);
  } catch (err) {
    console.error("[bot] error", err);
    outbox = [{ type: "text", body: "Uy, tuve un problema para responder. Una asesora te escribirá en breve 💞" }];
    await prisma.conversation.update({ where: { id: conversationId }, data: { aiPaused: true, status: "HUMAN" } });
  }
  for (const msg of outbox) await sendOutbound(prisma, conversation, msg, "BOT");
  if (!useFallback) await maybeSummarize(prisma, conversationId).catch((e) => console.error("[ai] resumen", e));
}

/** Botones de los recordatorios: r:confirm:<id>, r:cancel:<id>, r:resched:<id>. */
async function handleReminderReply(prisma: Db, phone: string, replyId: string): Promise<Outbound | null> {
  const [, action, bookingId] = replyId.split(":");
  if (!bookingId) return null;
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, customer: { phone } }, include: { branch: true } });
  if (!booking) return { type: "text", body: "No encontré esa cita a tu nombre. ¿Me compartes el código?" };
  const when = humanDateTime(booking.startsAt, booking.branch.timezone);
  if (action === "confirm") {
    if (booking.status === "PENDING") await prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    return { type: "text", body: `¡Gracias! Te esperamos el ${when} en ${booking.branch.name} ✨` };
  }
  if (action === "cancel") {
    const { cancelBooking, BookingError } = await import("./booking");
    try {
      const { waitlist } = await cancelBooking(prisma, { bookingId: booking.id, reason: "Cancelada desde el recordatorio" });
      if (waitlist) await notifyWaitlist(prisma, waitlist, booking.startsAt);
      return { type: "text", body: `Listo, cancelamos tu cita del ${when}. Cuando quieras volver a agendar, escríbenos 💞` };
    } catch (e) {
      if (e instanceof BookingError) return { type: "text", body: `${e.message} Una asesora te ayudará con el cambio.` };
      throw e;
    }
  }
  if (action === "resched") {
    return { type: "text", body: `Claro. ¿Para qué día y hora te gustaría mover tu cita del ${when} (código ${booking.code})?` };
  }
  return null;
}

/** Aviso a la primera clienta de la lista de espera cuando se libera un hueco. */
export async function notifyWaitlist(
  prisma: Db,
  entry: { id: string; customer: { phone: string; name: string | null }; branch: { id: string; name: string; timezone: string } },
  freedAt: Date,
) {
  const text = `¡Hola${entry.customer.name ? `, ${entry.customer.name.split(" ")[0]}` : ""}! ✨ Se liberó un espacio en ${entry.branch.name} el ${humanDateTime(freedAt, entry.branch.timezone)}. ¿Te lo reservamos? Responde a este mensaje y lo vemos al toque.`;
  const conversation = await prisma.conversation.upsert({
    where: { phone: entry.customer.phone },
    create: { phone: entry.customer.phone, branchId: entry.branch.id },
    update: {},
  });
  if (insideWindow(conversation)) {
    await sendOutbound(prisma, conversation, { type: "text", body: text }, "SYSTEM");
  } else if (config.whatsappEnabled) {
    await sendTemplate(entry.customer.phone, "lista_espera_hueco", [entry.branch.name, humanDateTime(freedAt, entry.branch.timezone)]).catch((e) => console.error("[whatsapp] plantilla", e));
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "OUT", author: "SYSTEM", type: "template", body: text, status: "template" } });
  }
}
