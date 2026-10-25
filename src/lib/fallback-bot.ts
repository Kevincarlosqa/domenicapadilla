import "server-only";
import type { Db } from "./prisma";
import { getAvailability } from "./availability";
import { BookingError, createBooking } from "./booking";
import { branchCatalog, listActiveBranches, nearestBranches } from "./catalog";
import { CATEGORY_LABELS } from "./labels";
import { addDaysKey, formatLocal, humanDateTime, localDateKey } from "./time";
import { formatMoney, formatPrice } from "./utils";
import type { Outbound } from "./whatsapp";

/**
 * Flujo guiado por botones cuando no hay ANTHROPIC_API_KEY (o si la IA falla).
 * El estado viaja en el id de cada opción: fb:<paso>:<datos>.
 */
export async function runFallbackBot(
  prisma: Db,
  input: { phone: string; text: string; replyId?: string; location?: { lat: number; lng: number }; conversationId: string },
): Promise<Outbound[]> {
  const id = input.replyId ?? "";
  const [, step, ...rest] = id.split(":");

  if (input.location) {
    const near = (await nearestBranches(prisma, input.location)).slice(0, 3);
    return [{ type: "buttons", body: "Estas son las sedes más cercanas a ti ✨", buttons: near.map((b) => ({ id: `fb:b:${b.id}`, title: `${b.name} · ${b.distanceKm} km` })) }];
  }

  if ((step === "b" || step === "k") && rest[0]) {
    const branch = await prisma.branch.findUnique({ where: { id: rest[0] } });
    if (!branch) return [];
    const catalog = await branchCatalog(prisma, branch.id);
    const category = step === "k" ? rest[1] : undefined;
    const categories = [...new Set(catalog.map((s) => s.category))];
    // WhatsApp admite 10 filas por lista: primero la categoría, luego los servicios.
    if (!category && catalog.length > 10) {
      return [
        {
          type: "list",
          body: `Sede ${branch.name} — ${branch.address}. ¿Qué te gustaría hacerte?`,
          button: "Ver categorías",
          sections: [{ title: "Categorías", rows: categories.map((c) => ({ id: `fb:k:${branch.id}:${c}`, title: CATEGORY_LABELS[c], description: catalog.filter((s) => s.category === c).map((s) => s.name).join(", ") })) }],
        },
      ];
    }
    return [
      {
        type: "list",
        body: category ? `${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]} en ${branch.name}:` : `Sede ${branch.name} — ${branch.address}. ¿Qué servicio te gustaría?`,
        button: "Ver servicios",
        sections: [
          {
            title: "Servicios",
            rows: catalog
              .filter((s) => !category || s.category === category)
              .slice(0, 10)
              .map((s) => ({ id: `fb:s:${branch.id}:${s.id}`, title: s.name, description: `${formatPrice(s.priceCents, s.priceFrom)} · ${s.durationMin} min` })),
          },
        ],
      },
    ];
  }

  if (step === "s" && rest[1]) {
    const [branchId, serviceId] = rest as [string, string];
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const from = localDateKey(new Date(), branch.timezone);
    const { days, timezone } = await getAvailability(prisma, { branchId, items: [{ serviceId }], fromKey: from, toKey: addDaysKey(from, 7) });
    const slots = days.flatMap((d) => d.slots.slice(0, 1).concat(d.slots.slice(Math.floor(d.slots.length / 2), Math.floor(d.slots.length / 2) + 1))).slice(0, 3);
    if (!slots.length) return [{ type: "text", body: "No encontré horarios en los próximos 7 días para ese servicio. Una asesora te escribirá para buscar alternativas 💞" }];
    return [
      {
        type: "buttons",
        body: `Estos son los próximos horarios disponibles (${slots[0]!.items[0]!.name}):`,
        buttons: slots.map((s) => ({ id: `fb:t:${branchId}:${serviceId}:${s.start}:${s.items[0]!.stylistId}`, title: formatLocal(s.start, timezone, "EEE d MMM · HH:mm") })),
      },
    ];
  }

  if ((step === "t" || step === "c") && rest[3]) {
    const [branchId, serviceId, startMs, stylistId] = rest as [string, string, string, string];
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const [service, stylist] = await Promise.all([prisma.service.findUniqueOrThrow({ where: { id: serviceId } }), prisma.stylist.findUniqueOrThrow({ where: { id: stylistId } })]);
    const start = new Date(Number(startMs));
    if (step === "t") {
      const catalog = await branchCatalog(prisma, branchId);
      const price = catalog.find((s) => s.id === serviceId)?.priceCents ?? service.priceCents;
      return [
        {
          type: "buttons",
          body: `Te confirmo el resumen:\n\n📍 ${branch.name} — ${branch.address}\n💆 ${service.name} con ${stylist.name}\n🗓️ ${humanDateTime(start, branch.timezone)}\n💳 ${formatMoney(price)}\n\n¿Lo reservo?`,
          buttons: [
            { id: `fb:c:${branchId}:${serviceId}:${startMs}:${stylistId}`, title: "Confirmar" },
            { id: `fb:s:${branchId}:${serviceId}`, title: "Otro horario" },
          ],
        },
      ];
    }
    try {
      const b = await createBooking(prisma, { branchId, phone: input.phone, items: [{ serviceId, stylistId }], start, channel: "WHATSAPP" });
      await prisma.conversation.update({ where: { id: input.conversationId }, data: { customerId: b.customerId, branchId } });
      return [{ type: "text", body: `¡Listo! ✨ Tu cita quedó ${b.status === "PENDING" ? "registrada (una asesora la confirmará)" : "confirmada"}.\nCódigo: ${b.code}\n${humanDateTime(b.startsAt, branch.timezone)} en ${branch.name}.\nPuedes cambiarla gratis hasta ${branch.cancelWindowHours} h antes.` }];
    } catch (e) {
      if (e instanceof BookingError) return [{ type: "text", body: `${e.message} Elige otro horario 💞` }, ...(await runFallbackBot(prisma, { ...input, replyId: `fb:s:${branchId}:${serviceId}` }))];
      throw e;
    }
  }

  // Inicio: sede habitual o lista de sedes.
  const customer = await prisma.customer.findUnique({ where: { phone: input.phone }, include: { preferredBranch: true } });
  const branches = await listActiveBranches(prisma);
  const greeting = customer?.name ? `¡Hola, ${customer.name.split(" ")[0]}! ✨` : "¡Hola! Bienvenida a Doménica Padilla ✨";
  if (customer?.preferredBranch && id !== "fb:all") {
    return [{ type: "buttons", body: `${greeting} ¿Agendamos en tu sede de siempre?`, buttons: [{ id: `fb:b:${customer.preferredBranch.id}`, title: customer.preferredBranch.name }, { id: "fb:all", title: "Otra sede" }] }];
  }
  return [
    {
      type: "list",
      body: `${greeting} Soy Domi y te ayudo a reservar. ¿En qué sede te atendemos? También puedes compartir tu ubicación 📍`,
      button: "Elegir sede",
      sections: [{ title: "Sedes", rows: branches.map((b) => ({ id: `fb:b:${b.id}`, title: b.name, description: `${b.district} · ${b.address}` })) }],
    },
  ];
}
