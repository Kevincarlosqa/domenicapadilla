"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useLenis } from "lenis/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Clock, X } from "lucide-react";
import type { ServiceCategory } from "@/generated/prisma/enums";
import type { LandingData } from "@/lib/landing";
import { CATEGORY_LABELS } from "@/lib/labels";
import { cn, formatDuration, formatMoney } from "@/lib/utils";
import { CATEGORY_PHOTOS, SERVICE_PHOTOS } from "@/content/images";
import { WhatsAppIcon, waLink } from "./icons";
import { Photo } from "./photo";
import { RevealLines } from "./motion-kit";

const ORDER: ServiceCategory[] = ["BROWS", "LASHES", "LIPS", "SKIN", "NAILS", "HAIR", "MAKEUP"];
const EN: Record<ServiceCategory, string> = { BROWS: "Brows", LASHES: "Lashes", LIPS: "Lips", SKIN: "Skin", NAILS: "Nails", HAIR: "Hair", MAKEUP: "Makeup" };
const CURTAIN = [0.76, 0, 0.24, 1] as const;
const SILK = [0.22, 1, 0.36, 1] as const;

type Service = LandingData["services"][number];
type Branch = LandingData["branches"][number];

const photoOf = (s: Pick<Service, "slug" | "category">) => SERVICE_PHOTOS[s.slug] ?? CATEGORY_PHOTOS[s.category];

/** Lleva el servicio (y la sede) al formulario de reserva y baja hasta él. */
function bookOnline(serviceId: string, branchId?: string) {
  window.dispatchEvent(new CustomEvent("dp:book", { detail: { serviceId, branchId } }));
  document.getElementById("reservar")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Services({ services, branches, whatsappNumber }: Pick<LandingData, "services" | "branches"> & { whatsappNumber: string }) {
  const categories = ORDER.filter((c) => services.some((s) => s.category === c));
  const [category, setCategory] = useState<ServiceCategory>(categories[0] ?? "BROWS");
  const [branchId, setBranchId] = useState<string>("all");
  const [hovered, setHovered] = useState<string | null>(null);
  // La imagen grande cambia solo cuando el cursor se detiene sobre un servicio: cruzar la lista
  // de pasada no dispara una cortina (y una descarga) por cada fila.
  const [bannerId, setBannerId] = useState<string | null>(null);
  const bannerTimer = useRef(0);
  const hover = useCallback((id: string | null) => {
    setHovered(id);
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBannerId(id), id ? 150 : 400);
  }, []);
  useEffect(() => {
    const timer = bannerTimer;
    return () => window.clearTimeout(timer.current);
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const reduced = useReducedMotion();

  // Vista previa que sigue al cursor
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 180, damping: 22 });
  const y = useSpring(my, { stiffness: 180, damping: 22 });

  const list = useMemo(
    () => services.filter((s) => s.category === category && (branchId === "all" || s.prices[branchId] !== undefined)),
    [services, category, branchId],
  );
  const priceOf = (s: Service) => (branchId !== "all" ? s.prices[branchId]! : Math.min(...Object.values(s.prices)));
  // La imagen grande muestra el servicio resaltado; si no hay ninguno, el primero de la categoría.
  const featured = list.find((s) => s.id === bannerId) ?? list[0];
  const hoveredService = services.find((s) => s.id === hovered);
  const open = services.find((s) => s.id === openId) ?? null;

  return (
    <section id="servicios" className="relative mx-auto max-w-[1440px] px-4 py-24 md:px-10 md:py-36" aria-labelledby="servicios-title">
      <div className="mb-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(01) Servicios</p>
          <RevealLines
            lines={[
              "Cada rostro tiene",
              <>
                su propia <em className="text-rose">arquitectura</em>
              </>,
            ]}
            className="font-display text-[clamp(2.6rem,6.5vw,6.5rem)] leading-[0.95] tracking-tight"
          />
          <h2 id="servicios-title" className="sr-only">
            Servicios y precios
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="svc-branch" className="text-xs font-medium text-muted">
            Precios en
          </label>
          <select id="svc-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-11 rounded-full border border-ink/20 bg-paper px-4 text-sm font-medium focus:border-ink focus:outline-none">
            <option value="all">Todas las sedes (desde)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.district}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div role="tablist" aria-label="Categorías" className="scrollbar-none -mx-4 mb-10 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            aria-controls="svc-panel"
            onClick={() => {
              setCategory(c);
              hover(null);
            }}
            className={cn(
              "relative shrink-0 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors",
              category === c ? "border-ink text-paper" : "border-ink/15 hover:border-ink/50",
            )}
          >
            {category === c ? <motion.span layoutId="svc-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} /> : null}
            <span className="relative">
              {EN[c]} <span className="opacity-60">· {CATEGORY_LABELS[c]}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Imagen grande: cambia con cortina según el servicio resaltado */}
      <div className="relative mb-10 aspect-[16/10] overflow-hidden rounded-[1.5rem] bg-ink md:aspect-[21/8]">
        <AnimatePresence initial={false}>
          {featured ? (
            <motion.div
              key={featured.id}
              className="absolute inset-0"
              initial={reduced ? false : { clipPath: "inset(0 0 0 100%)" }}
              animate={{ clipPath: "inset(0 0 0 0%)" }}
              exit={{ opacity: 1, transition: { duration: 0.9 } }}
              transition={{ duration: 0.9, ease: CURTAIN }}
            >
              <motion.div className="absolute inset-0 will-change-transform" initial={reduced ? false : { scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 1.4, ease: SILK }}>
                <Photo photo={photoOf(featured)} sizes="(max-width: 1440px) 100vw, 1440px" className="h-full w-full" />
              </motion.div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-x-6 bottom-5 flex items-end justify-between gap-4 text-white md:inset-x-10 md:bottom-8">
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.3em] uppercase opacity-80">{EN[category]}</p>
                  <motion.p initial={reduced ? false : { y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: SILK, delay: 0.15 }} className="font-display text-4xl leading-none md:text-7xl">
                    <em>{featured.name}</em>
                  </motion.p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId(featured.id)}
                  className="hidden shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition-transform hover:scale-105 sm:inline-flex"
                >
                  Ver detalle <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        id="svc-panel"
        role="tabpanel"
        className="relative"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          mx.set(e.clientX - r.left);
          my.set(e.clientY - r.top);
        }}
        onPointerLeave={() => hover(null)}
      >
        {/* La lista se monta de nuevo al cambiar de categoría o sede (key): entra con un fundido escalonado
            y, al pasar el mouse, solo cambia la fila resaltada (sin medir ni animar el layout de todas). */}
        <ul key={`${category}-${branchId}`} className="border-t border-ink/15">
          {list.map((s, i) => (
            <ServiceRow
              key={s.id}
              service={s}
              index={i}
              active={hovered === s.id}
              price={priceOf(s)}
              showFrom={branchId === "all" || s.priceFrom}
              animate={!reduced}
              onHover={hover}
              onOpen={setOpenId}
            />
          ))}
        </ul>
        {list.length === 0 ? <p className="py-10 text-center text-muted">Esta categoría no se ofrece en la sede elegida.</p> : null}

        {/* Vista previa flotante del servicio (solo puntero fino) */}
        {!reduced ? (
          <motion.div className="pointer-events-none absolute top-0 left-0 z-10 hidden md:block" style={{ x, y }} aria-hidden>
            <AnimatePresence>
              {hoveredService ? (
                <motion.div
                  key={hoveredService.id}
                  initial={{ opacity: 0, scale: 0.7, rotate: -6, clipPath: "inset(100% 0 0 0)" }}
                  animate={{ opacity: 1, scale: 1, rotate: 0, clipPath: "inset(0% 0 0 0)" }}
                  exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.55, ease: SILK }}
                  className="absolute -translate-x-1/2 -translate-y-[110%] overflow-hidden rounded-t-full shadow-lg will-change-transform"
                >
                  <Photo photo={photoOf(hoveredService)} sizes="220px" className="h-64 w-48" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </div>
      <p className="mt-6 text-xs text-muted">Precios en soles. Los servicios con “desde” varían según largo, técnica o evaluación previa. Se confirma el precio final al reservar.</p>

      <AnimatePresence>
        {open ? <ServiceDetail key={open.id} service={open} branches={branches} branchId={branchId} whatsappNumber={whatsappNumber} onClose={() => setOpenId(null)} /> : null}
      </AnimatePresence>
    </section>
  );
}

