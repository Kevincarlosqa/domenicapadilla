import "server-only";
import type { BookingChannel, ServiceCategory } from "@/generated/prisma/client";
import type { Db } from "./prisma";
import { addDaysKey, localDateKey, minutesOfDay, wallToUtc, weekdayOf } from "./time";

const TZ = "America/Lima";
const DAY = 86_400_000;

export interface MetricsScope {
  branchIds?: string[];
  stylistId?: string | null;
}

export interface Kpis {
  bookings: number;
  revenueCents: number;
  avgTicketCents: number;
  occupancy: number;
  noShowRate: number;
  newCustomers: number;
  returningCustomers: number;
}

export type Period = "7d" | "30d" | "90d";
export const PERIOD_DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };

function rangeFor(days: number, offsetDays = 0) {
  const todayKey = localDateKey(new Date(), TZ);
  const endKey = addDaysKey(todayKey, 1 - offsetDays);
  const startKey = addDaysKey(endKey, -days);
  return { startKey, endKey, from: wallToUtc(startKey, 0, TZ), to: wallToUtc(endKey, 0, TZ) };
}

async function load(prisma: Db, scope: MetricsScope, from: Date, to: Date) {
  return prisma.booking.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      ...(scope.stylistId ? { items: { some: { stylistId: scope.stylistId } } } : {}),
    },
    select: {
      id: true,
      status: true,
      channel: true,
      startsAt: true,
      totalCents: true,
      customerId: true,
      branchId: true,
      items: { select: { stylistId: true, serviceId: true, durationMin: true, priceCents: true } },
    },
  });
}

type Loaded = Awaited<ReturnType<typeof load>>;

/** Minutos de agenda programados para las especialistas en el rango. */
async function scheduledMinutes(prisma: Db, scope: MetricsScope, startKey: string, days: number) {
  const schedules = await prisma.stylistSchedule.findMany({
    where: { ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}), ...(scope.stylistId ? { stylistId: scope.stylistId } : {}), stylist: { active: true } },
  });
  const perStylist = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < days; i++) {
    const wd = weekdayOf(addDaysKey(startKey, i));
    for (const s of schedules) {
      if (s.weekday !== wd) continue;
      const m = s.endMin - s.startMin;
      total += m;
      perStylist.set(s.stylistId, (perStylist.get(s.stylistId) ?? 0) + m);
    }
  }
  return { total, perStylist };
}

function computeKpis(rows: Loaded, scheduled: number, firstBookingAt: Map<string, Date>, from: Date): Kpis {
  const active = rows.filter((b) => b.status !== "CANCELLED");
  const completed = rows.filter((b) => b.status === "COMPLETED");
  const noShows = rows.filter((b) => b.status === "NO_SHOW").length;
  const revenue = completed.reduce((a, b) => a + b.totalCents, 0);
  const bookedMin = active.reduce((a, b) => a + b.items.reduce((x, i) => x + i.durationMin, 0), 0);
  const customers = new Set(active.map((b) => b.customerId));
  let newCustomers = 0;
  for (const c of customers) if ((firstBookingAt.get(c)?.getTime() ?? 0) >= from.getTime()) newCustomers++;
  return {
    bookings: active.length,
    revenueCents: revenue,
    avgTicketCents: completed.length ? Math.round(revenue / completed.length) : 0,
    occupancy: scheduled ? Math.min(1, bookedMin / scheduled) : 0,
    noShowRate: completed.length + noShows ? noShows / (completed.length + noShows) : 0,
    newCustomers,
    returningCustomers: customers.size - newCustomers,
  };
}

