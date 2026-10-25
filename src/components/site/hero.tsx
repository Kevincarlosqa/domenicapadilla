"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { PHOTOS, unsplash } from "@/content/images";
import { cn } from "@/lib/utils";
import { Magnetic, RevealChars } from "./motion-kit";
import { WhatsAppIcon } from "./icons";

const SLIDES = [
  { photo: PHOTOS.heroMain, label: "Brows", es: "Cejas que enmarcan" },
  { photo: PHOTOS.heroLashes, label: "Lashes", es: "Mirada que despierta" },
  { photo: PHOTOS.lips, label: "Lips", es: "Labios con intención" },
  { photo: PHOTOS.portraitProfile, label: "Skin", es: "Piel que respira" },
];

const SILK = [0.22, 1, 0.36, 1] as const;
const CURTAIN = [0.76, 0, 0.24, 1] as const;

/** Sello circular giratorio con el lema. */
function Badge() {
  return (
    <a href="#reservar" aria-label="Reservar una cita" className="group relative flex h-32 w-32 items-center justify-center rounded-full bg-ink text-paper md:h-40 md:w-40" data-cursor="Reservar">
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full animate-spin-slow" aria-hidden>
        <defs>
          <path id="badge-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <text className="fill-current text-[15px] tracking-[0.32em] uppercase" fontFamily="var(--font-manrope)">
          <textPath href="#badge-circle">Reserva tu cita · All types of beauty ·</textPath>
        </text>
      </svg>
      <LogoMark className="h-9 w-9 transition-transform duration-700 group-hover:rotate-180 md:h-11 md:w-11" title="" />
    </a>
  );
}