const ServiceRow = memo(function ServiceRow({
  service: s,
  index: i,
  active,
  price,
  showFrom,
  animate,
  onHover,
  onOpen,
}: {
  service: Service;
  index: number;
  active: boolean;
  price: number;
  showFrom: boolean;
  animate: boolean;
  onHover: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <motion.li
      initial={animate ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.04, ease: SILK }}
      className="border-b border-ink/15"
    >
      <button
        type="button"
        onPointerEnter={() => onHover(s.id)}
        onFocus={() => onHover(s.id)}
        onClick={() => onOpen(s.id)}
        aria-haspopup="dialog"
        data-cursor="Ver"
        className={cn(
          "group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 py-6 text-left transition-colors duration-300 md:grid-cols-[3rem_1.2fr_1.5fr_auto_auto] md:py-8",
          active && "md:bg-sand/50",
        )}
      >
        <span className="hidden text-xs text-muted tabular-nums md:block">{String(i + 1).padStart(2, "0")}</span>
        <span className="font-display text-3xl transition-transform duration-500 will-change-transform group-hover:translate-x-3 md:text-5xl">
          {s.name}
          {s.featured ? <sup className="ml-1 text-sm">✳︎</sup> : null}
        </span>
        <span className="col-span-2 block max-w-md text-sm text-muted md:col-span-1">
          {s.description}
          {s.retouchAfterDays ? <span className="block text-xs text-ink-soft">Incluye retoque a los {s.retouchAfterDays} días.</span> : null}
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ink underline-offset-4 group-hover:underline md:hidden">
            Ver detalle <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </span>
        <span className="hidden text-sm text-muted md:block">{formatDuration(s.durationMin)}</span>
        <span className="row-start-1 text-right font-display text-2xl whitespace-nowrap md:col-start-5 md:text-3xl">
          {showFrom ? <span className="mr-1 align-middle font-sans text-[11px] tracking-wider text-muted uppercase">desde</span> : null}
          {formatMoney(price)}
        </span>
      </button>
    </motion.li>
  );
});

