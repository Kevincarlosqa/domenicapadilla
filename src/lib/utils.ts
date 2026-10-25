import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const pen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const penExact = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

/** Formatea céntimos de sol: 18000 → "S/ 180". */
export function formatMoney(cents: number, exact = false) {
  return (exact ? penExact : pen).format(cents / 100);
}

export function formatPrice(cents: number, from: boolean) {
  return `${from ? "desde " : ""}${formatMoney(cents)}`;
}

export function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Normaliza un teléfono a E.164. Los números peruanos de 9 dígitos que empiezan
 * en 9 se asumen +51. Devuelve null si no parece un teléfono válido.
 */
export function normalizePhone(raw: string, defaultCountry = "51"): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) d = defaultCountry + d;
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Código corto legible sin caracteres ambiguos: DP-7KQ4M. */
export function bookingCode(random: () => number = Math.random) {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `DP-${s}`;
}

/** Distancia en km entre dos coordenadas (Haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
