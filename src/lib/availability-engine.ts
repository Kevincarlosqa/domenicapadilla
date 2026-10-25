/**
 * Motor de disponibilidad puro (sin base de datos) para poder testearlo.
 * Reglas en docs/business-logic.md §4. Todo se trabaja en milisegundos UTC;
 * las horas de pared de la sede se convierten con su zona horaria.
 */
import { wallToUtc, weekdayOf } from "./time";

export type Level = "JUNIOR" | "SENIOR" | "MASTER";

export interface Interval {
  start: number;
  end: number;
}

export interface WeeklyRange {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface EngineBranch {
  id: string;
  timezone: string;
  stations: number;
  slotIntervalMin: number;
  minLeadMinutes: number;
  maxDaysAhead: number;
}

export interface EngineStylist {
  id: string;
  name: string;
  level: Level;
  /** Servicios que sabe hacer, con duración/precio propios opcionales. */
  skills: Map<string, { durationMin?: number | null; priceCents?: number | null }>;
  /** Franjas en ESTA sede. */
  schedules: WeeklyRange[];
  timeOff: Interval[];
  /** Ocupación existente en cualquier sede (ya sin ventanas de processing). */
  busy: Interval[];
}

/** Ítem ya resuelto contra el catálogo de la sede (variante y override aplicados). */
export interface EngineItem {
  serviceId: string;
  variantId?: string | null;
  name: string;
  durationMin: number;
  priceCents: number;
  bufferMin: number;
  processingOffsetMin?: number | null;
  processingMin?: number | null;
  /** Especialista pedida para este ítem; null/undefined = cualquiera. */
  stylistId?: string | null;
}

export interface EngineInput {
  branch: EngineBranch;
  hours: WeeklyRange[];
  closures: Interval[];
  stylists: EngineStylist[];
  /** Ocupación de camillas de la sede: un intervalo por reserva activa. */
  stationUsage: Interval[];
  items: EngineItem[];
  now: number;
  /** Walk-in: ignora anticipación mínima. */
  ignoreLead?: boolean;
}

export interface SlotItem {
  serviceId: string;
  variantId: string | null;
  name: string;
  stylistId: string;
  stylistName: string;
  start: number;
  end: number;
  busyUntil: number;
  processingStart: number | null;
  processingEnd: number | null;
  durationMin: number;
  priceCents: number;
}

export interface Slot {
  start: number;
  end: number;
  totalCents: number;
  items: SlotItem[];
}

const MIN = 60_000;
const LEVEL_RANK: Record<Level, number> = { JUNIOR: 0, SENIOR: 1, MASTER: 2 };

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const contains = (outer: Interval, inner: Interval) => outer.start <= inner.start && inner.end <= outer.end;

interface DayContext {
  open: Interval[];
  work: Map<string, Interval[]>;
  dayStart: number;
  dayEnd: number;
}

function buildDay(input: EngineInput, dateKey: string): DayContext {
  const tz = input.branch.timezone;
  const wd = weekdayOf(dateKey);
  const toIntervals = (ranges: WeeklyRange[]) =>
    ranges
      .filter((r) => r.weekday === wd && r.endMin > r.startMin)
      .map((r) => ({ start: wallToUtc(dateKey, r.startMin, tz).getTime(), end: wallToUtc(dateKey, r.endMin, tz).getTime() }))
      .sort((a, b) => a.start - b.start);
  const work = new Map<string, Interval[]>();
  for (const s of input.stylists) work.set(s.id, toIntervals(s.schedules));
  return {
    open: toIntervals(input.hours),
    work,
    dayStart: wallToUtc(dateKey, 0, tz).getTime(),
    dayEnd: wallToUtc(dateKey, 24 * 60 - 1, tz).getTime(),
  };
}

/** Segmentos en los que la especialista está ocupada (excluye la ventana de processing). */
function busySegments(item: EngineItem, start: number, durationMin: number, withBuffer: boolean): Interval[] {
  const end = start + durationMin * MIN;
  const tail = end + (withBuffer ? item.bufferMin * MIN : 0);
  const off = item.processingOffsetMin;
  const proc = item.processingMin;
  if (off != null && proc && off + proc < durationMin) {
    const ps = start + off * MIN;
    const pe = ps + proc * MIN;
    return [
      { start, end: ps },
      { start: pe, end: tail },
    ];
  }
  return [{ start, end: tail }];
}

function maxConcurrency(usage: Interval[], window: Interval): number {
  const events: Array<[number, number]> = [];
  for (const u of usage) {
    if (!overlaps(u, window)) continue;
    events.push([Math.max(u.start, window.start), 1], [Math.min(u.end, window.end), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, delta] of events) {
    cur += delta;
    max = Math.max(max, cur);
  }
  return max;
}

interface Tentative {
  stylistId: string;
  segments: Interval[];
}

function stylistFits(
  stylist: EngineStylist,
  work: Interval[],
  segments: Interval[],
  span: Interval,
  tentative: Tentative[],
): boolean {
  if (!work.some((w) => contains(w, span))) return false;
  for (const seg of segments) {
    if (stylist.timeOff.some((t) => overlaps(t, seg))) return false;
    if (stylist.busy.some((b) => overlaps(b, seg))) return false;
    for (const t of tentative) {
      if (t.stylistId === stylist.id && t.segments.some((x) => overlaps(x, seg))) return false;
    }
  }
  return true;
}

/** Hueco muerto que deja asignar este ítem: distancia al fin de la ocupación previa o al inicio del turno. */
function deadGap(stylist: EngineStylist, work: Interval[], start: number): number {
  let prevEnd = -Infinity;
  for (const w of work) if (w.start <= start && start <= w.end) prevEnd = Math.max(prevEnd, w.start);
  for (const b of stylist.busy) if (b.end <= start) prevEnd = Math.max(prevEnd, b.end);
  return prevEnd === -Infinity ? Number.MAX_SAFE_INTEGER : start - prevEnd;
}

function dayLoad(stylist: EngineStylist, day: DayContext): number {
  let total = 0;
  for (const b of stylist.busy) {
    const s = Math.max(b.start, day.dayStart);
    const e = Math.min(b.end, day.dayEnd);
    if (e > s) total += e - s;
  }
  return total;
}

/** Intenta construir la reserva que empieza en `start`. Devuelve null si no cabe. */
function tryAssign(input: EngineInput, day: DayContext, start: number): Slot | null {
  const byId = new Map(input.stylists.map((s) => [s.id, s]));
  const tentative: Tentative[] = [];
  const items: SlotItem[] = [];
  let cursor = start;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]!;
    const candidates = item.stylistId
      ? [byId.get(item.stylistId)].filter((s): s is EngineStylist => Boolean(s?.skills.has(item.serviceId)))
      : input.stylists.filter((s) => s.skills.has(item.serviceId));

    let best: { s: EngineStylist; duration: number; price: number; score: [number, number, number] } | null = null;
    for (const s of candidates) {
      const skill = s.skills.get(item.serviceId)!;
      const duration = skill.durationMin ?? item.durationMin;
      const segments = busySegments(item, cursor, duration, true);
      const span = { start: cursor, end: segments[segments.length - 1]!.end };
      // Los ítems previos de la misma reserva se comparan sin su buffer.
      if (!stylistFits(s, day.work.get(s.id) ?? [], segments, span, tentative)) continue;
      const score: [number, number, number] = [
        deadGap(s, day.work.get(s.id) ?? [], cursor),
        dayLoad(s, day),
        LEVEL_RANK[s.level],
      ];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) {
        best = { s, duration, price: skill.priceCents ?? item.priceCents, score };
      }
    }
    if (!best) return null;

