import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, InlineAction } from "@/components/dashboard/action-form";
import { Badge, Card, CardTitle, EmptyState, Field, PageHeader, inputClass } from "@/components/dashboard/ui";
import { isAdmin, requireUser, type CurrentUser } from "@/lib/auth";
import { CATEGORY_LABELS, LEVEL_LABELS, ROLE_LABELS } from "@/lib/labels";
import { db } from "@/lib/prisma";
import { WEEKDAYS, formatLocal, minToHHMM } from "@/lib/time";
import { cn, formatMoney } from "@/lib/utils";
import {
  addClosure,
  addTimeOff,
  changeOwnPassword,
  createUser,
  removeClosure,
  removeTimeOff,
  resetPassword,
  saveBranch,
  saveService,
  saveStylist,
  toggleUser,
} from "./actions";

export const metadata: Metadata = { title: "Configuración" };

type Tab = "sedes" | "especialistas" | "servicios" | "usuarios" | "cuenta";

function tabsFor(user: CurrentUser): Array<{ id: Tab; label: string }> {
  const t: Array<{ id: Tab; label: string }> = [];
  if (user.role === "OWNER" || user.role === "ADMIN" || user.role === "BRANCH_MANAGER") t.push({ id: "sedes", label: "Sedes" }, { id: "especialistas", label: "Especialistas" });
  if (isAdmin(user)) t.push({ id: "servicios", label: "Servicios" }, { id: "usuarios", label: "Usuarios y roles" });
  t.push({ id: "cuenta", label: "Mi cuenta" });
  return t;
}

const ranges = (list: Array<{ startMin: number; endMin: number }>) => list.map((r) => `${minToHHMM(r.startMin)}-${minToHHMM(r.endMin)}`).join(", ");
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default async function ConfigPage({ searchParams }: PageProps<"/dashboard/configuracion">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tabs = tabsFor(user);
  const tab = (tabs.find((t) => t.id === sp.tab)?.id ?? tabs[0]!.id) as Tab;
  const id = typeof sp.id === "string" ? sp.id : undefined;

  let body: ReactNode;
  if (tab === "sedes") body = await Branches(user, id);
  else if (tab === "especialistas") body = await Stylists(user, id);
  else if (tab === "servicios") body = await Services(id);
  else if (tab === "usuarios") body = await Users();
  else body = <Account />;

  return (
    <>
      <PageHeader title="Configuración" />
      <nav aria-label="Secciones de configuración" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/dashboard/configuracion?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap", tab === t.id ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}

function ListLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={cn("block rounded-xl px-3 py-2.5 text-sm", active ? "bg-ink text-paper" : "hover:bg-sand")}>
      {children}
    </Link>
  );
}

// ─── Sedes ──────────────────────────────────────────────────────────────────

