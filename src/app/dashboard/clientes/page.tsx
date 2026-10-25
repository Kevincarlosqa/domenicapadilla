import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, inputClass } from "@/components/dashboard/ui";
import { customerScope, requireUser } from "@/lib/auth";
import { getSelectedBranch } from "@/lib/dashboard";
import { db } from "@/lib/prisma";
import { formatLocal } from "@/lib/time";
import { cn, formatMoney, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientas" };
const PAGE = 30;

export default async function ClientesPage({ searchParams }: PageProps<"/dashboard/clientes">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tag = typeof sp.tag === "string" ? sp.tag : "";
  const page = Math.max(1, Number(sp.p) || 1);
  const selected = await getSelectedBranch(user);
  const prisma = await db();

  const where = {
    AND: [
      customerScope(user, selected),
      q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q.replace(/\s/g, "") } }, { email: { contains: q, mode: "insensitive" as const } }] } : {},
      tag ? { tags: { has: tag } } : {},
    ],
  };
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        preferredBranch: true,
        bookings: { where: { status: "COMPLETED" }, select: { totalCents: true, startsAt: true }, orderBy: { startsAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.customer.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="Clientas" description={`${total.toLocaleString("es-PE")} clientas`} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Nombre, teléfono o correo" aria-label="Buscar clienta" className={cn(inputClass, "max-w-sm")} />
        <select name="tag" defaultValue={tag} aria-label="Etiqueta" className={cn(inputClass, "w-48")}>
          <option value="">Todas las etiquetas</option>
          {["VIP", "Retoque pendiente", "Piel sensible"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-paper">Buscar</button>
      </form>
      {customers.length === 0 ? (
        <EmptyState title="Sin clientas" icon={<Users className="h-8 w-8" />}>
          {q ? "No hay coincidencias para esa búsqueda." : "Las clientas aparecen al reservar."}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => {
            const spent = c.bookings.reduce((a, b) => a + b.totalCents, 0);
            return (
              <Link key={c.id} href={`/dashboard/clientes/${c.id}`} className="group">
                <Card className="flex h-full gap-3 transition-colors group-hover:border-ink/40">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush font-display text-lg">{initials(c.name ?? "?")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name ?? "Sin nombre"}</p>
                    <p className="text-xs text-muted tabular-nums">{c.phone}</p>
                    <p className="mt-2 text-xs text-ink-soft">
                      {c.bookings.length} visitas · {formatMoney(spent)}
                      {c.bookings[0] ? ` · última ${formatLocal(c.bookings[0].startsAt, "America/Lima", "d MMM yy")}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.preferredBranch ? <Badge>{c.preferredBranch.name}</Badge> : null}
                      {c.tags.map((t) => (
                        <Badge key={t} className={t === "VIP" ? "bg-ink text-paper" : ""}>
                          {t}
                        </Badge>
                      ))}
                      {c.allergies ? <Badge className="bg-[#fbecd6] text-[#7a4a10]">Alergia</Badge> : null}
                      {c.noShowCount >= 2 ? <Badge className="bg-[#f1dce6] text-[#7c2754]">{c.noShowCount} no-shows</Badge> : null}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {total > PAGE ? (
        <nav className="mt-4 flex justify-end gap-2 text-sm" aria-label="Paginación">
          {page > 1 ? <Link className="rounded-full border border-line px-3 py-1 hover:bg-sand" href={`?${new URLSearchParams({ q, tag, p: String(page - 1) })}`}>Anterior</Link> : null}
          {page * PAGE < total ? <Link className="rounded-full border border-line px-3 py-1 hover:bg-sand" href={`?${new URLSearchParams({ q, tag, p: String(page + 1) })}`}>Siguiente</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