export async function getDashboardMetrics(prisma: Db, scope: MetricsScope, period: Period) {
  const days = PERIOD_DAYS[period];
  const cur = rangeFor(days);
  const prev = rangeFor(days, days);
  const [rows, prevRows, sched, prevSched, branches, stylists, services] = await Promise.all([
    load(prisma, scope, cur.from, cur.to),
    load(prisma, scope, prev.from, prev.to),
    scheduledMinutes(prisma, scope, cur.startKey, days),
    scheduledMinutes(prisma, scope, prev.startKey, days),
    prisma.branch.findMany({ where: scope.branchIds ? { id: { in: scope.branchIds } } : {}, orderBy: { sortOrder: "asc" } }),
    prisma.stylist.findMany({ where: { active: true } }),
    prisma.service.findMany(),
  ]);

  const customerIds = [...new Set([...rows, ...prevRows].map((b) => b.customerId))];
  const firsts = await prisma.booking.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, status: { not: "CANCELLED" } }, _min: { startsAt: true } });
  const firstBookingAt = new Map(firsts.map((f) => [f.customerId, f._min.startsAt!]));

  const kpis = computeKpis(rows, sched.total, firstBookingAt, cur.from);
  const prevKpis = computeKpis(prevRows, prevSched.total, firstBookingAt, prev.from);

  // Serie diaria de ingresos y reservas
  const daily = new Map<string, { date: string; revenue: number; bookings: number }>();
  for (let i = 0; i < days; i++) {
    const k = addDaysKey(cur.startKey, i);
    daily.set(k, { date: k, revenue: 0, bookings: 0 });
  }
  for (const b of rows) {
    const d = daily.get(localDateKey(b.startsAt, TZ));
    if (!d) continue;
    if (b.status !== "CANCELLED") d.bookings++;
    if (b.status === "COMPLETED") d.revenue += b.totalCents / 100;
  }

  // Ingresos por sede
  const byBranch = branches.map((br) => {
    const own = rows.filter((b) => b.branchId === br.id);
    return {
      id: br.id,
      name: br.name,
      revenue: own.filter((b) => b.status === "COMPLETED").reduce((a, b) => a + b.totalCents, 0) / 100,
      bookings: own.filter((b) => b.status !== "CANCELLED").length,
    };
  });

  // Ranking de especialistas
  const futureByCustomer = new Map<string, number[]>();
  const later = await prisma.booking.findMany({
    where: { customerId: { in: customerIds }, startsAt: { gte: cur.from }, status: { not: "CANCELLED" } },
    select: { customerId: true, startsAt: true },
  });
  for (const l of later) futureByCustomer.set(l.customerId, [...(futureByCustomer.get(l.customerId) ?? []), l.startsAt.getTime()]);
  const stylistStats = new Map<string, { revenue: number; minutes: number; served: Set<string>; rebooked: Set<string> }>();
  for (const b of rows) {
    if (b.status === "CANCELLED") continue;
    for (const it of b.items) {
      if (scope.stylistId && it.stylistId !== scope.stylistId) continue;
      const st = stylistStats.get(it.stylistId) ?? { revenue: 0, minutes: 0, served: new Set(), rebooked: new Set() };
      st.minutes += it.durationMin;
      if (b.status === "COMPLETED") {
        st.revenue += it.priceCents;
        st.served.add(b.customerId);
        const t = b.startsAt.getTime();
        if ((futureByCustomer.get(b.customerId) ?? []).some((x) => x > t + DAY && x <= t + 60 * DAY)) st.rebooked.add(b.customerId);
      }
      stylistStats.set(it.stylistId, st);
    }
  }
  const stylistRanking = [...stylistStats.entries()]
    .map(([id, s]) => ({
      id,
      name: stylists.find((x) => x.id === id)?.name ?? "—",
      revenue: s.revenue / 100,
      occupancy: sched.perStylist.get(id) ? Math.min(1, s.minutes / sched.perStylist.get(id)!) : 0,
      rebooking: s.served.size ? s.rebooked.size / s.served.size : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Servicios top
  const svc = new Map<string, { count: number; revenue: number }>();
  for (const b of rows) {
    if (b.status === "CANCELLED") continue;
    for (const it of b.items) {
      const s = svc.get(it.serviceId) ?? { count: 0, revenue: 0 };
      s.count++;
      if (b.status === "COMPLETED") s.revenue += it.priceCents / 100;
      svc.set(it.serviceId, s);
    }
  }
  const topServices = [...svc.entries()]
    .map(([id, s]) => {
      const service = services.find((x) => x.id === id);
      return { id, name: service?.name ?? "—", category: (service?.category ?? "BROWS") as ServiceCategory, ...s };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Mapa de calor: día de la semana × hora (inicio de la cita, hora local)
  const heat: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 13 }, () => 0)); // 8:00–20:00
  for (const b of rows) {
    if (b.status === "CANCELLED") continue;
    const hour = Math.floor(minutesOfDay(b.startsAt, TZ) / 60);
    const wd = weekdayOf(localDateKey(b.startsAt, TZ));
    if (hour >= 8 && hour <= 20) heat[wd]![hour - 8]!++;
  }

  const byChannel = new Map<BookingChannel, number>();
  for (const b of rows) if (b.status !== "CANCELLED") byChannel.set(b.channel, (byChannel.get(b.channel) ?? 0) + 1);

  const categoryRevenue = new Map<ServiceCategory, number>();
  for (const t of topServices) categoryRevenue.set(t.category, (categoryRevenue.get(t.category) ?? 0) + t.revenue);

  return {
    period,
    range: { from: cur.startKey, to: addDaysKey(cur.endKey, -1) },
    kpis,
    prevKpis,
    daily: [...daily.values()],
    byBranch,
    stylistRanking,
    topServices,
    heat,
    byChannel: [...byChannel.entries()].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count),
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;
