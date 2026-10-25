import "server-only";
import type { Db, Tx } from "./prisma";
import { checkStart, slotsForDate, type EngineInput, type EngineItem, type Interval, type Slot } from "./availability-engine";
import { resolveItems } from "./catalog";
import { addDaysKey, localDateKey, wallToUtc } from "./time";
import { distanceKm } from "./utils";

export const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS"] as const;

export interface RequestedItem {
  serviceId: string;
  variantId?: string | null;
  stylistId?: string | null;
}

/** Segmentos ocupados de un BookingItem (sin la ventana de processing). */
function itemBusy(i: { startsAt: Date; busyUntil: Date; processingStart: Date | null; processingEnd: Date | null }): Interval[] {
  if (i.processingStart && i.processingEnd) {
    return [
      { start: i.startsAt.getTime(), end: i.processingStart.getTime() },
      { start: i.processingEnd.getTime(), end: i.busyUntil.getTime() },
    ];
  }
  return [{ start: i.startsAt.getTime(), end: i.busyUntil.getTime() }];
}

/**
 * Carga todo lo necesario para calcular disponibilidad de una sede entre dos fechas locales.
 * `excludeBookingId` permite reprogramar sin chocar con la propia reserva.
 */
export async function loadEngineInput(
  prisma: Db | Tx,
  opts: { branchId: string; items: EngineItem[]; fromKey: string; toKey: string; excludeBookingId?: string; now?: Date; ignoreLead?: boolean },
): Promise<EngineInput> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: opts.branchId }, include: { hours: true } });
  const tz = branch.timezone;
  // Un día de margen a cada lado cubre cualquier diferencia de zona horaria.
  const rangeStart = wallToUtc(addDaysKey(opts.fromKey, -1), 0, tz);
  const rangeEnd = wallToUtc(addDaysKey(opts.toKey, 2), 0, tz);
  const serviceIds = [...new Set(opts.items.map((i) => i.serviceId))];

  const [closures, stylists, items, bookings] = await Promise.all([
    prisma.branchClosure.findMany({ where: { branchId: branch.id, endsAt: { gt: rangeStart }, startsAt: { lt: rangeEnd } } }),
    prisma.stylist.findMany({
      where: { active: true, schedules: { some: { branchId: branch.id } }, services: { some: { serviceId: { in: serviceIds } } } },
      include: {
        schedules: { where: { branchId: branch.id } },
        services: { where: { serviceId: { in: serviceIds } } },
        timeOff: {
          where: { endsAt: { gt: rangeStart }, startsAt: { lt: rangeEnd }, OR: [{ branchId: null }, { branchId: branch.id }] },
        },
      },
    }),
    prisma.bookingItem.findMany({
      where: {
        startsAt: { lt: rangeEnd },
        busyUntil: { gt: rangeStart },
        booking: { status: { in: [...BLOCKING_STATUSES] }, ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}) },
      },
      select: { stylistId: true, startsAt: true, busyUntil: true, processingStart: true, processingEnd: true },
    }),
    prisma.booking.findMany({
      where: {
        branchId: branch.id,
        status: { in: [...BLOCKING_STATUSES] },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      select: { startsAt: true, items: { select: { busyUntil: true } } },
    }),
  ]);

  const busyByStylist = new Map<string, Interval[]>();
  for (const i of items) {
    const list = busyByStylist.get(i.stylistId) ?? [];
    list.push(...itemBusy(i));
    busyByStylist.set(i.stylistId, list);
  }

  return {
    branch,
    hours: branch.hours,
    closures: closures.map((c) => ({ start: c.startsAt.getTime(), end: c.endsAt.getTime() })),
    stylists: stylists.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      skills: new Map(s.services.map((x) => [x.serviceId, { durationMin: x.durationMin, priceCents: x.priceCents }])),
      schedules: s.schedules,
      timeOff: s.timeOff.map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() })),
      busy: busyByStylist.get(s.id) ?? [],
    })),
    stationUsage: bookings.map((b) => ({
      start: b.startsAt.getTime(),
      end: Math.max(...b.items.map((i) => i.busyUntil.getTime()), b.startsAt.getTime()),
    })),
    items: opts.items,
    now: (opts.now ?? new Date()).getTime(),
    ignoreLead: opts.ignoreLead,
  };
}

/** Horarios disponibles en una sede entre dos fechas locales (inclusive). */
export async function getAvailability(
  prisma: Db | Tx,
  opts: { branchId: string; items: RequestedItem[]; fromKey: string; toKey?: string; now?: Date; excludeBookingId?: string; ignoreLead?: boolean },
): Promise<{ timezone: string; days: Array<{ date: string; slots: Slot[] }> }> {
  const toKey = opts.toKey ?? opts.fromKey;
  const items = await resolveItems(prisma, opts.branchId, opts.items);
  const input = await loadEngineInput(prisma, { ...opts, items, toKey });
  const days: Array<{ date: string; slots: Slot[] }> = [];
  for (let key = opts.fromKey, n = 0; key <= toKey && n < 62; key = addDaysKey(key, 1), n++) {
    days.push({ date: key, slots: slotsForDate(input, key) });
  }
  return { timezone: input.branch.timezone, days };
}

/** Revalida un inicio concreto con datos frescos (se usa dentro de la transacción). */
export async function validateStart(
  prisma: Db | Tx,
  opts: { branchId: string; items: RequestedItem[]; start: Date; excludeBookingId?: string; ignoreLead?: boolean },
): Promise<{ slot: Slot | null; timezone: string }> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: opts.branchId }, select: { timezone: true } });
  const key = localDateKey(opts.start, branch.timezone);
  const items = await resolveItems(prisma, opts.branchId, opts.items);
  const input = await loadEngineInput(prisma, { ...opts, items, fromKey: key, toKey: key });
  return { slot: checkStart(input, key, opts.start.getTime()), timezone: branch.timezone };
}

/**
 * Primer hueco disponible en varias sedes (las más cercanas primero si hay coordenadas).
 * Devuelve como máximo un resultado por sede, ordenados por distancia y hora.
 */
export async function findFirstAvailable(
  prisma: Db | Tx,
  opts: { items: Array<Omit<RequestedItem, "stylistId">>; stylistId?: string | null; near?: { lat: number; lng: number }; branchIds?: string[]; days?: number; limit?: number },
) {
  const branches = await prisma.branch.findMany({
    where: { active: true, ...(opts.branchIds?.length ? { id: { in: opts.branchIds } } : {}) },
  });
  const ranked = branches
    .map((b) => ({ b, km: opts.near ? distanceKm(opts.near, b) : 0 }))
    .sort((x, y) => x.km - y.km)
    .slice(0, opts.limit ?? 4);

  const results = await Promise.all(
    ranked.map(async ({ b, km }) => {
      try {
        const from = localDateKey(new Date(), b.timezone);
        const to = addDaysKey(from, Math.min(opts.days ?? 14, b.maxDaysAhead));
        const { days } = await getAvailability(prisma, {
          branchId: b.id,
          items: opts.items.map((i) => ({ ...i, stylistId: opts.stylistId ?? null })),
          fromKey: from,
          toKey: to,
        });
        const first = days.flatMap((d) => d.slots)[0];
        return first ? { branch: b, distanceKm: Math.round(km * 10) / 10, slot: first } : null;
      } catch {
        return null; // la sede no ofrece el servicio
      }
    }),
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