function ServiceDetail({
  service,
  branches,
  branchId,
  whatsappNumber,
  onClose,
}: {
  service: Service;
  branches: Branch[];
  branchId: string;
  whatsappNumber: string;
  onClose: () => void;
}) {
  const lenis = useLenis();
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const offered = branches.filter((b) => service.prices[b.id] !== undefined);
  const selected = offered.find((b) => b.id === branchId);

  // Bloquea el scroll del fondo, enfoca el cierre y cierra con Escape.
  useEffect(() => {
    lenis?.stop();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lenis, onClose]);

  const message = `Hola, me interesa ${service.name}${selected ? ` en la sede ${selected.name}` : ""}. ¿Me ayudan con precios y disponibilidad? 💞`;
  const waHref = waLink(selected?.phone ?? whatsappNumber, message);

  return (
    <motion.div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-8" role="dialog" aria-modal="true" aria-labelledby="svc-detail-title">
      <motion.button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      />
      <motion.div
        className="relative grid max-h-[92dvh] w-full max-w-5xl overflow-hidden rounded-t-4xl bg-paper will-change-transform md:grid-cols-[0.9fr_1.1fr] md:rounded-4xl"
        initial={reduced ? { opacity: 0 } : { y: "100%", opacity: 1 }}
        animate={{ y: "0%", opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: "100%" }}
        transition={{ duration: 0.7, ease: CURTAIN }}
      >
        <div className="relative h-56 overflow-hidden bg-ink md:h-auto md:min-h-[560px]">
          <motion.div className="absolute inset-0 will-change-transform" initial={reduced ? false : { scale: 1.2 }} animate={{ scale: 1 }} transition={{ duration: 1.4, ease: SILK }}>
            <Photo photo={photoOf(service)} sizes="(max-width: 768px) 100vw, 45vw" className="h-full w-full" />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent md:hidden" />
          <p className="absolute bottom-4 left-5 text-[11px] font-semibold tracking-[0.3em] text-white uppercase">
            {EN[service.category]} · {CATEGORY_LABELS[service.category]}
          </p>
        </div>

        {/* Panel de texto: en escritorio cabe sin scroll; si hace falta (móvil o pantallas bajas) usa la barra fina. */}
        <div className="flex max-h-[calc(92dvh-14rem)] flex-col overflow-y-auto p-6 md:max-h-[92dvh] md:p-9" data-lenis-prevent>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-paper text-ink shadow-md hover:bg-sand">
            <X className="h-5 w-5" />
          </button>

          <motion.h3
            id="svc-detail-title"
            initial={reduced ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: SILK, delay: 0.25 }}
            className="pr-12 font-display text-5xl leading-[0.95] md:text-6xl"
          >
            {service.name}
          </motion.h3>
          <motion.div initial={reduced ? false : { y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: SILK, delay: 0.35 }}>
            <p className="mt-4 text-ink-soft">{service.description}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5">
                <Clock className="h-3.5 w-3.5" /> {formatDuration(service.durationMin)}
              </span>
              {service.retouchAfterDays ? <span className="rounded-full border border-ink/15 px-3 py-1.5">Retoque incluido a los {service.retouchAfterDays} días</span> : null}
              {service.requiresEvaluation ? <span className="rounded-full bg-ink px-3 py-1.5 text-paper">Requiere evaluación previa</span> : null}
            </div>

            <div className="mt-7">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.3em] text-muted uppercase">Precio por sede</p>
              <ul className="grid border-t border-ink/10 lg:grid-cols-2 lg:gap-x-8">
                {offered.map((b) => (
                  <li key={b.id} className={cn("flex items-baseline justify-between gap-4 border-b border-ink/10 py-2.5 text-sm", b.id === branchId && "font-semibold")}>
                    <span className="truncate">
                      {b.name} <span className="text-xs font-normal text-muted">· {b.district}</span>
                    </span>
                    <span className="font-display text-xl whitespace-nowrap">
                      {service.priceFrom ? <span className="mr-1 align-middle font-sans text-[10px] tracking-wider text-muted uppercase">desde</span> : null}
                      {formatMoney(service.prices[b.id]!)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  bookOnline(service.id, selected?.id ?? offered[0]?.id);
                }}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-paper hover:bg-ink-soft"
              >
                Reservar online
              </button>
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-ink/20 px-6 text-sm font-semibold hover:border-ink">
                <WhatsAppIcon className="h-4 w-4" /> Consultar por WhatsApp
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
