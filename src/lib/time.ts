import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";

/** Fecha local "YYYY-MM-DD" de un instante en la zona horaria dada. */
export function localDateKey(instant: Date | number, tz: string): string {
  return format(new TZDate(+instant, tz), "yyyy-MM-dd");
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Instante UTC de una hora de pared local (minutos desde medianoche) en `tz`. */
export function wallToUtc(dateKey: string, minute: number, tz: string): Date {
  const { y, m, d } = parseDateKey(dateKey);
  const h = Math.floor(minute / 60);
  const mi = minute % 60;
  // TZDate resuelve la hora de pared en la zona (incluido DST).
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, tz).getTime());
}

/** Minutos desde la medianoche local para un instante. */
export function minutesOfDay(instant: Date | number, tz: string): number {
  const z = new TZDate(+instant, tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** Día de la semana (0 = domingo) de una fecha local. */
export function weekdayOf(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysKey(dateKey: string, days: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  return format(addDays(new Date(Date.UTC(y, m - 1, d, 12)), days), "yyyy-MM-dd");
}

export function formatLocal(instant: Date | number, tz: string, pattern: string) {
  return format(new TZDate(+instant, tz), pattern, { locale: es });
}

/** "jueves 24 de octubre, 15:30" en la zona de la sede. */
export function humanDateTime(instant: Date | number, tz: string) {
  return formatLocal(instant, tz, "EEEE d 'de' MMMM, HH:mm");
}

export function minToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function hhmmToMin(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h! * 60 + (m ?? 0);
}

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
