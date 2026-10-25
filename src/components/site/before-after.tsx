"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { RevealLines } from "./motion-kit";

/** Cejas ilustradas: "antes" (escasas y asimétricas) y "después" (pelo a pelo definido). */
function Brows({ after }: { after: boolean }) {
  const hairs = (side: 1 | -1) =>
    Array.from({ length: after ? 46 : 18 }, (_, i) => {
      const n = after ? 45 : 17;
      const t = i / n;
      const x = 300 + side * (40 + t * 190);
      const arch = after ? Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.85) * 34 : Math.sin(t * Math.PI) * 18 + (side < 0 ? 6 : -4);
      const y = 210 - arch + (after ? t * t * 18 : 10);
      const len = after ? 16 - t * 6 : 9 + ((i * 7) % 5);
      const ang = side * (after ? 25 + t * 45 : 35 + ((i * 13) % 30));
      const rad = (ang * Math.PI) / 180;
      return (
        <path
          key={`${side}-${i}`}
          d={`M${x.toFixed(1)} ${y.toFixed(1)} q ${(Math.cos(rad) * len * 0.5).toFixed(1)} ${(-len * 0.6).toFixed(1)} ${(Math.cos(rad) * len).toFixed(1)} ${(-Math.abs(Math.sin(rad)) * len - 4).toFixed(1)}`}
          stroke={after ? "#111111" : "#6b6b68"}
          strokeWidth={after ? 1.6 : 1.2}
          strokeLinecap="round"
          fill="none"
          opacity={after ? 0.75 + (i % 3) * 0.08 : 0.45 + (i % 4) * 0.1}
        />
      );
    });
  return (
    <svg viewBox="0 0 600 420" className="h-full w-full" aria-hidden>
      <rect width="600" height="420" fill={after ? "#efefed" : "#e6e6e3"} />
      {/* ojos */}
      {[-1, 1].map((s) => (
        <g key={s} transform={`translate(${300 + s * 135} 285)`}>
          <path d="M-75 0 Q 0 -42 75 0 Q 0 34 -75 0 Z" fill="#ffffff" stroke="#2b2b2b" strokeWidth={1.2} />
          <circle r="17" fill="#1a1a1a" />
          <circle r="5" cx="5" cy="-5" fill="#fff" opacity={0.8} />
          {after ? <path d="M-75 0 Q 0 -44 75 0" stroke="#0a0a0a" strokeWidth={3} fill="none" /> : null}
        </g>
      ))}
      {hairs(-1)}
      {hairs(1)}
    </svg>
  );
}

export function BeforeAfter() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pct, setPct] = useState(50);
  const raw = useMotionValue(50);
  const smooth = useSpring(raw, { stiffness: 260, damping: 30 });
  // Máscara orgánica: el borde del "después" es una curva que ondula según la velocidad.
  const size = useRef({ w: 600, h: 420 });
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      raw.set(raw.get() + 0.0001);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [raw]);
  // path() usa píxeles del elemento: se recalcula con su tamaño real.
  const clip = useTransform(smooth, (v) => {
    const { w, h } = size.current;
    const x = (v / 100) * w;
    const wob = Math.min(22, w * 0.03);
    return `path("M0 0 L${x + wob} 0 C ${x - wob} ${h * 0.25}, ${x + wob * 1.4} ${h * 0.5}, ${x - wob * 0.4} ${h * 0.75} S ${x + wob} ${h}, ${x} ${h} L0 ${h} Z")`;
  });

  const set = (v: number) => {
    const c = Math.max(0, Math.min(100, v));
    setPct(c);
    raw.set(c);
  };
  const fromPointer = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    set(((clientX - r.left) / r.width) * 100);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") set(pct - 5);
    if (e.key === "ArrowRight") set(pct + 5);
    if (e.key === "Home") set(0);
    if (e.key === "End") set(100);
  };

  return (
    <section aria-labelledby="ba-title" className="mx-auto grid max-w-[1440px] gap-12 px-4 py-24 md:grid-cols-[1fr_1.3fr] md:items-center md:px-10 md:py-36">
      <div>
        <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(04) Antes / después</p>
        <h2 id="ba-title" className="sr-only">
          Antes y después
        </h2>
        <RevealLines lines={["Pelo a pelo,", <em key="e" className="text-rose">sin que se note.</em>]} className="font-display text-[clamp(2.4rem,5vw,5rem)] leading-[0.95]" />
        <p className="mt-6 max-w-md text-ink-soft">
          El microblading dibuja trazos que imitan la dirección real de tu vello. Desliza para comparar. Ilustración de referencia: en sede te mostramos el portafolio real de cada especialista.
        </p>
      </div>
      <div
        ref={ref}
        className="relative aspect-[10/7] touch-none overflow-hidden rounded-[2rem] select-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        data-cursor="Desliza"
      >
        <div className="absolute inset-0">
          <Brows after={false} />
        </div>
        <motion.div className="absolute inset-0" style={reduced ? { clipPath: `inset(0 ${100 - pct}% 0 0)` } : { clipPath: clip }}>
          <Brows after />
        </motion.div>
        <span className="absolute top-4 left-4 rounded-full bg-paper/90 px-3 py-1 text-xs font-semibold">Después</span>
        <span className="absolute top-4 right-4 rounded-full bg-paper/90 px-3 py-1 text-xs font-semibold">Antes</span>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Comparar antes y después"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          onKeyDown={onKey}
          className="absolute top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-paper shadow-xl"
          style={{ left: `${pct}%` }}
        >
          ⟷
        </div>
      </div>
    </section>
  );
}
