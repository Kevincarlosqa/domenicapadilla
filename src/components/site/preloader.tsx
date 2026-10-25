"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ARM_ANGLES, PETAL } from "@/components/brand/logo";

/** Preloader breve: los pétalos del asterisco se despliegan y la cortina sube. Solo la primera visita de la sesión. */
const noopSubscribe = () => () => {};
let introSeen: boolean | undefined;
/** Se lee una sola vez por carga: ¿ya se vio la intro en esta sesión? */
function seenIntro() {
  if (introSeen === undefined) {
    try {
      introSeen = sessionStorage.getItem("dp-intro") === "1";
      sessionStorage.setItem("dp-intro", "1");
    } catch {
      introSeen = false;
    }
  }
  return introSeen;
}

export function Preloader() {
  const reduced = useReducedMotion();
  const seen = useSyncExternalStore(noopSubscribe, seenIntro, () => false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);
  const show = !done && !seen && !reduced;

  useEffect(() => {
    if (seen || reduced) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1000);
      setCount(Math.round(100 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setDone(true), 150);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="pre"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink text-ivory [animation:dp-pre-hide_0s_linear_3.5s_forwards]"
          exit={{ clipPath: "inset(0 0 100% 0)" }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          aria-hidden
        >
          <svg viewBox="-50 -50 100 100" className="h-28 w-28" fill="currentColor">
            {ARM_ANGLES.map((r, i) => (
              <motion.path
                key={r}
                d={PETAL}
                initial={{ rotate: r - 72, scale: 0, opacity: 0 }}
                animate={{ rotate: r, scale: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ originX: "0px", originY: "0px" }}
              />
            ))}
          </svg>
          <span className="absolute right-6 bottom-6 font-display text-7xl tabular-nums md:right-10 md:bottom-8 md:text-9xl">{count}</span>
          <span className="absolute bottom-8 left-6 text-xs tracking-[0.3em] uppercase md:left-10">All types of beauty*</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
