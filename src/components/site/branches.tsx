"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { LandingData } from "@/lib/landing";
import { cn } from "@/lib/utils";
import { WhatsAppIcon, waLink } from "./icons";
import { RevealLines } from "./motion-kit";

/** Proyección simple lat/lng → caja SVG para un grupo de sedes. */
function project(points: Array<{ lat: number; lng: number }>, w: number, h: number, pad = 40) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const sx = (w - pad * 2) / Math.max(0.001, maxLng - minLng);
  const sy = (h - pad * 2) / Math.max(0.001, maxLat - minLat);
  const s = Math.min(sx, sy);
  return (p: { lat: number; lng: number }) => ({
    x: pad + (p.lng - minLng) * s + (w - pad * 2 - (maxLng - minLng) * s) / 2,
    y: pad + (maxLat - p.lat) * s + (h - pad * 2 - (maxLat - minLat) * s) / 2,
  });
}

export function Branches({ branches }: Pick<LandingData, "branches">) {
  const [active, setActive] = useState(branches[0]?.id ?? "");
  const current = branches.find((b) => b.id === active) ?? branches[0];
  const lima = branches.filter((b) => b.city === "Lima");
  const others = branches.filter((b) => b.city !== "Lima");
  const proj = useMemo(() => project(lima, 520, 420, 70), [lima]);

  return (
    <section id="sedes" aria-labelledby="sedes-title" className="bg-sand/60">
      <div className="mx-auto max-w-[1440px] px-4 py-24 md:px-10 md:py-36">
        <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(06) Sedes</p>
        <h2 id="sedes-title" className="sr-only">
          Sedes
        </h2>
        <RevealLines lines={[`${branches.length} sedes,`, <em key="e" className="text-rose">un solo estándar</em>]} className="mb-14 font-display text-[clamp(2.4rem,5.5vw,5.5rem)] leading-[0.95]" />

        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <ul className="border-t border-ink/15" aria-label="Sedes">
            {branches.map((b, i) => (
              <li key={b.id} className="border-b border-ink/15">
                <button
                  type="button"
                  aria-pressed={b.id === active}
                  onClick={() => setActive(b.id)}
                  onPointerEnter={() => setActive(b.id)}
                  onFocus={() => setActive(b.id)}
                  className="group flex w-full items-baseline gap-4 py-5 text-left"
                >
                  <span className="w-8 text-xs text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className={cn("font-display text-3xl transition-all duration-500 md:text-4xl", b.id === active ? "translate-x-2 text-rose" : "")}>{b.name}</span>
                  <span className="ml-auto text-right text-xs text-muted">
                    {b.district}
                    <br />
                    {b.city}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="relative flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-[2rem] bg-paper">
              <svg viewBox="0 0 520 420" className="h-auto w-full" role="img" aria-label="Mapa esquemático de sedes en Lima">
                <defs>
                  <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                    <path d="M26 0H0V26" fill="none" stroke="#ececea" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="520" height="420" fill="url(#grid)" />
                {/* línea de costa estilizada */}
                <path d="M20 330 C 120 300, 160 380, 250 360 S 420 400, 520 330" fill="none" stroke="#a8a8a4" strokeWidth="2" strokeDasharray="2 6" />
                <text x="30" y="395" className="fill-muted text-[11px]" fontFamily="var(--font-manrope)">
                  Océano Pacífico
                </text>
                {lima.map((b) => {
                  const p = proj(b);
                  const on = b.id === active;
                  return (
                    <g key={b.id} transform={`translate(${p.x} ${p.y})`} onPointerEnter={() => setActive(b.id)} className="cursor-pointer">
                      {on ? (
                        <motion.circle r={26} fill="#0a0a0a" initial={{ scale: 0.4, opacity: 0.5 }} animate={{ scale: [0.6, 1.4], opacity: [0.35, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
                      ) : null}
                      <circle r={on ? 8 : 5} fill={on ? "#0a0a0a" : "#0a0a0a"} />
                      <text y={-14} textAnchor="middle" className={cn("text-[12px] font-semibold", on ? "fill-rose" : "fill-ink")} fontFamily="var(--font-manrope)">
                        {b.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {others.length ? (
                <div className="absolute right-4 bottom-4 flex flex-col gap-1 rounded-2xl bg-ivory p-3 text-xs">
                  {others.map((b) => (
                    <button key={b.id} onClick={() => setActive(b.id)} className={cn("flex items-center gap-2", b.id === active && "font-semibold text-rose")}>
                      <MapPin className="h-3.5 w-3.5" /> {b.name} · {b.city}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              {current ? (
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="grid gap-4 rounded-[2rem] bg-ink p-6 text-ivory md:grid-cols-[1fr_auto] md:p-8"
                  aria-live="polite"
                >
                  <div>
                    <p className="font-display text-3xl">{current.name}</p>
                    <p className="mt-1 text-sm text-ivory/75">
                      {current.address}
                      {current.reference ? ` · ${current.reference}` : ""}, {current.district}
                    </p>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      {current.hours.map((hr) => (
                        <div key={hr.label}>
                          <dt className="text-ivory/50">{hr.label}</dt>
                          <dd className="font-medium">{hr.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="flex flex-col gap-2 md:justify-center">
                    <a href={waLink(current.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ivory px-5 text-sm font-semibold text-ink hover:bg-blush">
                      <WhatsAppIcon className="h-4 w-4" /> Escribir a {current.name}
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${current.address}, ${current.district}, ${current.city}, Perú`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-1 rounded-full border border-ivory/30 px-5 text-sm font-semibold hover:border-ivory"
                    >
                      Cómo llegar <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
