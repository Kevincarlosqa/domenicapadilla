"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import type { LandingData } from "@/lib/landing";
import { CATEGORY_LABELS } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";
import { WhatsAppIcon, waLink } from "./icons";

interface CatalogResponse {
  services: Array<{ id: string; name: string; category: keyof typeof CATEGORY_LABELS; priceCents: number; priceFrom: boolean; durationMin: number; variants: Array<{ id: string; name: string; priceCents: number }> }>;
  stylists: Array<{ id: string; name: string; title: string; serviceIds: string[] }>;
}
interface SlotResponse {
  slots: Array<{ start: string; label: string; totalCents: number; stylists: Array<{ id: string; name: string }> }>;
}

const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
function nextDays(n: number) {
  const base = new Date(`${limaToday()}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    return {
      key: d.toISOString().slice(0, 10),
      dow: new Intl.DateTimeFormat("es-PE", { weekday: "short", timeZone: "UTC" }).format(d),
      day: d.getUTCDate(),
    };
  });
}

// min-w-0 + max-w-full: un <select> mide lo que su opción más larga; sin esto desborda la pantalla en móvil.
const field = "block h-12 w-full min-w-0 max-w-full truncate rounded-2xl border border-ink/15 bg-paper px-4 pr-9 text-sm focus:border-ink focus:outline-none";

const noopSubscribe = () => () => {};

export function BookingWidget({ branches }: Pick<LandingData, "branches">) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [stylistId, setStylistId] = useState("");
  // "Reservar online" desde la ficha de un servicio llega con el servicio (y la sede) ya elegidos.
  useEffect(() => {
    const onBook = (e: Event) => {
      const { serviceId: sid, branchId: bid } = (e as CustomEvent<{ serviceId: string; branchId?: string }>).detail;
      if (bid && branches.some((b) => b.id === bid)) setBranchId(bid);
      setServiceId(sid);
      setVariantId("");
      setStylistId("");
    };
    window.addEventListener("dp:book", onBook);
    return () => window.removeEventListener("dp:book", onBook);
  }, [branches]);
  // Las fechas dependen del reloj: se calculan en el cliente, no en el prerender.
  const today = useSyncExternalStore(noopSubscribe, limaToday, () => "");
  const days = useMemo(() => (today ? nextDays(14) : []), [today]);
  const [pickedDate, setDate] = useState("");
  const date = pickedDate || days[0]?.key || "";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; when: string; branch: string; address: string; services: string[]; status: string } | null>(null);

  // Las respuestas se guardan con la clave de la consulta: si la clave cambió, el dato está "cargando".
  const [catalogState, setCatalogState] = useState<{ key: string; data: CatalogResponse } | null>(null);
  const catalog = catalogState?.key === branchId ? catalogState.data : null;
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/catalog?branch=${branchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data: CatalogResponse | null) => alive && setCatalogState({ key: branchId, data: data ?? { services: [], stylists: [] } }));
    return () => {
      alive = false;
    };
  }, [branchId]);

  const slotsKey = serviceId && date ? new URLSearchParams({ branchId, serviceId, date, ...(variantId ? { variantId } : {}), ...(stylistId ? { stylistId } : {}) }).toString() : "";
  const [slotsState, setSlotsState] = useState<{ key: string; slots: SlotResponse["slots"] } | null>(null);
  const slots = slotsKey && slotsState?.key === slotsKey ? slotsState.slots : null;
  const [picked, setPicked] = useState<{ key: string; slot: SlotResponse["slots"][number] } | null>(null);
  const slot = picked?.key === slotsKey ? picked.slot : null;
  const setSlot = (s: SlotResponse["slots"][number] | null) => setPicked(s ? { key: slotsKey, slot: s } : null);
  useEffect(() => {
    if (!slotsKey) return;
    const ctrl = new AbortController();
    fetch(`/api/public/availability?${slotsKey}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: SlotResponse) => setSlotsState({ key: slotsKey, slots: d.slots ?? [] }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [slotsKey]);

  const service = catalog?.services.find((s) => s.id === serviceId);
  const stylists = catalog?.stylists.filter((s) => !serviceId || s.serviceIds.includes(serviceId)) ?? [];
  const branch = branches.find((b) => b.id === branchId);
  const grouped = (catalog?.services ?? []).reduce<Record<string, CatalogResponse["services"]>>((acc, s) => ((acc[s.category] ??= []).push(s), acc), {});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setState("sending");
    setError("");
    const res = await fetch("/api/public/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, serviceId, variantId: variantId || undefined, stylistId: slot.stylists[0]?.id, start: slot.start, name, phone, consent }),
    });
    const data = await res.json();
    if (res.ok) {
      setDone(data);
      setState("idle");
    } else {
      setState("error");
      setError(data.error ?? "No se pudo reservar.");
      if (data.code === "SLOT_TAKEN") setSlot(null);
    }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-start gap-4 rounded-[2rem] bg-paper p-8" role="status">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose text-white">
          <Check className="h-6 w-6" />
        </span>
        <p className="font-display text-4xl">¡Tu cita está {done.status === "PENDING" ? "registrada" : "confirmada"}!</p>
        <p className="text-ink-soft">
          {done.services.join(" + ")}
          <br />
          {done.when} · {done.branch}, {done.address}
        </p>
        <p className="rounded-full bg-sand px-4 py-2 font-mono text-sm">Código {done.code}</p>
        <p className="text-sm text-muted">Te escribiremos por WhatsApp para recordarte la cita. Puedes cambiarla respondiendo a ese mensaje.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full min-w-0 space-y-6 rounded-4xl bg-paper p-4 shadow-[0_30px_60px_-40px_rgba(10,10,10,0.4)] sm:p-5 md:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-semibold text-ink-soft">1 · Sede</span>
          <select value={branchId} onChange={(e) => (setBranchId(e.target.value), setServiceId(""), setVariantId(""), setStylistId(""))} className={field}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.district}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-semibold text-ink-soft">2 · Servicio</span>
          <select value={serviceId} onChange={(e) => (setServiceId(e.target.value), setVariantId(""), setStylistId(""))} className={field} disabled={!catalog}>
            <option value="">{catalog ? "Elige un servicio" : "Cargando…"}</option>
            {Object.entries(grouped).map(([cat, list]) => (
              <optgroup key={cat} label={CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.priceFrom ? "desde " : ""}
                    {formatMoney(s.priceCents)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {service?.variants.length ? (
          <label className="block min-w-0 space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">Variante</span>
            <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={field}>
              <option value="">Elige</option>
              {service.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {formatMoney(v.priceCents)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-semibold text-ink-soft">Especialista</span>
          <select value={stylistId} onChange={(e) => setStylistId(e.target.value)} className={field} disabled={!serviceId}>
            <option value="">Cualquiera (el mejor horario)</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink-soft">3 · Día</p>
        <div className="scrollbar-none -mx-1 flex min-h-[68px] gap-2 overflow-x-auto px-1 pb-1" data-lenis-prevent>
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDate(d.key)}
              aria-pressed={date === d.key}
              className={cn("flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors", date === d.key ? "border-ink bg-ink text-paper" : "border-ink/15 hover:border-ink/50")}
            >
              <span className="text-[10px] uppercase">{d.dow}</span>
              <span className="font-display text-2xl">{d.day}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink-soft">4 · Hora</p>
        {!serviceId ? (
          <p className="text-sm text-muted">Elige un servicio para ver horarios reales.</p>
        ) : slots === null ? (
          <div className="flex gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="h-10 w-16 animate-pulse rounded-xl bg-sand" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted">No quedan horarios ese día. Prueba otro día, otra especialista o escríbenos por WhatsApp.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => setSlot(s)}
                aria-pressed={slot?.start === s.start}
                className={cn("h-10 rounded-xl border px-3 text-sm tabular-nums transition-colors", slot?.start === s.start ? "border-rose bg-rose text-white" : "border-ink/15 hover:border-ink")}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {slot ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
            <p className="rounded-2xl bg-sand/70 px-4 py-3 text-sm">
              {service?.name} con <strong>{slot.stylists.map((s) => s.name).join(" + ")}</strong> · {slot.label} · {branch?.name} · <strong>{formatMoney(slot.totalCents)}</strong>
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-semibold text-ink-soft">Nombre</span>
                <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-semibold text-ink-soft">WhatsApp</span>
                <input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="987 654 321" className={field} />
              </label>
            </div>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <label className="flex items-start gap-2 text-xs text-muted">
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose" />
              Acepto que Doménica Padilla use mis datos para gestionar esta cita y enviarme recordatorios por WhatsApp.
            </label>
            {state === "error" ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={state === "sending"} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-7 text-sm font-semibold text-paper hover:bg-rose-deep disabled:opacity-60 sm:w-auto">
              {state === "sending" ? "Reservando…" : "Confirmar reserva"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {branch ? (
        <a href={waLink(branch.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          <WhatsAppIcon className="h-4 w-4" /> ¿Prefieres hablar con alguien? Escribe a {branch.name}
        </a>
      ) : null}
    </form>
  );
}