async function Branches(user: CurrentUser, id?: string) {
  const prisma = await db();
  const branches = await prisma.branch.findMany({ where: user.branchIds ? { id: { in: user.branchIds } } : {}, orderBy: { sortOrder: "asc" } });
  const b = branches.find((x) => x.id === id) ?? branches[0];
  if (!b) return <EmptyState title="Sin sedes" />;
  const [hours, closures] = await Promise.all([
    prisma.branchHours.findMany({ where: { branchId: b.id }, orderBy: { startMin: "asc" } }),
    prisma.branchClosure.findMany({ where: { branchId: b.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  const num = (name: keyof typeof b, label: string, hint?: string) => (
    <Field label={label} htmlFor={`b-${name}`} hint={hint}>
      <input id={`b-${name}`} name={name} type="number" defaultValue={String(b[name])} className={inputClass} />
    </Field>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav className="space-y-1">
        {branches.map((x) => (
          <ListLink key={x.id} href={`?tab=sedes&id=${x.id}`} active={x.id === b.id}>
            {x.name} {!x.active ? <span className="text-xs opacity-70">(inactiva)</span> : null}
          </ListLink>
        ))}
      </nav>
      <div className="space-y-4">
        <Card>
          <CardTitle>{b.name}</CardTitle>
          <ActionForm action={saveBranch} key={b.id}>
            <input type="hidden" name="id" value={b.id} />
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nombre" htmlFor="b-name">
                <input id="b-name" name="name" defaultValue={b.name} className={inputClass} />
              </Field>
              <Field label="Distrito" htmlFor="b-district">
                <input id="b-district" name="district" defaultValue={b.district} className={inputClass} />
              </Field>
              <Field label="Ciudad" htmlFor="b-city">
                <input id="b-city" name="city" defaultValue={b.city} className={inputClass} />
              </Field>
              <Field label="Dirección" htmlFor="b-address" className="md:col-span-2">
                <input id="b-address" name="address" defaultValue={b.address} className={inputClass} />
              </Field>
              <Field label="Referencia" htmlFor="b-reference">
                <input id="b-reference" name="reference" defaultValue={b.reference ?? ""} className={inputClass} />
              </Field>
              <Field label="Teléfono / WhatsApp" htmlFor="b-phone">
                <input id="b-phone" name="phone" defaultValue={b.phone} className={inputClass} />
              </Field>
              <Field label="Latitud" htmlFor="b-lat" hint="Para “sede más cercana”">
                <input id="b-lat" name="lat" type="number" step="any" defaultValue={b.lat} className={inputClass} />
              </Field>
              <Field label="Longitud" htmlFor="b-lng">
                <input id="b-lng" name="lng" type="number" step="any" defaultValue={b.lng} className={inputClass} />
              </Field>
              <Field label="Zona horaria" htmlFor="b-tz">
                <input id="b-tz" name="timezone" defaultValue={b.timezone} className={inputClass} />
              </Field>
            </div>
            <fieldset className="grid gap-3 md:grid-cols-4">
              <legend className="mb-2 text-sm font-semibold">Capacidad y políticas</legend>
              {num("stations", "Camillas / sillas")}
              {num("slotIntervalMin", "Intervalo entre horarios (min)")}
              {num("minLeadMinutes", "Anticipación mínima (min)")}
              {num("maxDaysAhead", "Días máximos hacia adelante")}
              {num("cancelWindowHours", "Cambio gratis hasta (h antes)")}
              {num("maxActiveBookings", "Reservas activas por clienta")}
              {num("noShowWarnAt", "No-shows para advertir", "La reserva queda pendiente")}
              {num("noShowBlockAt", "No-shows para bloquear", "Se deriva a una asesora")}
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Horario semanal</legend>
              <p className="mb-3 text-xs text-muted">Franjas separadas por coma, p. ej. “09:00-13:00, 14:00-20:00”. Vacío = cerrado.</p>
              <div className="grid gap-2 md:grid-cols-2">
                {ORDER.map((wd) => (
                  <label key={wd} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-ink-soft">{WEEKDAYS[wd]}</span>
                    <input name={`hours_${wd}`} defaultValue={ranges(hours.filter((h) => h.weekday === wd))} placeholder="Cerrado" className={inputClass} />
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={b.active} className="h-4 w-4 accent-rose" /> Sede activa (visible en la web y en el bot)
            </label>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle hint="Feriados, inventario, remodelación">Cierres especiales</CardTitle>
          {closures.length ? (
            <ul className="mb-4 divide-y divide-line/70">
              {closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <strong className="font-medium">{c.reason}</strong>{" "}
                    <span className="text-muted">
                      {formatLocal(c.startsAt, b.timezone, "d MMM HH:mm")} → {formatLocal(c.endsAt, b.timezone, "d MMM HH:mm")}
                    </span>
                  </span>
                  <InlineAction action={removeClosure.bind(null, c.id)} label="Eliminar cierre" confirmText="¿Eliminar este cierre?" icon />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">No hay cierres programados.</p>
          )}
          <ActionForm action={addClosure} submitLabel="Agregar cierre">
            <input type="hidden" name="branchId" value={b.id} />
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Desde" htmlFor="cl-from">
                <input id="cl-from" name="from" type="date" required className={inputClass} />
              </Field>
              <Field label="Hasta (inclusive)" htmlFor="cl-to">
                <input id="cl-to" name="to" type="date" required className={inputClass} />
              </Field>
              <Field label="Motivo" htmlFor="cl-reason">
                <input id="cl-reason" name="reason" required placeholder="Feriado" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}

// ─── Especialistas ──────────────────────────────────────────────────────────

async function Stylists(user: CurrentUser, id?: string) {
  const prisma = await db();
  const branchFilter = user.branchIds ? { id: { in: user.branchIds } } : {};
  const [stylists, branches, services] = await Promise.all([
    prisma.stylist.findMany({
      where: user.branchIds ? { schedules: { some: { branchId: { in: user.branchIds } } } } : {},
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({ where: branchFilter, orderBy: { sortOrder: "asc" } }),
    prisma.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const isNew = id === "nuevo";
  const s = isNew ? null : (stylists.find((x) => x.id === id) ?? stylists[0] ?? null);
  const detail = s
    ? await prisma.stylist.findUniqueOrThrow({
        where: { id: s.id },
        include: { schedules: true, services: true, timeOff: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } } },
      })
    : null;
  const admin = isAdmin(user);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav className="space-y-1">
        <ListLink href="?tab=especialistas&id=nuevo" active={isNew}>
          + Nueva especialista
        </ListLink>
        {stylists.map((x) => (
          <ListLink key={x.id} href={`?tab=especialistas&id=${x.id}`} active={x.id === s?.id}>
            {x.name} {!x.active ? <span className="text-xs opacity-70">(inactiva)</span> : null}
          </ListLink>
        ))}
      </nav>
      <div className="space-y-4">
        <Card>
          <CardTitle>{detail ? detail.name : "Nueva especialista"}</CardTitle>
          <ActionForm action={saveStylist} key={detail?.id ?? "new"}>
            {detail ? <input type="hidden" name="id" value={detail.id} /> : null}
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nombre" htmlFor="s-name">
                <input id="s-name" name="name" required defaultValue={detail?.name} className={inputClass} />
              </Field>
              <Field label="Especialidad" htmlFor="s-title">
                <input id="s-title" name="title" required defaultValue={detail?.title} placeholder="Micropigmentadora" className={inputClass} />
              </Field>
              <Field label="Nivel" htmlFor="s-level">
                <select id="s-level" name="level" defaultValue={detail?.level ?? "SENIOR"} className={inputClass}>
                  {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bio corta (web)" htmlFor="s-bio" className="md:col-span-2">
                <input id="s-bio" name="bio" defaultValue={detail?.bio ?? ""} className={inputClass} />
              </Field>
              <Field label="Instagram" htmlFor="s-ig">
                <input id="s-ig" name="instagram" defaultValue={detail?.instagram ?? ""} placeholder="@usuario" className={inputClass} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Horario por sede</legend>
              <p className="mb-3 text-xs text-muted">Usa dos franjas para marcar el descanso: “10:00-14:00, 15:00-19:00”. Puede trabajar en varias sedes el mismo día.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 pr-2 font-medium">Sede</th>
                      {ORDER.map((wd) => (
                        <th key={wd} className="px-1 py-1 font-medium">
                          {WEEKDAYS[wd]!.slice(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={b.id}>
                        <th scope="row" className="py-1 pr-2 text-left font-medium whitespace-nowrap">
                          {b.name}
                        </th>
                        {ORDER.map((wd) => (
                          <td key={wd} className="px-0.5 py-1">
                            <input
                              name={`sched_${b.id}_${wd}`}
                              aria-label={`${b.name} ${WEEKDAYS[wd]}`}
                              defaultValue={ranges(detail?.schedules.filter((x) => x.branchId === b.id && x.weekday === wd) ?? [])}
                              className="h-8 w-full min-w-[86px] rounded-lg border border-line bg-paper px-1.5 text-[11px] focus:border-ink focus:outline-none"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <fieldset disabled={!admin && Boolean(detail)}>
              <legend className="mb-1 text-sm font-semibold">Habilidades {admin ? "" : "(solo administración)"}</legend>
              <p className="mb-3 text-xs text-muted">Precio (S/) y duración (min) propios opcionales; vacío = los de la sede.</p>
              <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                {services.map((svc) => {
                  const skill = detail?.services.find((x) => x.serviceId === svc.id);
                  return (
                    <div key={svc.id} className="flex items-center gap-2 py-1 text-sm">
                      <input type="checkbox" id={`sk-${svc.id}`} name="skills" value={svc.id} defaultChecked={Boolean(skill)} className="h-4 w-4 accent-rose" />
                      <label htmlFor={`sk-${svc.id}`} className="flex-1 truncate">
                        {svc.name}
                      </label>
                      <input name={`price_${svc.id}`} aria-label={`Precio propio ${svc.name}`} defaultValue={skill?.priceCents ? skill.priceCents / 100 : ""} placeholder={String(svc.priceCents / 100)} className="h-8 w-16 rounded-lg border border-line bg-paper px-2 text-xs" />
                      <input name={`dur_${svc.id}`} aria-label={`Duración propia ${svc.name}`} defaultValue={skill?.durationMin ?? ""} placeholder={String(svc.durationMin)} className="h-8 w-14 rounded-lg border border-line bg-paper px-2 text-xs" />
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={detail?.active ?? true} className="h-4 w-4 accent-rose" /> Activa
            </label>
          </ActionForm>
        </Card>

        {detail ? (
          <Card>
            <CardTitle hint="Vacaciones, enfermedad, capacitación o bloqueos puntuales">Ausencias</CardTitle>
            {detail.timeOff.length ? (
              <ul className="mb-4 divide-y divide-line/70">
                {detail.timeOff.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <Badge>{t.kind === "VACATION" ? "Vacaciones" : t.kind === "SICK" ? "Enfermedad" : t.kind === "TRAINING" ? "Capacitación" : "Bloqueo"}</Badge>{" "}
                      {formatLocal(t.startsAt, "America/Lima", "d MMM HH:mm")} → {formatLocal(t.endsAt, "America/Lima", "d MMM HH:mm")}
                      {t.reason ? <span className="text-muted"> · {t.reason}</span> : null}
                    </span>
                    <InlineAction action={removeTimeOff.bind(null, t.id)} label="Eliminar ausencia" confirmText="¿Eliminar esta ausencia?" icon />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">Sin ausencias programadas.</p>
            )}
            <ActionForm action={addTimeOff} submitLabel="Agregar ausencia">
              <input type="hidden" name="stylistId" value={detail.id} />
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Tipo" htmlFor="to-kind">
                  <select id="to-kind" name="kind" className={inputClass}>
                    <option value="BLOCK">Bloqueo</option>
                    <option value="VACATION">Vacaciones</option>
                    <option value="SICK">Enfermedad</option>
                    <option value="TRAINING">Capacitación</option>
                  </select>
                </Field>
                <Field label="Desde" htmlFor="to-from">
                  <input id="to-from" name="from" type="datetime-local" required className={inputClass} />
                </Field>
                <Field label="Hasta" htmlFor="to-to">
                  <input id="to-to" name="to" type="datetime-local" required className={inputClass} />
                </Field>
                <Field label="Motivo" htmlFor="to-reason">
                  <input id="to-reason" name="reason" className={inputClass} />
                </Field>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ─── Servicios ──────────────────────────────────────────────────────────────

async function Services(id?: string) {
  const prisma = await db();
  const [services, branches] = await Promise.all([
    prisma.service.findMany({ orderBy: { sortOrder: "asc" }, include: { branches: true, variants: true } }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const s = services.find((x) => x.id === id) ?? services[0];
  if (!s) return <EmptyState title="Sin servicios" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <nav className="max-h-[70vh] space-y-1 overflow-y-auto" data-lenis-prevent>
        {services.map((x) => (
          <ListLink key={x.id} href={`?tab=servicios&id=${x.id}`} active={x.id === s.id}>
            <span className="block">{x.name}</span>
            <span className="text-[11px] opacity-70">
              {CATEGORY_LABELS[x.category]} · {formatMoney(x.priceCents)}
            </span>
          </ListLink>
        ))}
      </nav>
      <Card>
        <CardTitle hint={s.variants.length ? `Variantes: ${s.variants.map((v) => `${v.name} ${formatMoney(v.priceCents)}`).join(" · ")}` : undefined}>{s.name}</CardTitle>
        <ActionForm action={saveService} key={s.id}>
          <input type="hidden" name="id" value={s.id} />
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Nombre" htmlFor="sv-name" className="md:col-span-2">
              <input id="sv-name" name="name" defaultValue={s.name} className={inputClass} />
            </Field>
            <Field label="Precio base (S/)" htmlFor="sv-price">
              <input id="sv-price" name="price" type="number" step="0.01" defaultValue={s.priceCents / 100} className={inputClass} />
            </Field>
            <Field label="Duración (min)" htmlFor="sv-dur">
              <input id="sv-dur" name="durationMin" type="number" defaultValue={s.durationMin} className={inputClass} />
            </Field>
            <Field label="Descripción" htmlFor="sv-desc" className="md:col-span-4">
              <input id="sv-desc" name="description" defaultValue={s.description} className={inputClass} />
            </Field>
            <Field label="Limpieza posterior (min)" htmlFor="sv-buf">
              <input id="sv-buf" name="bufferMin" type="number" defaultValue={s.bufferMin} className={inputClass} />
            </Field>
            <Field label="Pausa: empieza al min" htmlFor="sv-po" hint="La especialista queda libre">
              <input id="sv-po" name="processingOffsetMin" type="number" defaultValue={s.processingOffsetMin ?? ""} className={inputClass} />
            </Field>
            <Field label="Pausa: dura (min)" htmlFor="sv-pm">
              <input id="sv-pm" name="processingMin" type="number" defaultValue={s.processingMin ?? ""} className={inputClass} />
            </Field>
            <Field label="Retoque a los (días)" htmlFor="sv-rt">
              <input id="sv-rt" name="retouchAfterDays" type="number" defaultValue={s.retouchAfterDays ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="priceFrom" defaultChecked={s.priceFrom} className="h-4 w-4 accent-rose" /> Precio “desde”
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="featured" defaultChecked={s.featured} className="h-4 w-4 accent-rose" /> Destacado en la web
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4 accent-rose" /> Activo
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Oferta y precios por sede</legend>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-medium">Sede</th>
                    <th className="py-1 font-medium">Se ofrece</th>
                    <th className="py-1 font-medium">Precio propio (S/)</th>
                    <th className="py-1 font-medium">Duración propia</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => {
                    const o = s.branches.find((x) => x.branchId === b.id);
                    return (
                      <tr key={b.id} className="border-t border-line/60">
                        <th scope="row" className="py-1.5 text-left font-medium">
                          {b.name}
                        </th>
                        <td>
                          <input type="checkbox" name={`offer_${b.id}`} aria-label={`Se ofrece en ${b.name}`} defaultChecked={o?.active ?? false} className="h-4 w-4 accent-rose" />
                        </td>
                        <td>
                          <input name={`bprice_${b.id}`} aria-label={`Precio en ${b.name}`} defaultValue={o?.priceCents ? o.priceCents / 100 : ""} placeholder={String(s.priceCents / 100)} className="h-8 w-24 rounded-lg border border-line bg-paper px-2 text-xs" />
                        </td>
                        <td>
                          <input name={`bdur_${b.id}`} aria-label={`Duración en ${b.name}`} defaultValue={o?.durationMin ?? ""} placeholder={String(s.durationMin)} className="h-8 w-20 rounded-lg border border-line bg-paper px-2 text-xs" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}

// ─── Usuarios ───────────────────────────────────────────────────────────────

async function Users() {
  const prisma = await db();
  const [users, branches, stylists] = await Promise.all([
    prisma.user.findMany({ include: { branches: { include: { branch: true } }, stylist: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.stylist.findMany({ where: { active: true, user: null }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card className="p-0 md:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Alcance</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={cn("border-b border-line/60 align-top last:border-0", !u.active && "opacity-50")}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{ROLE_LABELS[u.role]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.role === "OWNER" || u.role === "ADMIN" ? "Todas las sedes" : u.stylist ? `Agenda de ${u.stylist.name}` : u.branches.map((b) => b.branch.name).join(", ")}</td>
                  <td className="px-4 py-3 text-xs text-muted">{u.lastLoginAt ? formatLocal(u.lastLoginAt, "America/Lima", "d MMM HH:mm") : "Nunca"}</td>
                  <td className="px-4 py-3 text-right">
                    <InlineAction action={toggleUser.bind(null, u.id)} label={u.active ? "Desactivar" : "Activar"} confirmText={u.active ? `¿Desactivar a ${u.name}?` : undefined} />
                    <details className="mt-1 text-left">
                      <summary className="cursor-pointer text-xs text-muted">Cambiar contraseña</summary>
                      <ActionForm action={resetPassword} submitLabel="Actualizar" className="mt-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="password" type="password" minLength={10} required aria-label="Nueva contraseña" placeholder="Nueva contraseña" className={inputClass} />
                      </ActionForm>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardTitle>Crear usuario</CardTitle>
        <ActionForm action={createUser} submitLabel="Crear usuario">
          <Field label="Nombre" htmlFor="u-name">
            <input id="u-name" name="name" required className={inputClass} />
          </Field>
          <Field label="Correo" htmlFor="u-email">
            <input id="u-email" name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Contraseña inicial" htmlFor="u-pass" hint="Mínimo 10 caracteres. Compártela por un canal seguro.">
            <input id="u-pass" name="password" type="password" minLength={10} required className={inputClass} />
          </Field>
          <Field label="Rol" htmlFor="u-role">
            <select id="u-role" name="role" defaultValue="RECEPTION" className={inputClass}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-soft">Sedes (gerencia y recepción)</legend>
            <div className="grid grid-cols-2 gap-1">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="branches" value={b.id} className="h-4 w-4 accent-rose" /> {b.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Especialista vinculada (rol especialista)" htmlFor="u-stylist">
            <select id="u-stylist" name="stylistId" className={inputClass}>
              <option value="">—</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}

function Account() {
  return (
    <Card className="max-w-md">
      <CardTitle>Cambiar contraseña</CardTitle>
      <ActionForm action={changeOwnPassword} submitLabel="Actualizar contraseña">
        <Field label="Contraseña actual" htmlFor="a-cur">
          <input id="a-cur" name="current" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <Field label="Nueva contraseña" htmlFor="a-new" hint="Mínimo 10 caracteres">
          <input id="a-new" name="next" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
        </Field>
        <Field label="Repite la nueva contraseña" htmlFor="a-conf">
          <input id="a-conf" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
        </Field>
      </ActionForm>
    </Card>
  );
}
