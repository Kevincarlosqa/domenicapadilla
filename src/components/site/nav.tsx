"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Magnetic } from "./motion-kit";

const LINKS = [
  { href: "#servicios", label: "Servicios" },
  { href: "#filosofia", label: "Filosofía" },
  { href: "#equipo", label: "Equipo" },
  { href: "#sedes", label: "Sedes" },
];

export function Nav({ whatsappHref }: { whatsappHref: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 40);
    setHidden(y > 400 && y > prev && !open);
  });
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      <a href="#contenido" className="sr-only z-[90] rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Saltar al contenido
      </a>
      <motion.header
        animate={{ y: hidden && !reduced ? "-110%" : "0%" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-500", scrolled ? "bg-ivory/95 shadow-[0_1px_0_rgba(10,10,10,0.06)]" : "bg-transparent")}
      >
        <nav className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-4 md:px-10" aria-label="Principal">
          <Link href="/" aria-label="Doménica Padilla, inicio" className="text-[15px] md:text-base">
            <Wordmark />
          </Link>
          <ul className="hidden items-center gap-8 text-sm font-medium lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="group relative py-1">
                  {l.label}
                  <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-ink transition-transform duration-500 group-hover:origin-left group-hover:scale-x-100" />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Magnetic className="hidden sm:block">
              <a href="#reservar" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper transition-colors hover:bg-rose-deep">
                Reservar
              </a>
            </Magnetic>
            <button onClick={() => setOpen(!open)} className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-full border border-ink/20 lg:hidden" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open}>
              <span className={cn("h-px w-5 bg-ink transition-transform", open && "translate-y-[3.5px] rotate-45")} />
              <span className={cn("h-px w-5 bg-ink transition-transform", open && "-translate-y-[3.5px] -rotate-45")} />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-40 flex flex-col justify-between bg-ink px-6 pt-28 pb-10 text-ivory lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
          >
            <ul className="space-y-2">
              {[...LINKS, { href: "#reservar", label: "Reservar" }].map((l, i) => (
                <motion.li key={l.href} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.06, duration: 0.6 }}>
                  <a href={l.href} onClick={() => setOpen(false)} className="font-display text-6xl">
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-14 items-center justify-center rounded-full bg-ivory text-sm font-semibold text-ink">
              Escríbenos por WhatsApp
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
