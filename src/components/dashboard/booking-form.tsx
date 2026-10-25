"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createStaffBooking, staffAvailability } from "@/app/dashboard/actions";
import { Button, Field, inputClass } from "./ui";
import { CATEGORY_LABELS } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";

export interface FormCatalog {
  branches: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; category: keyof typeof CATEGORY_LABELS; durationMin: number; priceCents: number; branchIds: string[] }>;
  stylists: Array<{ id: string; name: string; branchIds: string[]; serviceIds: string[] }>;
}

interface Props {
  catalog: FormCatalog;
  defaultBranchId?: string;
  /** Alta rápida desde la agenda: especialista y hora ya elegidas. */
  preset?: { stylistId: string; start: string; label: string; date: string };
  defaultDate: string;
  onClose: () => void;
}

export function BookingForm({ catalog, defaultBranchId, preset, defaultDate, onClose }: Props) {
  const [branchId, setBranchId] = useState(defaultBranchId ?? catalog.branches[0]?.id ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [stylistId, setStylistId] = useState(preset?.stylistId ?? "");
  const [date, setDate] = useState(preset?.date ?? defaultDate);
  const [slots, setSlots] = useState<Array<{ start: string; label: string; stylists: string; totalCents: number }> | null>(null);
  const [start, setStart] = useState(preset?.start ?? "");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("PHONE");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Array<{ start: string; label: string }>>([]);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const services = useMemo(() => catalog.services.filter((s) => s.branchIds.includes(branchId)), [catalog.services, branchId]);
  const stylists = useMemo(
    () => catalog.stylists.filter((s) => s.branchIds.includes(branchId) && serviceIds.every((id) => s.serviceIds.includes(id))),
    [catalog.stylists, branchId, serviceIds],
  );

  useEffect(() => {
    if (preset || serviceIds.length === 0 || !branchId) return;
    let cancelled = false;
    startTransition(async () => {
      const res = await staffAvailability({ branchId, serviceIds, stylistId: stylistId || undefined, date });
      if (cancelled) return;
      setSlots(res.slots);
      setError(res.ok ? null : res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, serviceIds, stylistId, date, preset]);

  const toggle = (id: string) => {
    setStart("");
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 5)));
  };

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createStaffBooking({ branchId, phone, name, serviceIds, stylistId: stylistId || undefined, start, channel: channel as "PHONE", notes: notes || undefined });
      if (res.ok) setDone(res.data?.code ?? "");
      else {
        setError(res.error);
        setAlternatives(res.alternatives ?? []);
      }
    });
  }

  const byCategory = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="bf-title">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-ivory shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="bf-title" className="font-display text-2xl">
            {preset ? `Nueva cita · ${preset.label}` : "Nueva reserva"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-sand" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done !== null ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="font-display text-4xl">Reserva creada</p>
            <p className="text-muted">
              Código <strong className="text-ink">{done}</strong>
            </p>
            <Button onClick={onClose} className="mt-4">
              Listo
            </Button>
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" data-lenis-prevent>
            {!preset ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sede" htmlFor="bf-branch">
                  <select id="bf-branch" className={inputClass} value={branchId} onChange={(e) => (setBranchId(e.target.value), setServiceIds([]), setStylistId(""))}>
                    {catalog.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha" htmlFor="bf-date">
                  <input id="bf-date" type="date" className={inputClass} value={date} onChange={(e) => (setDate(e.target.value), setStart(""))} />
                </Field>
              </div>
            ) : null}

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-ink-soft">Servicios (se encadenan en este orden)</legend>
              <div className="space-y-3">
                {Object.entries(byCategory).map(([cat, list]) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-[11px] tracking-wide text-muted uppercase">{CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((s) => {
                        const idx = serviceIds.indexOf(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggle(s.id)}
                            aria-pressed={idx >= 0}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs transition-colors",
                              idx >= 0 ? "border-ink bg-ink text-paper" : "border-line bg-paper hover:border-ink",
                            )}
                          >
                            {idx >= 0 ? `${idx + 1}. ` : ""}
                            {s.name} · {formatMoney(s.priceCents)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>

            {!preset ? (
              <Field label="Especialista" htmlFor="bf-stylist">
                <select id="bf-stylist" className={inputClass} value={stylistId} onChange={(e) => (setStylistId(e.target.value), setStart(""))}>
                  <option value="">Cualquier especialista (asignación automática)</option>
                  {stylists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {!preset && serviceIds.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-soft">Horarios disponibles {pending && !slots ? "…" : ""}</p>
                {slots && slots.length === 0 ? <p className="text-sm text-muted">No hay huecos ese día. Prueba otra fecha o especialista.</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  {slots?.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      onClick={() => setStart(s.start)}
                      aria-pressed={start === s.start}
                      title={s.stylists}
                      className={cn("rounded-lg border px-2.5 py-1.5 text-xs tabular-nums", start === s.start ? "border-rose bg-rose text-white" : "border-line bg-paper hover:border-ink")}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {start ? <p className="mt-2 text-xs text-muted">{slots?.find((s) => s.start === start)?.stylists}</p> : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Teléfono (WhatsApp)" htmlFor="bf-phone">
                <input id="bf-phone" inputMode="tel" placeholder="987 654 321" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Nombre" htmlFor="bf-name">
                <input id="bf-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Canal" htmlFor="bf-channel">
                <select id="bf-channel" className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="PHONE">Teléfono</option>
                  <option value="DASHBOARD">Dashboard</option>
                  <option value="WALK_IN">Walk-in (empieza ahora)</option>
                  <option value="WHATSAPP">WhatsApp (manual)</option>
                </select>
              </Field>
              <Field label="Notas" htmlFor="bf-notes">
                <input id="bf-notes" className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>

            {error ? (
              <div role="alert" className="rounded-xl bg-[#f5e1e1] px-3 py-2 text-sm text-[#8a2c2c]">
                {error}
                {alternatives.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {alternatives.map((a) => (
                      <button key={a.start} onClick={() => setStart(a.start)} className="rounded-lg bg-paper px-2 py-1 text-xs text-ink">
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {done === null ? (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
            <p className="text-sm text-muted">
              {serviceIds.length
                ? `Total estimado ${formatMoney(serviceIds.reduce((a, id) => a + (services.find((s) => s.id === id)?.priceCents ?? 0), 0))}`
                : "Elige uno o más servicios"}
            </p>
            <Button onClick={submit} disabled={pending || !start || !phone || serviceIds.length === 0}>
              {pending ? "Guardando…" : "Crear reserva"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
