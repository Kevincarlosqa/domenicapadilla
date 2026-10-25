"use client";

import { ReactLenis } from "lenis/react";
import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Scroll suave global. Se desactiva con prefers-reduced-motion. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true, anchors: { offset: -80 } }}>
      {children}
    </ReactLenis>
  );
}

/** Texto que se revela por líneas (cada línea sube desde una máscara). */
export function RevealLines({ lines, className, delay = 0, as: Tag = "h2" }: { lines: ReactNode[]; className?: string; delay?: number; as?: "h1" | "h2" | "p" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();
  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className="block will-change-transform"
            initial={reduced ? false : { y: "110%", rotate: 2 }}
            animate={inView ? { y: "0%", rotate: 0 } : undefined}
            transition={{ duration: 1.1, ease: EASE, delay: delay + i * 0.08 }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Revela letra por letra (para titulares cortos). */
export function RevealChars({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  return (
    <span ref={ref} className={cn("inline-block", className)}>
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) => (
        <span key={i} className="-mb-[0.18em] inline-block overflow-hidden pb-[0.18em] align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            initial={reduced ? false : { y: "105%" }}
            animate={inView ? { y: "0%" } : undefined}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.025 }}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function FadeUp({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 1, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Marquee cuya velocidad y dirección responden al scroll. */
export function VelocityMarquee({ children, baseVelocity = -2, className }: { children: ReactNode; baseVelocity?: number; className?: string }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [-2000, 0, 2000], [-5, 0, 5], { clamp: false });
  const dir = useRef(1);
  useAnimationFrame((_, delta) => {
    if (reduced) return;
    let move = dir.current * baseVelocity * (delta / 1000);
    const f = factor.get();
    if (f < 0) dir.current = -1;
    else if (f > 0) dir.current = 1;
    move += dir.current * move * f;
    // Envolver entre -50 % y 0 % (el contenido está duplicado).
    let next = x.get() + move;
    if (next <= -50) next += 50;
    if (next > 0) next -= 50;
    x.set(next);
  });
  const translate = useTransform(x, (v) => `${v}%`);
  return (
    <div className={cn("overflow-hidden whitespace-nowrap", className)}>
      <motion.div className="flex w-max" style={{ x: translate }}>
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

/** Número que cuenta hasta su valor al entrar en pantalla. */
export function Counter({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1600);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduced]);
  return (
    <span ref={ref} className={className}>
      {value}
      {suffix}
    </span>
  );
}

/** Botón/enlace magnético: se desplaza hacia el cursor. */
export function Magnetic({ children, strength = 0.35, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => (x.set(0), y.set(0))}
    >
      {children}
    </motion.div>
  );
}

/** Palabras que se "llenan" de tinta según avanza el scroll. */
export function ScrollFillText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
          {w}
        </Word>
      ))}
    </p>
  );
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  // Nunca por debajo de 3:1 sobre tinta (texto grande, WCAG AA).
  const opacity = useTransform(progress, range, [0.4, 1]);
  const reduced = useReducedMotion();
  const italic = children.startsWith("_");
  const word = italic ? children.slice(1) : children;
  return (
    <>
      <motion.span style={{ opacity: reduced ? 1 : opacity }} className={italic ? "italic text-blush" : undefined}>
        {word}
      </motion.span>{" "}
    </>
  );
}

/** Mechones: líneas fluidas que se dibujan al hacer scroll (transición entre secciones). */
export function Strands({ className, flip = false }: { className?: string; flip?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const draw = useTransform(scrollYProgress, [0.05, 0.6], [0, 1]);
  const reduced = useReducedMotion();
  const paths = [
    "M-20 120 C 220 20, 420 220, 720 110 S 1180 40, 1460 140",
    "M-20 140 C 240 50, 460 240, 740 130 S 1200 70, 1460 160",
    "M-20 160 C 260 90, 500 250, 760 150 S 1220 100, 1460 175",
    "M-20 100 C 200 10, 380 190, 700 95 S 1160 20, 1460 120",
    "M-20 180 C 300 120, 520 260, 790 170 S 1240 130, 1460 195",
  ];
  return (
    <div ref={ref} className={cn("pointer-events-none", className)} aria-hidden>
    <svg viewBox="0 0 1440 260" preserveAspectRatio="none" className={cn("h-24 w-full md:h-40", flip && "-scale-x-100")}>
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke={i % 2 ? "#8a8a86" : "#0a0a0a"}
          strokeOpacity={i % 2 ? 0.55 : 0.8}
          strokeWidth={i === 2 ? 1.6 : 1}
          strokeLinecap="round"
          style={{ pathLength: reduced ? 1 : draw }}
        />
      ))}
    </svg>
    </div>
  );
}

/** Cursor personalizado: punto + anillo que crece sobre elementos interactivos. Solo con mouse. */
const noopSubscribe = () => () => {};
const finePointer = () => window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Cursor() {
  const enabled = useSyncExternalStore(noopSubscribe, finePointer, () => false);
  const [hovering, setHovering] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 300, damping: 30, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 300, damping: 30, mass: 0.6 });

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("has-custom-cursor");
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-cursor], input, select, textarea, label");
      setHovering(Boolean(el));
      setLabel(el?.dataset.cursor ?? null);
    };
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <>
      <motion.div className="pointer-events-none fixed top-0 left-0 z-[100] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ x, y }} aria-hidden />
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[100] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink/50 text-[10px] font-semibold tracking-widest text-paper uppercase mix-blend-normal"
        style={{ x: rx, y: ry }}
        animate={{ width: label ? 84 : hovering ? 52 : 30, height: label ? 84 : hovering ? 52 : 30, backgroundColor: label ? "rgba(23,20,18,0.92)" : "rgba(23,20,18,0)" }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        aria-hidden
      >
        {label}
      </motion.div>
    </>
  );
}
