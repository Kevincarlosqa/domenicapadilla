import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardTitle, Delta, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { HBarChart, Heatmap, RevenueChart } from "@/components/dashboard/charts";
import { requireUser, scopeBranches } from "@/lib/auth";
import { getSelectedBranch } from "@/lib/dashboard";
import { CHANNEL_LABELS } from "@/lib/labels";
import { getDashboardMetrics, PERIOD_DAYS, type Period } from "@/lib/metrics";
import { db } from "@/lib/prisma";
import { cn, formatMoney } from "@/lib/utils";

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

export default async function DashboardHome({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  if (user.role === "RECEPTION") redirect("/dashboard/agenda");
  const sp = await searchParams;
  const period: Period = typeof sp.p === "string" && sp.p in PERIOD_DAYS ? (sp.p as Period) : "30d";
  const selected = await getSelectedBranch(user);
  const prisma = await db();
  const branchIds = scopeBranches(user, selected);
  const m = await getDashboardMetrics(prisma, { branchIds, stylistId: user.role === "STYLIST" ? user.stylistId : null }, period);
  const branchName = selected === "all" ? (user.branchIds ? "tus sedes" : "todas las sedes") : ((await prisma.branch.findUnique({ where: { id: selected } }))?.name ?? "");
  const k = m.kpis;
  const p = m.prevKpis;

  const kpis = [
    { label: "Ingresos", value: formatMoney(k.revenueCents), delta: <Delta current={k.revenueCents} previous={p.revenueCents} /> },
    { label: "Reservas", value: k.bookings.toLocaleString("es-PE"), delta: <Delta current={k.bookings} previous={p.bookings} /> },
    { label: "Ticket medio", value: formatMoney(k.avgTicketCents), delta: <Delta current={k.avgTicketCents} previous={p.avgTicketCents} /> },
    { label: "Ocupación", value: pct(k.occupancy), delta: <Delta current={k.occupancy} previous={p.occupancy} format="pts" /> },
    { label: "No-show", value: pct(k.noShowRate), delta: <Delta current={k.noShowRate} previous={p.noShowRate} format="pts" invert /> },
    {
      label: "Clientas nuevas / recurrentes",
      value: `${k.newCustomers} / ${k.returningCustomers}`,
      delta: <Delta current={k.newCustomers} previous={p.newCustomers} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={user.role === "STYLIST" ? `Hola, ${user.name.split(" ")[0]}` : "Resumen del negocio"}
        description={`${user.role === "STYLIST" ? "Tus números" : `Mostrando ${branchName}`} · ${m.range.from.split("-").reverse().join("/")} – ${m.range.to.split("-").reverse().join("/")} · comparado con el periodo anterior`}
        actions={
          <nav aria-label="Periodo" className="flex rounded-full border border-line bg-paper p-1">
            {(Object.keys(PERIOD_DAYS) as Period[]).map((key) => (
              <Link
                key={key}
                href={`/dashboard?p=${key}`}
                aria-current={period === key ? "true" : undefined}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium", period === key ? "bg-ink text-paper" : "text-ink-soft hover:bg-sand")}
              >
                {PERIOD_DAYS[key]} días
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex flex-col gap-2">
            <p className="text-xs text-muted">{kpi.label}</p>
            <p className="font-display text-3xl leading-none tabular-nums">{kpi.value}</p>
            {kpi.delta}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle hint="Reservas completadas, por fecha de la cita">Ingresos diarios</CardTitle>
          <RevenueChart data={m.daily} />
        </Card>
        <Card>
          <CardTitle hint="Reservas no canceladas">Reservas por canal</CardTitle>
          {m.byChannel.length ? (
            <HBarChart data={m.byChannel.map((c) => ({ name: CHANNEL_LABELS[c.channel], value: c.count }))} valueLabel="Reservas" format="count" />
          ) : (
            <EmptyState title="Sin reservas" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {user.role !== "STYLIST" && m.byBranch.length > 1 ? (
          <Card>
            <CardTitle hint="Ingresos del periodo">Ingresos por sede</CardTitle>
            <HBarChart
              data={[...m.byBranch].sort((a, b) => b.revenue - a.revenue).map((b) => ({ name: b.name, value: b.revenue, extra: `${b.bookings} reservas` }))}
              valueLabel="Ingresos"
            />
          </Card>
        ) : null}
        <Card>
          <CardTitle hint="Por ingresos">Servicios top</CardTitle>
          {m.topServices.length ? (
            <HBarChart data={m.topServices.map((s) => ({ name: s.name, value: s.revenue, extra: `${s.count} citas` }))} valueLabel="Ingresos" />
          ) : (
            <EmptyState title="Aún no hay servicios en este periodo" />
          )}
        </Card>
        <Card className={user.role === "STYLIST" || m.byBranch.length <= 1 ? "" : "xl:col-span-2"}>
          <CardTitle hint="Inicio de la cita, hora local">Horas pico</CardTitle>
          <Heatmap data={m.heat} />
        </Card>
      </div>

      {user.role !== "STYLIST" ? (
        <Card className="mt-4">
          <CardTitle hint="Rebooking = vuelve a reservar dentro de 60 días">Ranking de especialistas</CardTitle>
          {m.stylistRanking.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 font-medium">#</th>
                    <th className="py-2 font-medium">Especialista</th>
                    <th className="py-2 text-right font-medium">Ingresos</th>
                    <th className="py-2 pl-6 font-medium">Ocupación</th>
                    <th className="py-2 text-right font-medium">Rebooking</th>
                  </tr>
                </thead>
                <tbody>
                  {m.stylistRanking.map((s, i) => (
                    <tr key={s.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 text-muted tabular-nums">{i + 1}</td>
                      <td className="py-2.5 font-medium">{s.name}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatMoney(s.revenue * 100)}</td>
                      <td className="py-2.5 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-sand" aria-hidden>
                            <div className="h-full rounded-full bg-rose" style={{ width: `${Math.round(s.occupancy * 100)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums">{pct(s.occupancy)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{pct(s.rebooking)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sin datos de especialistas" />
          )}
        </Card>
      ) : null}
    </>
  );
}
