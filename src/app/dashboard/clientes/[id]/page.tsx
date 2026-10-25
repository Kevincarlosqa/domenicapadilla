import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerEditor, TechnicalNoteForm } from "@/components/dashboard/customer-forms";
import { Badge, Card, CardTitle, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { customerScope, requireUser } from "@/lib/auth";
import { CHANNEL_LABELS, STATUS_LABELS } from "@/lib/labels";
import { db } from "@/lib/prisma";
import { addDaysKey, formatLocal, localDateKey } from "@/lib/time";
import { formatMoney, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Ficha de clienta" };

function upcomingOf<T extends { startsAt: Date; status: string }>(bookings: T[]) {
  const now = Date.now();
  return bookings.filter((b) => b.startsAt.getTime() > now && ["PENDING", "CONFIRMED"].includes(b.status));
}

export default async function ClientePage({ params }: PageProps<"/dashboard/clientes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const prisma = await db();
  const c = await prisma.customer.findFirst({
    where: { id, ...customerScope(user) },
    include: {
      preferredBranch: true,
      preferredStylist: true,
      technicalNotes: { include: { stylist: true }, orderBy: { createdAt: "desc" } },
      bookings: { include: { branch: true, items: { include: { service: true, stylist: true } } }, orderBy: { startsAt: "desc" }, take: 50 },
      waitlist: { where: { status: { in: ["WAITING", "NOTIFIED"] } }, include: { branch: true } },
    },
  });
  if (!c) notFound();

  const completed = c.bookings.filter((b) => b.status === "COMPLETED");
  const spent = completed.reduce((a, b) => a + b.totalCents, 0);
  const upcoming = upcomingOf(c.bookings);
  // Retoque sugerido: último servicio de micropigmentación completado + días de retoque.
  const lastPmu = completed.flatMap((b) => b.items.filter((i) => i.service.retouchAfterDays).map((i) => ({ b, i })))[0];
  const retouch = lastPmu ? addDaysKey(localDateKey(lastPmu.b.startsAt, lastPmu.b.branch.timezone), lastPmu.i.service.retouchAfterDays!) : null;

  return (
    <>
      <Link href="/dashboard/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Clientas
      </Link>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blush font-display text-2xl">{initials(c.name ?? "?")}</span>
        <div className="flex-1">
          <h1 className="font-display text-4xl leading-none">{c.name ?? "Sin nombre"}</h1>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {c.phone}
            {c.email ? ` · ${c.email}` : ""} · clienta desde {formatLocal(c.createdAt, "America/Lima", "MMMM yyyy")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {c.marketingOptIn ? <Badge className="bg-[#e3efe8] text-[#24603f]">Acepta marketing</Badge> : null}
            {c.noShowCount ? <Badge className="bg-[#f1dce6] text-[#7c2754]">{c.noShowCount} no-shows</Badge> : null}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-6 text-right">
          <div>
            <dt className="text-xs text-muted">Visitas</dt>
            <dd className="font-display text-3xl">{completed.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Gasto total</dt>
            <dd className="font-display text-3xl">{formatMoney(spent)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ticket medio</dt>
            <dd className="font-display text-3xl">{formatMoney(completed.length ? spent / completed.length : 0)}</dd>
          </div>
        </dl>
      </header>

      {c.allergies ? (
        <p role="alert" className="mb-4 rounded-xl border border-[#e2b673] bg-[#fbecd6] px-4 py-3 text-sm text-[#5e3a0c]">
          <strong>Alergias:</strong> {c.allergies}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardTitle hint={c.preferredBranch ? `Sede habitual: ${c.preferredBranch.name}${c.preferredStylist ? ` · con ${c.preferredStylist.name}` : ""}` : undefined}>
              Historial
            </CardTitle>
            {c.bookings.length === 0 ? (
              <EmptyState title="Aún no tiene reservas" />
            ) : (
              <ol className="divide-y divide-line/70">
                {c.bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="w-28 shrink-0 text-sm tabular-nums">
                      <p className="font-medium capitalize">{formatLocal(b.startsAt, b.branch.timezone, "d MMM yyyy")}</p>
                      <p className="text-xs text-muted">{formatLocal(b.startsAt, b.branch.timezone, "HH:mm")}</p>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      {b.items.map((i) => (
                        <p key={i.id}>
                          {i.service.name} <span className="text-muted">con {i.stylist.name}</span>
                        </p>
                      ))}
                      <p className="text-xs text-muted">
                        {b.branch.name} · {CHANNEL_LABELS[b.channel]} · {b.code}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={b.status} label={STATUS_LABELS[b.status]} />
                      <span className="text-xs tabular-nums">{formatMoney(b.totalCents)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardTitle hint="Pigmentos, fórmulas y agujas usadas">Ficha técnica</CardTitle>
            <TechnicalNoteForm customerId={c.id} />
            {c.technicalNotes.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Sin notas técnicas todavía.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {c.technicalNotes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-line bg-ivory/60 p-3">
                    <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                      {n.title}
                      <span className="text-xs font-normal text-muted">
                        {formatLocal(n.createdAt, "America/Lima", "d MMM yyyy")}
                        {n.stylist ? ` · ${n.stylist.name}` : ""}
                      </span>
                    </p>
                    {n.formula ? <p className="mt-1 font-mono text-xs text-ink-soft">{n.formula}</p> : null}
                    {n.body ? <p className="mt-1 text-sm text-ink-soft">{n.body}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {upcoming.length || retouch || c.waitlist.length ? (
            <Card>
              <CardTitle>Próximo</CardTitle>
              <ul className="space-y-2 text-sm">
                {upcoming.map((b) => (
                  <li key={b.id}>
                    <span className="font-medium capitalize">{formatLocal(b.startsAt, b.branch.timezone, "EEE d MMM, HH:mm")}</span> · {b.branch.name}
                  </li>
                ))}
                {retouch ? (
                  <li className="text-rose-deep">
                    Retoque sugerido desde el {retouch.split("-").reverse().join("/")} ({lastPmu!.i.service.name})
                  </li>
                ) : null}
                {c.waitlist.map((w) => (
                  <li key={w.id} className="text-muted">
                    En lista de espera · {w.branch.name}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <CardTitle>Datos y notas internas</CardTitle>
            <CustomerEditor
              customer={{
                id: c.id,
                name: c.name ?? "",
                email: c.email ?? "",
                skinType: c.skinType ?? "",
                hairType: c.hairType ?? "",
                allergies: c.allergies ?? "",
                notes: c.notes ?? "",
                tags: c.tags.join(", "),
                marketingOptIn: c.marketingOptIn,
              }}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