export function Hero({ whatsappHref, branchCount }: { whatsappHref: string; branchCount: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [{ index, prev }, setSlide] = useState({ index: 0, prev: -1 });

  // El carrusel arranca con la primera interacción (o a los 9 s): la carga inicial queda quieta y rápida.
  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    const start = () => {
      if (timer) return;
      timer = window.setInterval(() => setSlide(({ index: i }) => ({ index: (i + 1) % SLIDES.length, prev: i })), 5200);
    };
    const fallback = window.setTimeout(start, 9000);
    const events = ["pointermove", "scroll", "touchstart", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }));
    return () => {
      window.clearTimeout(fallback);
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, start));
    };
  }, [reduced]);

  // Al hacer scroll, el arco se abre hasta ocupar toda la pantalla.
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const grow = useTransform(p, [0, 0.8], [0, 1], { clamp: true });
  const width = useTransform(grow, (t) => `calc(var(--arch-w) + (100vw - var(--arch-w)) * ${t})`);
  const height = useTransform(grow, (t) => `calc(var(--arch-h) + (100svh - var(--arch-h)) * ${t})`);
  const radius = useTransform(p, [0, 0.65], [1000, 0]);
  const leftX = useTransform(p, [0, 0.55], ["0vw", "-45vw"]);
  const rightX = useTransform(p, [0, 0.55], ["0vw", "45vw"]);
  const fade = useTransform(p, [0, 0.35], [1, 0]);
  const shade = useTransform(p, [0.45, 0.95], [0, 0.5]);
  const quote = useTransform(p, [0.7, 0.95], [0, 1]);
  const quoteY = useTransform(p, [0.7, 1], [40, 0]);
  const slide = SLIDES[index]!;

  return (
    <section ref={ref} id="inicio" aria-label="Doménica Padilla" className={cn("relative bg-ivory", reduced ? "" : "h-[230svh]")}>
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-ivory [--arch-h:clamp(14rem,calc(100svh-22.5rem),34rem)] [--arch-w:min(82vw,24rem)] md:[--arch-h:74svh] md:[--arch-w:30vw]">
        {/* Arco con los retratos */}
        <motion.div
          className="absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-ink"
          style={
            reduced
              ? { width: "var(--arch-w)", height: "var(--arch-h)", borderTopLeftRadius: 1000, borderTopRightRadius: 1000 }
              : { width, height, borderTopLeftRadius: radius, borderTopRightRadius: radius }
          }
        >
          {/* Apertura inicial: como un párpado que se abre */}
          <div className="absolute inset-0">
            {/* Todas las fotos quedan montadas (precargadas); la activa entra con una cortina sobre la anterior. */}
            {SLIDES.map((sl, i) => {
              const active = i === index;
              const previous = i === prev;
              return (
                <motion.div
                  key={sl.label}
                  className="absolute inset-0"
                  style={{ zIndex: active ? 2 : previous ? 1 : 0 }}
                  initial={false}
                  animate={{ clipPath: active || previous ? "inset(0% 0 0 0)" : "inset(100% 0 0 0)" }}
                  transition={{ duration: active ? 1.3 : 0, ease: CURTAIN }}
                >
                  {/* Zoom lento hacia adentro durante toda la vida de la foto. Al pasar a "anterior" conserva
                      el mismo destino, así que sigue su curso bajo la cortina en lugar de saltar. */}
                  <motion.div
                    className="absolute inset-0"
                    initial={{ scale: 1 }}
                    animate={{ scale: active || previous ? 1.18 : 1 }}
                    transition={active || previous ? { duration: 7.5, ease: "linear" } : { duration: 0 }}
                  >
                    <Image
                      src={unsplash(sl.photo)}
                      alt={active ? sl.photo.alt : ""}
                      fill
                      priority={i === 0}
                      sizes="(max-width: 767px) 80vw, 60vw"
                      quality={75}
                      className="transform-gpu object-cover grayscale contrast-[1.1]"
                    />
                  </motion.div>
                </motion.div>
              );
            })}
            <motion.div className="absolute inset-0 z-[3] bg-black" style={{ opacity: reduced ? 0 : shade }} />
            {/* Apertura inicial como un párpado: dos paneles que se retiran (la foto ya está pintada debajo). */}
            {!reduced ? (
              <>
                <motion.div className="absolute inset-x-0 top-0 z-[4] h-1/2 bg-ivory" initial={{ y: "0%" }} animate={{ y: "-101%" }} transition={{ duration: 1.5, ease: CURTAIN, delay: 0.2 }} />
                <motion.div className="absolute inset-x-0 bottom-0 z-[4] h-1/2 bg-ivory" initial={{ y: "0%" }} animate={{ y: "101%" }} transition={{ duration: 1.5, ease: CURTAIN, delay: 0.2 }} />
              </>
            ) : null}
          </div>

          {/* Frase final al quedar la foto a pantalla completa */}
          {!reduced ? (
            <motion.div style={{ opacity: quote, y: quoteY }} className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
              <p className="mb-5 text-[11px] font-semibold tracking-[0.4em] uppercase">Doménica Padilla</p>
              <p className="max-w-4xl font-display text-[clamp(2.4rem,6vw,6.5rem)] leading-[0.95]">
                No cubrimos tu rostro.
                <br />
                <em>Lo revelamos.</em>
              </p>
            </motion.div>
          ) : null}
        </motion.div>

        {/* Titular: blanco en modo diferencia (negro sobre blanco, blanco sobre la foto) */}
        <motion.div style={reduced ? undefined : { opacity: fade }} className="pointer-events-none relative z-10 mx-auto flex h-full max-w-[1500px] flex-col px-4 pt-[5.5rem] pb-24 text-ink md:justify-between md:px-10 md:pt-32 md:pb-10 md:text-white md:mix-blend-difference">
          <div className="flex shrink-0 items-start justify-between text-[10px] font-semibold tracking-[0.28em] uppercase md:text-[11px] md:tracking-[0.32em]">
            <motion.p initial={reduced ? false : { y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1, ease: SILK, delay: 0.6 }}>
              Expertos en
              <br />
              micropigmentación
            </motion.p>
            <motion.p className="text-right" initial={reduced ? false : { y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1, ease: SILK, delay: 0.7 }}>
              {branchCount} sedes
              <br />
              Lima · Arequipa
            </motion.p>
          </div>

          {/* En móvil las dos líneas quedan arriba y abajo del arco; en escritorio, juntas sobre él. */}
          <h1 className="flex flex-1 flex-col justify-between py-3 font-display leading-[0.82] tracking-[-0.045em] md:flex-none md:py-0">
            <motion.span style={reduced ? undefined : { x: leftX }} className="block text-[clamp(3.4rem,17vw,17rem)] md:text-[clamp(4.2rem,15vw,17rem)]">
              <RevealChars text="All types" delay={0.5} />
            </motion.span>
            <motion.span style={reduced ? undefined : { x: rightX }} className="block text-right text-[clamp(3.4rem,17vw,17rem)] md:text-[clamp(4.2rem,15vw,17rem)]">
              <RevealChars text="of " delay={0.75} />
              <RevealChars text="beauty" className="italic" delay={0.85} />
              <span className="align-top text-[0.4em]">*</span>
            </motion.span>
          </h1>

          <div className="hidden items-end justify-between gap-6 text-[11px] font-semibold tracking-[0.32em] uppercase md:flex">
            <ol className="hidden gap-6 md:flex" aria-label="Especialidades">
              {SLIDES.map((s, i) => (
                <li key={s.label} className={cn("transition-opacity duration-700", i === index ? "opacity-100" : "opacity-40")}>
                  <span className="mr-2 tabular-nums">0{i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
            <AnimatePresence mode="wait">
              <motion.p key={slide.es} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.6, ease: SILK }} className="normal-case tracking-[0.12em]">
                {slide.es}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Acciones (fuera del modo diferencia para mantener el contraste) */}
        <motion.div style={reduced ? undefined : { opacity: fade }} className="absolute top-[24svh] right-4 z-20 flex flex-col items-end gap-4 md:right-10">
          <motion.div initial={reduced ? false : { scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 1.4, ease: SILK, delay: 1.2 }} className="hidden md:block">
            <Badge />
          </motion.div>
        </motion.div>
        <motion.div style={reduced ? undefined : { opacity: fade }} className="absolute inset-x-4 bottom-5 z-20 md:inset-x-auto md:bottom-24 md:left-10 md:max-w-xs">
          <motion.div initial={reduced ? false : { y: 24 }} animate={{ y: 0 }} transition={{ duration: 1.1, ease: SILK, delay: 0.6 }}>
            <p className="mb-5 hidden text-sm leading-relaxed text-ink-soft md:block">Una nueva filosofía desarrollada por @domenikpm. Diseño a medida para que te veas como tú, en tu mejor versión.</p>
            <Magnetic className="block md:inline-block">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-cursor="Chat" className="group flex h-14 w-full items-center gap-3 rounded-full bg-ink pr-6 pl-2 text-sm font-semibold text-paper shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] md:inline-flex md:w-auto">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink transition-transform duration-700 group-hover:rotate-[360deg]">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                Agenda tu cita
              </a>
            </Magnetic>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
