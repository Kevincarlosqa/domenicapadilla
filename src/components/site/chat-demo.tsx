"use client";

import { motion, useInView, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Line = { from: "me" | "bot"; text: string; buttons?: string[] };

const SCRIPT: Line[] = [
  { from: "me", text: "Hola! Quiero hacerme las cejas 💞" },
  { from: "bot", text: "¡Hola, Lucía! ✨ Soy Domi. ¿Lo mismo de siempre con Carla en Dasso?", buttons: ["Sí, con Carla", "Otra sede"] },
  { from: "me", text: "Sí, con Carla" },
  { from: "bot", text: "Carla tiene libre el jueves:", buttons: ["10:00", "10:30", "11:15"] },
  { from: "me", text: "10:30" },
  { from: "bot", text: "Resumen: Microblading (retoque) · Carla · Dasso · jueves 10:30 · S/ 890. ¿Confirmo?", buttons: ["Confirmar", "Cambiar"] },
  { from: "me", text: "Confirmar" },
  { from: "bot", text: "¡Listo! Código DP-7KQ4M. Te recordaré un día antes ✨" },
];

const FEATURES = [
  { t: "Te reconoce", d: "Sabe tu sede, tu especialista y tu último servicio." },
  { t: "Horarios reales", d: "Consulta la agenda en vivo de las 7 sedes; nunca inventa precios." },
  { t: "Con botones", d: "Eliges sede, servicio y hora con un toque, sin escribir de más." },
  { t: "Humano cuando hace falta", d: "Alergias, dudas médicas o cambios especiales pasan a una asesora." },
];

const noopSubscribe = () => () => {};
const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/**
 * Escritorio: la sección se fija y la conversación avanza con el scroll.
 * Móvil: el texto y el celular apilados no caben en una pantalla, así que no se fija;
 * la conversación se reproduce sola cuando el celular entra en pantalla.
 */
export function ChatDemo({ whatsappHref }: { whatsappHref: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const desktop = useSyncExternalStore(noopSubscribe, isDesktop, () => true);
  const phoneInView = useInView(phoneRef, { amount: 0.5 });
  const [count, setCount] = useState(1);
  const [run, setRun] = useState(0);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (!reduced && desktop) setCount(Math.max(1, Math.min(SCRIPT.length, Math.ceil(p * (SCRIPT.length + 0.6)))));
  });

  // Móvil: reproducción automática, un mensaje cada ~1,1 s.
  useEffect(() => {
    if (desktop || reduced || !phoneInView) return;
    const t = window.setInterval(() => setCount((c) => (c >= SCRIPT.length ? c : c + 1)), 1100);
    return () => window.clearInterval(t);
  }, [desktop, reduced, phoneInView, run]);

  const shown = reduced ? SCRIPT.length : count;
  const typing = shown < SCRIPT.length && SCRIPT[shown]?.from === "bot";

  return (
    <section ref={ref} aria-labelledby="chat-title" className={cn("relative", !reduced && "lg:h-[300vh]")}>
      <div className={cn("mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-4 py-20 md:px-10 md:py-24 lg:grid-cols-[1fr_auto] lg:items-center", !reduced && "lg:sticky lg:top-0 lg:min-h-screen")}>
        <div className="min-w-0">
          <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(07) Reserva por WhatsApp</p>
          <h2 id="chat-title" className="font-display text-[clamp(2.4rem,5.2vw,5.2rem)] leading-[0.95]">
            Tu cita en
            <br />
            <em className="text-rose">menos de un minuto.</em>
          </h2>
          <ul className="mt-10 grid max-w-xl gap-6 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <li key={f.t} className={cn("border-t pt-4 transition-colors duration-500", shown > i * 2 ? "border-ink" : "border-ink/15 text-muted")}>
                <p className="font-semibold">{f.t}</p>
                <p className="mt-1 text-sm text-muted">{f.d}</p>
              </li>
            ))}
          </ul>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="mt-10 inline-flex h-12 items-center rounded-full bg-ink px-6 text-sm font-semibold text-paper hover:bg-rose-deep">
            Probar ahora en WhatsApp
          </a>
        </div>

        <div ref={phoneRef} className="mx-auto flex w-full max-w-[320px] flex-col items-center sm:max-w-[340px]">
          <div className="w-full overflow-hidden rounded-[2.6rem] border-[10px] border-ink bg-[#f3f3f1] shadow-[0_40px_80px_-30px_rgba(10,10,10,0.45)]" aria-label="Ejemplo de conversación con el asistente" role="img">
            <div className="flex items-center gap-3 bg-[#0a0a0a] px-4 py-3 text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ivory text-sm text-ink">✳︎</span>
              <div>
                <p className="text-sm font-semibold">Doménica Padilla</p>
                <p className="text-[10px] opacity-80">{typing ? "escribiendo…" : "en línea"}</p>
              </div>
            </div>
            <div className="flex h-[440px] flex-col justify-end gap-2 overflow-hidden p-3 sm:h-[480px]" aria-hidden>
              {SCRIPT.slice(0, shown).map((m, i) => (
                <motion.div
                  key={`${run}-${i}`}
                  initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("flex shrink-0 flex-col", m.from === "me" ? "items-end" : "items-start")}
                >
                  <p className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug", m.from === "me" ? "rounded-br-md bg-[#e4e4e1]" : "rounded-bl-md bg-white")}>{m.text}</p>
                  {m.buttons ? (
                    <div className="mt-1 flex max-w-[85%] flex-wrap gap-1">
                      {m.buttons.map((b) => (
                        <span key={b} className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#0a0a0a]">
                          {b}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </div>
          </div>
          {!desktop && !reduced && shown >= SCRIPT.length ? (
            <button
              type="button"
              onClick={() => {
                setCount(1);
                setRun((r) => r + 1);
              }}
              className="mt-5 inline-flex items-center gap-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              <RotateCcw className="h-4 w-4" /> Ver la conversación de nuevo
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
