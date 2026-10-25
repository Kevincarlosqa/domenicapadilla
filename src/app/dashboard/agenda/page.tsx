import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AgendaDay, AgendaWeek, type AgendaColumn } from "@/components/dashboard/agenda";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { BLOCKING_STATUSES } from "@/lib/availability";
import { requireUser } from "@/lib/auth";
import { formCatalog, getSelectedBranch, visibleBranches } from "@/lib/dashboard";
import { db } from "@/lib/prisma";
import { addDaysKey, formatLocal, localDateKey, minutesOfDay, wallToUtc, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/dashboard/agenda">) {
  const user = await requireUser();
  const sp = await searchParams;
  const branches = await visibleBranches(user);
  const selected = await getSelectedBranch(user);
  const branchParam = typeof sp.sede === "string" ? sp.sede : undefined;
  if (!branches[0]) return <EmptyState title="No tienes sedes asignadas" />;
  const today = localDateKey(new Date(), branches[0].timezone);
  const date = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const view = sp.v === "semana" ? "semana" : "dia";
  const prisma = await db();
  // Una especialista abre por defecto la sede donde trabaja ese día.
  let defaultBranch = selected !== "all" ? selected : undefined;
  if (!branchParam && user.role === "STYLIST" && user.stylistId) {
    const shift = await prisma.stylistSchedule.findFirst({ where: { stylistId: user.stylistId, weekday: weekdayOf(date) }, orderBy: { startMin: "asc" } });
    defaultBranch = shift?.branchId ?? defaultBranch;
  }
  const branch = branches.find((b) => b.id === (branchParam ?? defaultBranch)) ?? branches[0];
  const tz = branch.timezone;

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ d: date, v: view, sede: branch.id, ...over });
    return `/dashboard/agenda?${p}`;
  };
  const step = view === "semana" ? 7 : 1;
  const header = (
    <PageHeader
      title="Agenda"
      description={`${branch.name} · ${formatLocal(wallToUtc(date, 12 * 60, tz), tz, view === "semana" ? "'Semana del' d 'de' MMMM" : "EEEE d 'de' MMMM yyyy")}`}
      actions={
        <>
          {branches.length > 1 ? (
            <nav aria-label="Sede de la agenda" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
              {branches.map((b) => (
                <Link key={b.id} href={qs({ sede: b.id })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap", b.id === branch.id ? "bg-ink text-paper" : "hover:bg-sand")}>
                  {b.name}
                </Link>
              ))}
            </nav>
          ) : null}
          <div className="flex items-center rounded-full border border-line bg-paper p-1">
            <Link href={qs({ d: addDaysKey(date, -step) })} className="rounded-full p-1.5 hover:bg-sand" aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link href={qs({ d: today })} className="rounded-full px-3 py-1 text-xs font-medium hover:bg-sand">
              Hoy
            </Link>
            <Link href={qs({ d: addDaysKey(date, step) })} className="rounded-full p-1.5 hover:bg-sand" aria-label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex rounded-full border border-line bg-paper p-1">
            {(["dia", "semana"] as const).map((v) => (
              <Link key={v} href={qs({ v })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium", view === v ? "bg-ink text-paper" : "hover:bg-sand")}>
                {v === "dia" ? "Día" : "Semana"}
              </Link>
            ))}
          </div>
        </>
      }
    />
  );

  const stylistFilter = user.role === "STYLIST" && user.stylistId ? { id: user.stylistId } : {};

  if (view === "semana") {
    const days = Array.from({ length: 7 }, (_, i) => addDaysKey(date, i));
    const from = wallToUtc(days[0]!, 0, tz);
    const to = wallToUtc(addDaysKey(days[6]!, 1), 0, tz);
    const items = await prisma.bookingItem.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        booking: { branchId: branch.id, status: { not: "CANCELLED" } },
        ...(user.role === "STYLIST" && user.stylistId ? { stylistId: user.stylistId } : {}),
      },
      include: { booking: { include: { customer: true } }, service: true, stylist: true },
      orderBy: { startsAt: "asc" },
    });
    return (
      <>
        {header}
        <AgendaWeek
          days={days.map((d) => ({
            date: d,
            label: formatLocal(wallToUtc(d, 12 * 60, tz), tz, "EEE d"),
            isToday: d === today,
            href: qs({ d, v: "dia" }),
            items: items
              .filter((i) => localDateKey(i.startsAt, tz) === d)
              .map((i) => ({
                id: i.id,
                time: formatLocal(i.startsAt, tz, "HH:mm"),
                title: i.booking.customer.name ?? i.booking.customer.phone,
                subtitle: `${i.service.name} · ${i.stylist.name}`,
                status: i.booking.status,
              })),
          }))}
        />
      </>
    );
  }

  const wd = weekdayOf(date);
  const dayStart = wallToUtc(date, 0, tz);
  const dayEnd = wallToUtc(addDaysKey(date, 1), 0, tz);
  const [hours, stylists, closures] = await Promise.all([
    prisma.branchHours.findMany({ where: { branchId: branch.id, weekday: wd } }),
    prisma.stylist.findMany({
      where: { active: true, schedules: { some: { branchId: branch.id, weekday: wd } }, ...stylistFilter },
      include: {
        schedules: { where: { weekday: wd } },
        timeOff: { where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } },
        bookingItems: {
          where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart }, booking: { status: { in: [...BLOCKING_STATUSES, "COMPLETED", "NO_SHOW"] } } },
          include: { booking: { include: { customer: true, branch: true } }, service: true },
        },
      },
      orderBy: [{ level: "desc" }, { name: "asc" }],
    }),
    prisma.branchClosure.findMany({ where: { branchId: branch.id, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
  ]);

  const clampMin = (d: Date) => (d <= dayStart ? 0 : d >= dayEnd ? 24 * 60 : minutesOfDay(d, tz));
  const openMin = Math.min(...hours.map((h) => h.startMin), ...stylists.flatMap((s) => s.schedules.map((x) => x.startMin)), 9 * 60);
  const closeMin = Math.max(...hours.map((h) => h.endMin), ...stylists.flatMap((s) => s.schedules.map((x) => x.endMin)), 19 * 60);

  const columns: AgendaColumn[] = stylists.map((s) => ({
    id: s.id,
    name: s.name,
    title: s.title,
    ranges: s.schedules.filter((x) => x.branchId === branch.id).map((x) => ({ start: x.startMin, end: x.endMin })),
    elsewhere: s.schedules.filter((x) => x.branchId !== branch.id).map((x) => ({ start: x.startMin, end: x.endMin })),
    blocks: s.timeOff.map((t) => ({ start: clampMin(t.startsAt), end: clampMin(t.endsAt), label: t.reason ?? "Bloqueo" })),
    items: s.bookingItems.map((i) => ({
      id: i.id,
      bookingId: i.bookingId,
      code: i.booking.code,
      start: clampMin(i.startsAt),
      end: clampMin(i.endsAt),
      buffer: Math.round((i.busyUntil.getTime() - i.endsAt.getTime()) / 60000),
      processing: i.processingStart && i.processingEnd ? { start: clampMin(i.processingStart), end: clampMin(i.processingEnd) } : null,
      status: i.booking.status,
      customer: i.booking.customer.name ?? i.booking.customer.phone,
      service: i.service.name,
      otherBranch: i.booking.branchId !== branch.id ? i.booking.branch.name : null,
      noShows: i.booking.customer.noShowCount,
    })),
  }));

  const canEdit = user.role !== "STYLIST";
  return (
    <>
      {header}
      {closures.length ? (
        <p className="mb-4 rounded-xl bg-[#fbecd6] px-4 py-2 text-sm text-[#5e3a0c]">Cierre: {closures.map((c) => c.reason).join(" · ")}</p>
      ) : null}
      {columns.length === 0 ? (
        <EmptyState title="Nadie trabaja este día en esta sede">Cambia de fecha o revisa los horarios en Configuración.</EmptyState>
      ) : (
        <AgendaDay
          date={date}
          dayStartMs={dayStart.getTime()}
          openMin={Math.floor(openMin / 60) * 60}
          closeMin={Math.ceil(closeMin / 60) * 60}
          nowMin={date === today ? minutesOfDay(new Date(), tz) : null}
          columns={columns}
          canEdit={canEdit}
          branchId={branch.id}
          catalog={canEdit ? await formCatalog(user) : null}
        />
      )}
    </>
  );
}
