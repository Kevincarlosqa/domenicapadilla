"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Testimonial } from "@/content/testimonials";

export function Testimonials({ items }: { items: Testimonial[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 6500);
    return () => clearInterval(t);
  }, [paused, items.length]);
  if (!items.length) return null;
  const t = items[i]!;

  return (
    <section aria-labelledby="test-title" className="mx-auto max-w-[1440px] px-4 py-24 md:px-10 md:py-36" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(08) Clientas</p>
      <h2 id="test-title" className="sr-only">
        Testimonios
      </h2>
      <div className="relative min-h-[16rem] md:min-h-[20rem]" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.figure key={i} initial={{ opacity: 0, y: 24, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -16, filter: "blur(6px)" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <blockquote className="max-w-5xl font-display text-[clamp(1.9rem,4.2vw,4rem)] leading-[1.08]">“{t.quote}”</blockquote>
            <figcaption className="mt-8 text-sm text-muted">
              <span className="font-semibold text-ink">{t.author}</span> · {t.service} · {t.branch}
            </figcaption>
          </motion.figure>
        </AnimatePresence>
      </div>
      <div className="mt-10 flex gap-2" role="tablist" aria-label="Testimonios">
        {items.map((_, k) => (
          <button key={k} role="tab" aria-selected={k === i} aria-label={`Testimonio ${k + 1}`} onClick={() => setI(k)} className="h-1.5 w-12 overflow-hidden rounded-full bg-ink/15">
            {k === i ? <motion.span key={`${i}-${paused}`} className="block h-full bg-ink" initial={{ width: "0%" }} animate={{ width: paused ? "100%" : "100%" }} transition={{ duration: paused ? 0 : 6.5, ease: "linear" }} /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
