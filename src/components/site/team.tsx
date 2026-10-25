"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import type { LandingData } from "@/lib/landing";
import { LEVEL_LABELS } from "@/lib/labels";
import { initials } from "@/lib/utils";
import { RevealLines } from "./motion-kit";

const TONES = [
  ["#e9e9e6", "#0a0a0a"],
  ["#e4e4e1", "#0a0a0a"],
  ["#a8a8a4", "#000000"],
  ["#ececea", "#5f5f5c"],
] as const;

/** Retrato editorial generado (monograma) mientras no haya foto real. */
function Portrait({ name, i, photoUrl }: { name: string; i: number; photoUrl: string | null }) {
  const [bg, fg] = TONES[i % TONES.length]!;
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- URL configurable desde el panel (dominio arbitrario)
    return <img src={photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <div className="relative h-full w-full" style={{ background: `radial-gradient(120% 90% at 30% 20%, #ffffff 0%, ${bg} 60%)` }}>
      <LogoMark className="absolute -right-10 -bottom-10 h-56 w-56 opacity-[0.08] transition-transform duration-[1.6s] ease-[cubic-bezier(.22,1,.36,1)] group-hover:rotate-90" title="" />
      <span className="absolute inset-0 flex items-center justify-center font-display text-[9rem] leading-none italic" style={{ color: fg }}>
        {initials(name)}
      </span>
    </div>
  );
}

export function Team({ stylists }: Pick<LandingData, "stylists">) {
  const reduced = useReducedMotion();
  const featured = stylists.slice(0, 8);
  const rest = stylists.slice(8);
  return (
    <section id="equipo" aria-labelledby="team-title" className="mx-auto max-w-[1440px] px-4 py-24 md:px-10 md:py-36">
      <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(05) Equipo</p>
          <h2 id="team-title" className="sr-only">
            Nuestro equipo
          </h2>
          <RevealLines lines={["Manos que", <em key="e" className="text-rose">entienden tu rostro</em>]} className="font-display text-[clamp(2.4rem,5.5vw,5.5rem)] leading-[0.95]" />
        </div>
        <p className="max-w-sm text-sm text-muted">Especialistas formadas en el método DP. Puedes pedir a tu favorita al reservar o dejar que te asignemos la que tenga el mejor horario.</p>
      </div>
      <ul className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((s, i) => (
          <motion.li
            key={s.id}
            initial={reduced ? false : { opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: (i % 4) * 0.08 }}
            className={i % 4 === 1 || i % 4 === 3 ? "lg:mt-16" : ""}
          >
            <article className="group" tabIndex={0} aria-label={`${s.name}, ${s.title}`} data-cursor="Hola">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[1.6rem]">
                <div className="h-full w-full transition-transform duration-[1.2s] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-110 group-focus-visible:scale-110">
                  <Portrait name={s.name} i={i} photoUrl={s.photoUrl} />
                </div>
                <div className="absolute inset-0 flex flex-col justify-end bg-ink/85 p-6 text-ivory transition-[clip-path] duration-700 ease-[cubic-bezier(.76,0,.24,1)] [clip-path:inset(100%_0_0_0)] group-hover:[clip-path:inset(0_0_0_0)] group-focus-visible:[clip-path:inset(0_0_0_0)]">
                  <p className="font-display text-2xl leading-tight">{s.bio}</p>
                  <p className="mt-4 text-xs tracking-widest text-ivory/70 uppercase">{s.branches.join(" · ")}</p>
                </div>
                <span className="absolute top-4 left-4 rounded-full bg-paper px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">{LEVEL_LABELS[s.level]}</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl">{s.name}</h3>
                <span className="text-right text-xs text-muted">{s.title}</span>
              </div>
            </article>
          </motion.li>
        ))}
      </ul>
      {rest.length ? (
        <p className="mt-16 max-w-3xl text-sm text-muted">
          Y también: {rest.map((s) => `${s.name} (${s.title.toLowerCase()})`).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
