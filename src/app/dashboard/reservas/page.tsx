import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { BookingChannel, BookingStatus } from "@/generated/prisma/enums";
import { NewBookingButton, StatusActions } from "@/components/dashboard/booking-actions";
import { Card, EmptyState, PageHeader, StatusBadge, inputClass } from "@/components/dashboard/ui";
import { bookingScope, requireUser } from "@/lib/auth";
import { formCatalog, getSelectedBranch } from "@/lib/dashboard";
import { CHANNEL_LABELS, STATUS_LABELS } from "@/lib/labels";
import { db } from "@/lib/prisma";
import { addDaysKey, formatLocal, localDateKey, wallToUtc } from "@/lib/time";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Reservas" };
const PAGE = 40;
const TZ = "America/Lima";

export default async function ReservasPage({ searchParams }: PageProps<"/dashboard/reservas">) {
  const user = await requireUser(["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"]);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = localDateKey(new Date(), TZ);
  const q = str("q").trim();
  const status = (Object.values(BookingStatus) as string[]).includes(str("estado")) ? (str("estado") as BookingStatus) : undefined;
  const channel = (Object.values(BookingChannel) as string[]).includes(str("canal")) ? (str("canal") as BookingChannel) : undefined;
  const stylistId = str("especialista") || undefined;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str("desde")) ? str("desde") : q ? "" : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(str("hasta")) ? str("hasta") : q ? "" : addDaysKey(today, 14);
  const page = Math.max(1, Number(str("p")) || 1);
  const selected = await getSelectedBranch(user);
  const prisma = await db();

  const where: Prisma.BookingWhereInput = {
    ...bookingScope(user, selected),
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(stylistId ? { items: { some: { stylistId } } } : {}),
    ...(from || to ? { startsAt: { ...(from ? { gte: wallToUtc(from, 0, TZ) } : {}), ...(to ? { lt: wallToUtc(addDaysKey(to, 1), 0, TZ) } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q.toUpperCase() } },
            { customer: { phone: { contains: q.replace(/\s/g, "") } } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total, stylists, catalog] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { customer: true, branch: true, items: { include: { service: true, stylist: true }, orderBy: { position: "asc" } } },
      orderBy: { startsAt: q || from === today ? "asc" : "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.booking.count({ where }),
    prisma.stylist.findMany({ where: { active: true, ...(user.branchIds ? { schedules: { some: { branchId: { in: user.branchIds } } } } : {}) }, orderBy: { name: "asc" } }),
    formCatalog(user),
  ]);

  const params = new URLSearchParams(Object.entries({ q, estado: status ?? "", canal: channel ?? "", especialista: stylistId ?? "", desde: from, hasta: to }).filter(([, v]) => v));
  const pageHref = (p: number) => `/dashboard/reservas?${new URLSearchParams([...params, ["p", String(p)]])}`;

  return (
    <>
      <PageHeader title="Reservas" description={`${total.toLocaleString("es-PE")} resultados`} actions={<NewBookingButton catalog={catalog} defaultBranchId={selected !== "all" ? selected : undefined} today={today} />} />

      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <input name="q" defaultValue={q} placeholder="Código, teléfono o nombre" aria-label="Buscar" className={cn(inputClass, "lg:col-span-2")} />
          <select name="estado" defaultValue={status ?? ""} aria-label="Estado" className={inputClass}>
            <option value="">Todos los estados</option>
            {Object.values(BookingStatus).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select name="canal" defaultValue={channel ?? ""} aria-label="Canal" className={inputClass}>
            <option value="">Todos los canales</option>
            {Object.values(BookingChannel).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          <select name="especialista" defaultValue={stylistId ?? ""} aria-label="Especialista" className={inputClass}>
            <option value="">Todas las especialistas</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 sm:col-span-2">
            <input type="date" name="desde" defaultValue={from} aria-label="Desde" className={inputClass} />
            <input type="date" name="hasta" defaultValue={to} aria-label="Hasta" className={inputClass} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button className="h-9 rounded-full bg-ink px-4 text-sm font-medium text-paper">Filtrar</button>
            <Link href="/dashboard/reservas" className="flex h-9 items-center rounded-full px-4 text-sm text-muted hover:bg-sand">
              Limpiar
            </Link>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Sin reservas con esos filtros" icon={<CalendarX className="h-8 w-8" />}>
          Cambia las fechas o crea una nueva reserva.
        </EmptyState>
      ) : (
        <Card className="p-0 md:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Cuándo</th>
                  <th className="px-4 py-3 font-medium">Clienta</th>
                  <th className="px-4 py-3 font-medium">Servicios</th>
                  <th className="px-4 py-3 font-medium">Sede</th>
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-line/60 align-top last:border-0 hover:bg-ivory/60">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <p className="font-medium capitalize">{formatLocal(b.startsAt, b.branch.timezone, "EEE d MMM")}</p>
                      <p className="text-xs text-muted">
                        {formatLocal(b.startsAt, b.branch.timezone, "HH:mm")}–{formatLocal(b.endsAt, b.branch.timezone, "HH:mm")} · {b.code}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/clientes/${b.customerId}`} className="font-medium hover:underline">
                        {b.customer.name ?? "Sin nombre"}
                      </Link>
                      <p className="text-xs text-muted tabular-nums">{b.customer.phone}</p>
                      {b.customer.noShowCount >= 2 ? <p className="text-[11px] text-warning">⚠︎ {b.customer.noShowCount} no-shows</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      {b.items.map((i) => (
                        <p key={i.id}>
                          {i.service.name} <span className="text-xs text-muted">· {i.stylist.name}</span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3">{b.branch.name}</td>
                    <td className="px-4 py-3 text-xs">{CHANNEL_LABELS[b.channel]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(b.totalCents)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} label={STATUS_LABELS[b.status]} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusActions bookingId={b.id} status={b.status} isAdmin={user.branchIds === null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAGE ? (
            <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Paginación">
              <span className="text-muted">
                Página {page} de {Math.ceil(total / PAGE)}
              </span>
              <div className="flex gap-2">
                {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-full border border-line px-3 py-1 hover:bg-sand">Anterior</Link> : null}
                {page * PAGE < total ? <Link href={pageHref(page + 1)} className="rounded-full border border-line px-3 py-1 hover:bg-sand">Siguiente</Link> : null}
              </div>
            </nav>
          ) : null}
        </Card>
      )}
    </>
  );
}