    const segsNoBuffer = busySegments(item, cursor, best.duration, false);
    tentative.push({ stylistId: best.s.id, segments: segsNoBuffer });
    const end = cursor + best.duration * MIN;
    const hasProc = item.processingOffsetMin != null && item.processingMin && item.processingOffsetMin + item.processingMin < best.duration;
    items.push({
      serviceId: item.serviceId,
      variantId: item.variantId ?? null,
      name: item.name,
      stylistId: best.s.id,
      stylistName: best.s.name,
      start: cursor,
      end,
      busyUntil: end + item.bufferMin * MIN,
      processingStart: hasProc ? cursor + item.processingOffsetMin! * MIN : null,
      processingEnd: hasProc ? cursor + (item.processingOffsetMin! + item.processingMin!) * MIN : null,
      durationMin: best.duration,
      priceCents: best.price,
    });
    cursor = end;
  }

  // Entre ítems consecutivos de la misma especialista no hay buffer.
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i]!.stylistId === items[i + 1]!.stylistId) items[i]!.busyUntil = items[i]!.end;
  }

  const end = cursor;
  const stationSpan = { start, end: Math.max(...items.map((x) => x.busyUntil)) };
  if (!day.open.some((o) => contains(o, { start, end }))) return null;
  if (input.closures.some((c) => overlaps(c, stationSpan))) return null;
  if (maxConcurrency(input.stationUsage, stationSpan) + 1 > input.branch.stations) return null;

  return { start, end, totalCents: items.reduce((a, x) => a + x.priceCents, 0), items };
}

/** Todos los horarios disponibles para una fecha local "YYYY-MM-DD". */
export function slotsForDate(input: EngineInput, dateKey: string): Slot[] {
  if (input.items.length === 0) return [];
  const day = buildDay(input, dateKey);
  const minStart = input.ignoreLead ? input.now - 5 * MIN : input.now + input.branch.minLeadMinutes * MIN;
  const maxStart = input.now + input.branch.maxDaysAhead * 24 * 60 * MIN;
  const step = input.branch.slotIntervalMin * MIN;
  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (const range of day.open) {
    for (let t = range.start; t < range.end; t += step) {
      if (t < minStart || t > maxStart || seen.has(t)) continue;
      seen.add(t);
      const slot = tryAssign(input, day, t);
      if (slot) slots.push(slot);
    }
  }
  return slots;
}

/** Verifica un inicio concreto (revalidación dentro de la transacción). */
export function checkStart(input: EngineInput, dateKey: string, start: number): Slot | null {
  if (input.items.length === 0) return null;
  const minStart = input.ignoreLead ? input.now - 5 * MIN : input.now + input.branch.minLeadMinutes * MIN;
  if (start < minStart || start > input.now + input.branch.maxDaysAhead * 24 * 60 * MIN) return null;
  return tryAssign(input, buildDay(input, dateKey), start);
}
