"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { PHOTOS } from "@/content/images";
import { Counter, FadeUp, ScrollFillText } from "./motion-kit";
import { Photo } from "./photo";

const STEPS = [
  { n: "01", title: "Diagnóstico", body: "Analizamos tu piel, tu historial y lo que quieres lograr. Si hace falta, hacemos prueba de alergia o evaluación previa.", photo: PHOTOS.skinMassage },
  { n: "02", title: "Diseño a medida", body: "Visagismo con medidas reales de tu rostro. Dibujamos y ajustamos hasta que digas “esa soy yo”.", photo: PHOTOS.browsWork },
  { n: "03", title: "Técnica", body: "Pigmentos de grado cosmético, agujas descartables y protocolos de bioseguridad en cada cabina.", photo: PHOTOS.lashArtist },
  { n: "04", title: "Retoque", body: "A los 30–45 días perfeccionamos la retención. Tu ficha técnica guarda fórmula y tono para siempre.", photo: PHOTOS.portraitEyesClosed },
];

export function Philosophy({ stats }: { stats: { branches: number; stylists: number; services: number; cities: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Desplazamiento exacto: lo que sobra del carril respecto al ancho de la ventana.
  const trackRef = useRef<HTMLOListElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDistance(Math.max(0, el.scrollWidth - window.innerWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -distance]);
  const spin = useTransform(scrollYProgress, [0, 1], [0, 180]);

  return (
    <section id="filosofia" aria-labelledby="filo-title" className="bg-ink text-ivory">
      <div className="mx-auto max-w-[1440px] px-4 pt-24 pb-16 md:px-10 md:pt-36">
        <p className="mb-8 text-xs font-semibold tracking-[0.3em] text-ivory/60 uppercase">(03) Filosofía</p>
        <h2 id="filo-title" className="sr-only">
          Nuestra filosofía
        </h2>
        <ScrollFillText
          className="max-w-6xl font-display text-[clamp(2rem,4.6vw,4.6rem)] leading-[1.05] tracking-tight"
          text="No creemos en un solo tipo de belleza. Creemos en _la tuya: realzada con precisión, diseñada para tu rostro y hecha para durar. Eso es _micropigmentación con criterio."
        />
        <dl className="mt-20 grid grid-cols-2 gap-y-10 border-t border-ivory/15 pt-10 md:grid-cols-4">
          {[
            { v: stats.branches, label: "sedes" },
            { v: stats.stylists, label: "especialistas" },
            { v: stats.services, label: "servicios" },
            { v: stats.cities, label: "ciudades" },
          ].map((s) => (
            <div key={s.label}>
              <dd className="font-display text-6xl md:text-8xl">
                <Counter to={s.v} />
              </dd>
              <dt className="mt-1 text-sm text-ivory/60">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* Proceso: scroll horizontal fijado (vertical en móvil o con movimiento reducido) */}
      <div ref={ref} className={reduced ? "" : "relative md:h-[260vh]"}>
        <div className={reduced ? "" : "md:sticky md:top-0 md:flex md:h-screen md:items-center md:overflow-hidden"}>
          <motion.ol ref={trackRef} style={reduced ? undefined : { x }} className="flex flex-col gap-6 px-4 pb-24 md:flex-row md:gap-8 md:px-10 md:pb-0">
            <li className="flex shrink-0 flex-col justify-between md:w-[34vw]">
              <p className="text-xs font-semibold tracking-[0.3em] text-ivory/60 uppercase">El método DP</p>
              <p className="mt-4 font-display text-5xl leading-none md:text-7xl">
                Cuatro pasos,
                <br />
                <em className="text-blush">cero improvisación.</em>
              </p>
              <motion.div style={reduced ? undefined : { rotate: spin }} className="mt-10 hidden md:block">
                <LogoMark className="h-28 w-28 text-ivory/80" title="" />
              </motion.div>
            </li>
            {STEPS.map((s) => (
              <li key={s.n} className="group relative flex min-h-[340px] shrink-0 flex-col justify-between overflow-hidden rounded-[2rem] border border-ivory/15 p-8 md:h-[62vh] md:w-[30vw]">
                <span className="absolute inset-0 opacity-25 transition-opacity duration-700 group-hover:opacity-70">
                  <Photo photo={s.photo} sizes="(max-width: 768px) 100vw, 30vw" className="h-full w-full transition-transform duration-[1.6s] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-110" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
                <span className="relative font-display text-8xl text-ivory/45 md:text-9xl" aria-hidden>{s.n}</span>
                <div className="relative">
                  <h3 className="font-display text-4xl">{s.title}</h3>
                  <p className="mt-3 max-w-sm text-ivory/75">{s.body}</p>
                </div>
              </li>
            ))}
          </motion.ol>
        </div>
      </div>
      <FadeUp className="mx-auto max-w-[1440px] px-4 pb-24 md:px-10">
        <p className="max-w-xl text-sm text-ivory/60">Trabajamos con consentimiento informado y ficha técnica individual. Si tienes alergias, estás embarazada o tomas medicación, cuéntanos antes: una especialista te orientará.</p>
      </FadeUp>
    </section>
  );
}
