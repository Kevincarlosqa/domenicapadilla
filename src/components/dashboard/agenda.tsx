"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type DragEvent, type MouseEvent } from "react";
import { X } from "lucide-react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { changeStatus, moveBooking } from "@/app/dashboard/actions";
import { BookingForm, type FormCatalog } from "./booking-form";
import { Button, STATUS_BLOCK, StatusBadge } from "./ui";
import { STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const PPM = 1.25; // píxeles por minuto
const SNAP = 15;

interface Range {
  start: number;
  end: number;
}

export interface AgendaItem {
  id: string;
  bookingId: string;
  code: string;
  start: number;
  end: number;
  buffer: number;
  processing: Range | null;
  status: BookingStatus;
  customer: string;
  service: string;
  otherBranch: string | null;
  noShows: number;
}

export interface AgendaColumn {
  id: string;
  name: string;
  title: string;
  ranges: Range[];
  elsewhere: Range[];
  blocks: Array<Range & { label: string }>;
  items: AgendaItem[];
}

const NEXT: Partial<Record<BookingStatus, BookingStatus[]>> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function useToast() {
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div role="status" className={cn("fixed right-4 bottom-4 z-50 max-w-sm rounded-2xl px-4 py-3 text-sm shadow-xl", toast.ok ? "bg-ink text-paper" : "bg-danger text-white")}>
      {toast.text}
    </div>
  ) : null;
  return { show: (text: string, ok = true) => setToast({ text, ok }), node };
}

