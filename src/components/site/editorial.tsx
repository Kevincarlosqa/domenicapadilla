"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { PHOTOS } from "@/content/images";
import { FadeUp, RevealLines } from "./motion-kit";
import { Photo, RevealPhoto } from "./photo";

const DRIFT = [PHOTOS.portraitShoulders, PHOTOS.brows, PHOTOS.portraitElegant, PHOTOS.nails, PHOTOS.portraitDark, PHOTOS.lashes, PHOTOS.portraitEyesClosed];

/** Collage editorial + fila de retratos que se desliza con el scroll. */
export function Editorial() {
  const reduced = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: rowRef, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["4%", "-38%"]);
  const xBack = useTransform(scrollYProgress, [0, 1], ["-30%", "2%"]);

  return (
    <section aria-labelledby="estudio-title" className="overflow-hidden py-24 md:py-36">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 md:grid-cols-12 md:gap-6 md:px-10">
        <RevealPhoto photo={PHOTOS.portraitHands} sizes="(max-width: 768px) 100vw, 40vw" className="aspect-[3/4] rounded-t-full md:col-span-5" parallax={10} />
        <div className="flex flex-col justify-between gap-10 md:col-span-6 md:col-start-7">
          <div>
            <p className="mb-6 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(02) El estudio</p>
            <h2 id="estudio-title" className="sr-only">
              El estudio
            </h2>
            <RevealLines
              lines={["Belleza silenciosa,", <em key="e">precisión absoluta.</em>]}
              className="font-display text-[clamp(2.6rem,5.4vw,5.6rem)] leading-[0.95] tracking-tight"
            />
            <FadeUp delay={0.2}>
              <p className="mt-8 max-w-md text-ink-soft">
                Nada de excesos ni resultados de molde. Estudiamos tu rostro, tu piel y tu forma de vivir para lograr un cambio que se note… sin que nadie sepa exactamente qué te hiciste.
              </p>
            </FadeUp>
          </div>
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            <RevealPhoto photo={PHOTOS.browsWork} sizes="(max-width: 768px) 50vw, 25vw" className="aspect-[4/5]" parallax={8} delay={0.1} direction="left" />
            <RevealPhoto photo={PHOTOS.lashArtist} sizes="(max-width: 768px) 50vw, 25vw" className="mt-16 aspect-[4/5]" parallax={16} delay={0.25} direction="right" />
          </div>
        </div>
      </div>

      <div ref={rowRef} className="mt-24 space-y-4 md:mt-36 md:space-y-6" aria-hidden>
        <motion.div style={reduced ? undefined : { x }} className="flex w-max gap-4 md:gap-6">
          {DRIFT.map((p, i) => (
            <Photo key={`a${i}`} photo={p} sizes="(max-width: 768px) 45vw, 22vw" className="aspect-[3/4] w-[45vw] shrink-0 md:w-[22vw]" />
          ))}
        </motion.div>
        <motion.div style={reduced ? undefined : { x: xBack }} className="flex w-max items-center gap-4 md:gap-6">
          {["Brows", "Lashes", "Lips", "Skin", "Nails", "Hair"].map((w, i) => (
            <span key={w} className="font-display text-[18vw] leading-none whitespace-nowrap md:text-[11vw]">
              {i % 2 ? <em>{w}</em> : w}
              <span className="mx-[2vw] align-middle text-[0.4em]">*</span>
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
