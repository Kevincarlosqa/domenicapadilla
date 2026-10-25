import "server-only";
import type { Db } from "./prisma";
import { config } from "./config";
import { insideWindow, sendOutbound } from "./conversations";
import { humanDateTime } from "./time";
import { sendTemplate } from "./whatsapp";

const HOUR = 3_600_000;

/**
 * Envía recordatorios de 24 h y 2 h. Idempotente gracias a reminder24hSentAt / reminder2hSentAt.
 * Dentro de la ventana de 24 h usa botones interactivos; fuera, la plantilla aprobada.
 */
export async function sendDueReminders(prisma: Db, now = new Date()) {
  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      OR: [{ reminder24hSentAt: null }, { reminder2hSentAt: null, startsAt: { lte: new Date(now.getTime() + 2 * HOUR) } }],
    },
    include: { customer: true, branch: true, items: { include: { service: true, stylist: true }, orderBy: { position: "asc" } } },
    take: 200,
  });
  let sent = 0;
  for (const b of due) {
    const twoHour = b.startsAt.getTime() - now.getTime() <= 2 * HOUR;
    if (twoHour && b.reminder2hSentAt) continue;
    if (!twoHour && b.reminder24hSentAt) continue;
    const when = humanDateTime(b.startsAt, b.branch.timezone);
    const services = b.items.map((i) => `${i.service.name} con ${i.stylist.name}`).join(" + ");
    const first = b.customer.name?.split(" ")[0];
    const body = twoHour
      ? `${first ? `${first}, ` : ""}te esperamos en 2 horas ✨\n${services}\n📍 ${b.branch.name} — ${b.branch.address}`
      : `¡Hola${first ? `, ${first}` : ""}! Te recordamos tu cita de mañana ✨\n${services}\n🗓️ ${when}\n📍 ${b.branch.name} — ${b.branch.address}\nCódigo: ${b.code}`;

    const conversation = await prisma.conversation.upsert({
      where: { phone: b.customer.phone },
      create: { phone: b.customer.phone, customerId: b.customerId, branchId: b.branchId },
      update: {},
    });
    try {
      if (insideWindow(conversation)) {
        await sendOutbound(
          prisma,
          conversation,
          {
            type: "buttons",
            body,
            buttons: [
              { id: `r:confirm:${b.id}`, title: "Confirmar" },
              { id: `r:resched:${b.id}`, title: "Reprogramar" },
              { id: `r:cancel:${b.id}`, title: "Cancelar" },
            ],
          },
          "SYSTEM",
        );
      } else {
        if (config.whatsappEnabled) {
          await sendTemplate(b.customer.phone, config.WHATSAPP_TEMPLATE_REMINDER, [first ?? "", services, when, `${b.branch.name} — ${b.branch.address}`], [`r:confirm:${b.id}`, `r:resched:${b.id}`, `r:cancel:${b.id}`]);
        }
        await prisma.message.create({ data: { conversationId: conversation.id, direction: "OUT", author: "SYSTEM", type: "template", body, status: config.whatsappEnabled ? "template" : "simulated" } });
      }
      await prisma.booking.update({ where: { id: b.id }, data: twoHour ? { reminder2hSentAt: now, reminder24hSentAt: b.reminder24hSentAt ?? now } : { reminder24hSentAt: now } });
      sent++;
    } catch (err) {
      console.error(`[reminders] ${b.code}`, err);
    }
  }
  return { checked: due.length, sent };
}