export function AgendaDay(props: {
  date: string;
  dayStartMs: number;
  openMin: number;
  closeMin: number;
  nowMin: number | null;
  columns: AgendaColumn[];
  canEdit: boolean;
  branchId: string;
  catalog: FormCatalog | null;
}) {
  const { openMin, closeMin, columns, canEdit } = props;
  const height = (closeMin - openMin) * PPM;
  const [dragging, setDragging] = useState<AgendaItem | null>(null);
  const [hover, setHover] = useState<{ col: string; min: number } | null>(null);
  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [create, setCreate] = useState<{ stylistId: string; min: number } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const minuteFromEvent = (e: { clientY: number; currentTarget: Element }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = openMin + (e.clientY - rect.top) / PPM;
    return Math.max(openMin, Math.min(closeMin - SNAP, Math.round(raw / SNAP) * SNAP));
  };
  const iso = (min: number) => new Date(props.dayStartMs + min * 60_000).toISOString();

  function onDrop(e: DragEvent<HTMLDivElement>, col: AgendaColumn) {
    e.preventDefault();
    const item = dragging;
    setDragging(null);
    setHover(null);
    if (!item) return;
    const min = minuteFromEvent(e);
    const sameStylist = columns.find((c) => c.items.some((i) => i.id === item.id))?.id === col.id;
    if (sameStylist && min === item.start) return;
    start(async () => {
      const res = await moveBooking({ bookingId: item.bookingId, start: iso(min), stylistId: sameStylist ? undefined : col.id });
      toast.show(res.ok ? `${item.code} movida a las ${hhmm(min)}${sameStylist ? "" : ` con ${col.name}`}` : res.error, res.ok);
    });
  }

  function onColumnClick(e: MouseEvent<HTMLDivElement>, col: AgendaColumn) {
    if (!canEdit || e.target !== e.currentTarget) return;
    const min = minuteFromEvent(e);
    if (!col.ranges.some((r) => min >= r.start && min < r.end)) return;
    setCreate({ stylistId: col.id, min });
  }

  const hoursList = Array.from({ length: (closeMin - openMin) / 60 + 1 }, (_, i) => openMin + i * 60);

  return (
    <div className={cn("rounded-2xl border border-line bg-paper", pending && "opacity-80")}>
      <div className="overflow-x-auto" data-lenis-prevent>
        <div className="flex min-w-max">
          {/* Columna de horas */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-paper">
            <div className="h-14 border-b border-line" />
            <div className="relative" style={{ height }}>
              {hoursList.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted tabular-nums" style={{ top: (h - openMin) * PPM }}>
                  {hhmm(h)}
                </span>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.id} className="w-48 shrink-0 border-r border-line/70 last:border-r-0 sm:w-56">
              <div className="sticky top-0 z-10 flex h-14 flex-col justify-center border-b border-line bg-paper px-3">
                <p className="truncate text-sm font-semibold">{col.name}</p>
                <p className="truncate text-[11px] text-muted">{col.title}</p>
              </div>
              <div
                className={cn("relative", canEdit && "cursor-copy")}
                style={{
                  height,
                  backgroundImage: "repeating-linear-gradient(135deg, #f1f1ef 0 6px, transparent 6px 12px)",
                }}
                onClick={(e) => onColumnClick(e, col)}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setHover({ col: col.id, min: minuteFromEvent(e) });
                }}
                onDragLeave={() => setHover(null)}
                onDrop={(e) => onDrop(e, col)}
                aria-label={`Agenda de ${col.name}`}
              >
                {/* Turno en esta sede */}
                {col.ranges.map((r, i) => (
                  <div key={i} className="pointer-events-none absolute inset-x-0 bg-paper" style={{ top: (r.start - openMin) * PPM, height: (r.end - r.start) * PPM }} />
                ))}
                {hoursList.map((h) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/50" style={{ top: (h - openMin) * PPM }} />
                ))}
                {col.elsewhere.map((r, i) => (
                  <div key={`e${i}`} className="pointer-events-none absolute inset-x-1 flex items-start justify-center rounded-md pt-1 text-[10px] text-muted" style={{ top: (r.start - openMin) * PPM, height: (r.end - r.start) * PPM }}>
                    En otra sede
                  </div>
                ))}
                {col.blocks.map((b, i) => (
                  <div
                    key={`b${i}`}
                    className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-rose/50 p-1 text-[10px] font-medium text-rose-deep"
                    style={{ top: (b.start - openMin) * PPM, height: Math.max(18, (b.end - b.start) * PPM), backgroundImage: "repeating-linear-gradient(45deg, #efefec 0 5px, #f7f7f5 5px 10px)" }}
                  >
                    {b.label}
                  </div>
                ))}
                {props.nowMin !== null && props.nowMin >= openMin && props.nowMin <= closeMin ? (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-rose" style={{ top: (props.nowMin - openMin) * PPM }}>
                    <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-rose" />
                  </div>
                ) : null}
                {hover?.col === col.id && dragging ? (
                  <div className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-ink/60 bg-ink/5" style={{ top: (hover.min - openMin) * PPM, height: (dragging.end - dragging.start) * PPM }}>
                    <span className="m-1 inline-block rounded bg-ink px-1 text-[10px] text-paper">{hhmm(hover.min)}</span>
                  </div>
                ) : null}

                {col.items.map((it) => {
                  const movable = canEdit && !it.otherBranch && (it.status === "PENDING" || it.status === "CONFIRMED");
                  const h = Math.max(22, (it.end - it.start) * PPM);
                  return (
                    <div key={it.id}>
                      {it.buffer > 0 ? (
                        <div className="pointer-events-none absolute inset-x-2 rounded-b-md bg-linen/60" style={{ top: (it.end - openMin) * PPM, height: it.buffer * PPM }} title="Limpieza" />
                      ) : null}
                      <button
                        type="button"
                        draggable={movable}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(it);
                        }}
                        onDragEnd={() => (setDragging(null), setHover(null))}
                        onClick={() => setSelected(it)}
                        className={cn(
                          "absolute inset-x-1 z-[5] flex flex-col items-start justify-start overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md",
                          it.otherBranch ? "border-line bg-sand/80 text-muted" : STATUS_BLOCK[it.status],
                          movable && "cursor-grab active:cursor-grabbing",
                          dragging?.id === it.id && "opacity-40",
                        )}
                        style={{ top: (it.start - openMin) * PPM, height: h }}
                        aria-label={`${hhmm(it.start)} ${it.customer}, ${it.service}, ${STATUS_LABELS[it.status]}`}
                      >
                        <span className="relative z-10 block font-semibold tabular-nums">
                          {hhmm(it.start)}–{hhmm(it.end)} {it.noShows >= 2 ? "⚠︎" : ""}
                        </span>
                        <span className="relative z-10 block w-full truncate font-medium">{it.otherBranch ? `En ${it.otherBranch}` : it.customer}</span>
                        {h > 44 ? <span className="relative z-10 block w-full truncate opacity-80">{it.service}</span> : null}
                        {it.processing && !it.otherBranch ? (
                          <span
                            className="pointer-events-none absolute inset-x-0 z-0 flex items-end justify-end border-y border-dashed border-current/30 bg-white/35 px-1.5 text-[9px] tracking-wide uppercase opacity-70"
                            style={{ top: (it.processing.start - it.start) * PPM, height: (it.processing.end - it.processing.start) * PPM }}
                          >
                            pausa
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        {canEdit ? "Arrastra una cita para moverla o reasignarla · clic en un hueco libre para crear · " : ""}rayado = fuera de turno · “pausa” = la especialista queda libre mientras actúa el producto
      </p>

      {selected ? <BookingDetail item={selected} onClose={() => setSelected(null)} canEdit={canEdit} onDone={(t, ok) => (toast.show(t, ok), setSelected(null))} /> : null}
      {create && props.catalog ? (
        <BookingForm
          catalog={props.catalog}
          defaultBranchId={props.branchId}
          defaultDate={props.date}
          preset={{ stylistId: create.stylistId, start: iso(create.min), label: `${columns.find((c) => c.id === create.stylistId)?.name} · ${hhmm(create.min)}`, date: props.date }}
          onClose={() => setCreate(null)}
        />
      ) : null}
      {toast.node}
    </div>
  );
}

function BookingDetail({ item, onClose, canEdit, onDone }: { item: AgendaItem; onClose: () => void; canEdit: boolean; onDone: (text: string, ok: boolean) => void }) {
  const [pending, start] = useTransition();
  const options = (NEXT[item.status] ?? []).filter((s) => canEdit || s === "IN_PROGRESS" || s === "COMPLETED");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      <div className="w-full max-w-md rounded-t-3xl bg-ivory p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-muted">{item.code}</p>
            <h2 id="bd-title" className="font-display text-2xl">
              {item.customer}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-sand" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Servicio</dt>
          <dd>{item.service}</dd>
          <dt className="text-muted">Horario</dt>
          <dd className="tabular-nums">
            {hhmm(item.start)} – {hhmm(item.end)}
            {item.buffer ? ` (+${item.buffer} min de limpieza)` : ""}
          </dd>
          <dt className="text-muted">Estado</dt>
          <dd>
            <StatusBadge status={item.status} label={STATUS_LABELS[item.status]} />
          </dd>
          {item.noShows >= 2 ? (
            <>
              <dt className="text-muted">Aviso</dt>
              <dd className="text-warning">{item.noShows} inasistencias previas</dd>
            </>
          ) : null}
          {item.otherBranch ? (
            <>
              <dt className="text-muted">Sede</dt>
              <dd>{item.otherBranch}</dd>
            </>
          ) : null}
        </dl>
        {!item.otherBranch && options.length ? (
          <div className="flex flex-wrap gap-2">
            {options.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "CANCELLED" || s === "NO_SHOW" ? "secondary" : "primary"}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await changeStatus(item.bookingId, s);
                    onDone(res.ok ? `${item.code}: ${STATUS_LABELS[s]}` : res.error, res.ok);
                  })
                }
              >
                {s === "CONFIRMED" ? "Confirmar" : s === "IN_PROGRESS" ? "Iniciar" : s === "COMPLETED" ? "Completar" : s === "NO_SHOW" ? "No asistió" : "Cancelar"}
              </Button>
            ))}
          </div>
        ) : null}
        {canEdit ? (
          <Link href={`/dashboard/reservas?q=${item.code}`} className="mt-4 inline-block text-xs text-muted underline underline-offset-4 hover:text-ink">
            Ver en reservas
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function AgendaWeek({ days }: { days: Array<{ date: string; label: string; isToday: boolean; href: string; items: Array<{ id: string; time: string; title: string; subtitle: string; status: BookingStatus }> }> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper" data-lenis-prevent>
      <div className="grid min-w-[980px] grid-cols-7 divide-x divide-line/70">
        {days.map((d) => (
          <div key={d.date} className="flex min-h-[60vh] flex-col">
            <Link href={d.href} className={cn("sticky top-0 border-b border-line px-3 py-3 text-sm font-semibold capitalize hover:bg-sand", d.isToday && "text-rose")}>
              {d.label}
              <span className="ml-2 text-xs font-normal text-muted">{d.items.length}</span>
            </Link>
            <div className="flex flex-1 flex-col gap-1.5 p-2">
              {d.items.length === 0 ? <p className="mt-6 text-center text-xs text-muted">Sin citas</p> : null}
              {d.items.map((i) => (
                <div key={i.id} className={cn("rounded-lg border px-2 py-1.5 text-[11px] leading-tight", STATUS_BLOCK[i.status])}>
                  <p className="font-semibold tabular-nums">{i.time}</p>
                  <p className="truncate font-medium">{i.title}</p>
                  <p className="truncate opacity-75">{i.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
