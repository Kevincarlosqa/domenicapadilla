"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bot, Hand, List, MapPin, RotateCcw, Send, UserRound } from "lucide-react";
import { closeConversation, markConversationRead, staffReply, takeOver } from "@/app/dashboard/actions";
import { Badge, Button, EmptyState, inputClass } from "./ui";
import { cn } from "@/lib/utils";

type Author = "CUSTOMER" | "BOT" | "STAFF" | "SYSTEM";
interface Msg {
  id: string;
  author: Author;
  body: string;
  type: string;
  payload: unknown;
  at: string;
  status?: string | null;
}
type Interactive =
  | { type: "buttons"; body: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; body: string; button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };

const time = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export function MessageBubble({ m, onPick }: { m: Msg; onPick?: (id: string, title: string) => void }) {
  const [listOpen, setListOpen] = useState(false);
  if (m.author === "SYSTEM") {
    return <p className="mx-auto my-1 max-w-[85%] rounded-full bg-sand px-3 py-1 text-center text-[11px] text-muted">{m.body.split("\n")[0]}</p>;
  }
  const mine = m.author !== "CUSTOMER";
  const inter = (m.type === "buttons" || m.type === "list") && m.payload ? (m.payload as Interactive) : null;
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-[0_1px_0_rgba(0,0,0,0.04)]",
          mine ? (m.author === "STAFF" ? "rounded-br-md bg-[#e9e9e6]" : "rounded-br-md bg-[#f0f0ee]") : "rounded-bl-md bg-paper",
        )}
      >
        {mine ? (
          <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
            {m.author === "BOT" ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
            {m.author === "BOT" ? "Domi (IA)" : "Asesora"}
          </span>
        ) : null}
        {inter ? inter.body : m.body}
        <span className="mt-1 block text-right text-[10px] text-muted tabular-nums">
          {time(m.at)}
          {m.status === "failed" ? " · no enviado" : m.status === "read" ? " · ✓✓" : ""}
        </span>
      </div>
      {inter?.type === "buttons" ? (
        <div className="mt-1 flex max-w-[85%] flex-wrap justify-end gap-1">
          {inter.buttons.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(b.id, b.title)}
              className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-[#0a0a0a] enabled:hover:bg-sand disabled:cursor-default"
            >
              {b.title}
            </button>
          ))}
        </div>
      ) : null}
      {inter?.type === "list" ? (
        <div className="mt-1 w-full max-w-[85%] overflow-hidden rounded-2xl border border-line bg-paper text-xs">
          <button type="button" onClick={() => setListOpen(!listOpen)} className="flex w-full items-center justify-center gap-1 py-2 font-medium text-[#0a0a0a]" aria-expanded={listOpen}>
            <List className="h-3.5 w-3.5" /> {inter.button}
          </button>
          {listOpen || !onPick ? (
            <ul className="divide-y divide-line/70 border-t border-line">
              {inter.sections.flatMap((s) =>
                s.rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" disabled={!onPick} onClick={() => onPick?.(r.id, r.title)} className="w-full px-3 py-2 text-left enabled:hover:bg-sand disabled:cursor-default">
                      <span className="block font-medium text-ink">{r.title}</span>
                      {r.description ? <span className="block text-muted">{r.description}</span> : null}
                    </button>
                  </li>
                )),
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [dep]);
  return ref;
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

interface ConvSummary {
  id: string;
  phone: string;
  name: string | null;
  branch: string | null;
  status: "BOT" | "HUMAN" | "CLOSED";
  unread: number;
  lastAt: string;
  preview: string;
}
interface Thread {
  id: string;
  phone: string;
  name: string | null;
  customerId: string | null;
  branch: string | null;
  status: "BOT" | "HUMAN" | "CLOSED";
  aiPaused: boolean;
  assignedTo: string | null;
  canReply: boolean;
  messages: Msg[];
}

async function fetchInbox(filter: string, selected: string | null) {
  const res = await fetch(`/api/dashboard/conversations?f=${filter}${selected ? `&id=${selected}` : ""}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as { conversations: ConvSummary[]; thread: Thread | null };
}

export function Inbox() {
  const [filter, setFilter] = useState<"all" | "unread" | "human">("all");
  const [list, setList] = useState<ConvSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => {
    return fetchInbox(filter, selected).then((data) => {
      if (!data) return;
      setList(data.conversations);
      setThread(data.thread);
    });
  }, [filter, selected]);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetchInbox(filter, selected).then((data) => {
        if (!alive || !data) return;
        setList(data.conversations);
        setThread(data.thread);
      });
    poll();
    const t = setInterval(() => document.visibilityState === "visible" && poll(), 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [filter, selected]);

  const scrollRef = useAutoScroll(thread?.messages.length);

  function open(id: string) {
    setSelected(id);
    setError(null);
    void markConversationRead(id);
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Error"));
      await load();
    });
  }

  return (
    <div className="grid h-[calc(100dvh-11rem)] min-h-[520px] overflow-hidden rounded-2xl border border-line bg-paper md:grid-cols-[320px_1fr]">
      <aside className={cn("flex min-h-0 flex-col border-r border-line", selected && "hidden md:flex")}>
        <div className="flex gap-1 border-b border-line p-2">
          {(["all", "unread", "human"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === f ? "bg-ink text-paper" : "hover:bg-sand")}>
              {f === "all" ? "Todas" : f === "unread" ? "No leídas" : "Con asesora"}
            </button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
          {list === null ? <li className="p-4 text-sm text-muted">Cargando…</li> : null}
          {list?.length === 0 ? <li className="p-6 text-center text-sm text-muted">Sin conversaciones</li> : null}
          {list?.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.id)} className={cn("flex w-full gap-3 border-b border-line/60 px-3 py-3 text-left hover:bg-ivory", selected === c.id && "bg-ivory")}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.name ?? c.phone}</span>
                    <span className="shrink-0 text-[10px] text-muted">{time(c.lastAt)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">{c.preview}</p>
                  <div className="mt-1 flex gap-1">
                    {c.branch ? <Badge>{c.branch}</Badge> : null}
                    {c.status === "HUMAN" ? <Badge className="bg-[#e9e9e6] text-[#24603f]">Asesora</Badge> : null}
                    {c.status === "CLOSED" ? <Badge>Cerrada</Badge> : null}
                  </div>
                </div>
                {c.unread ? <span className="mt-1 h-5 min-w-5 rounded-full bg-rose px-1.5 text-center text-[11px] font-semibold text-white">{c.unread}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn("flex min-h-0 flex-col", !selected && "hidden md:flex")}>
        {!thread ? (
          <div className="m-auto p-6">
            <EmptyState title="Elige una conversación">Los mensajes se actualizan cada pocos segundos.</EmptyState>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <button onClick={() => setSelected(null)} className="text-sm text-muted md:hidden">
                ←
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{thread.name ?? thread.phone}</p>
                <p className="text-xs text-muted">
                  {thread.phone}
                  {thread.branch ? ` · ${thread.branch}` : ""}
                  {thread.aiPaused ? ` · IA pausada${thread.assignedTo ? ` (${thread.assignedTo})` : ""}` : " · IA activa"}
                </p>
              </div>
              {thread.customerId ? (
                <Link href={`/dashboard/clientes/${thread.customerId}`} className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-sand">
                  Ficha
                </Link>
              ) : null}
              <Button size="sm" variant={thread.aiPaused ? "secondary" : "rose"} disabled={pending} onClick={() => act(() => takeOver(thread.id, !thread.aiPaused))}>
                {thread.aiPaused ? (
                  <>
                    <Bot className="h-3.5 w-3.5" /> Devolver a la IA
                  </>
                ) : (
                  <>
                    <Hand className="h-3.5 w-3.5" /> Tomar control
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => closeConversation(thread.id))}>
                Cerrar
              </Button>
            </header>
            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#f3f3f1] p-4" data-lenis-prevent>
              {thread.messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
            </div>
            <form
              className="flex gap-2 border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                const body = text;
                setText("");
                act(() => staffReply(thread.id, body));
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!thread.canReply}
                placeholder={thread.canReply ? "Escribe como asesora (pausa la IA)…" : "Fuera de la ventana de 24 h: solo plantillas"}
                aria-label="Mensaje"
                className={inputClass}
              />
              <Button type="submit" disabled={pending || !thread.canReply} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            {error ? <p className="px-4 pb-3 text-xs text-danger">{error}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}

// ─── Simulador ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Clienta recurrente (Lucía)", phone: "+51999111222" },
  { label: "Clienta nueva", phone: "+51955000111" },
];

export function Simulator() {
  const [phone, setPhone] = useState(PRESETS[0]!.phone);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useAutoScroll(messages.length + (busy ? 1 : 0));

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/dashboard/simulator?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages);
        setAiEnabled(data.aiEnabled);
        setAiPaused(data.aiPaused);
      }
    })();
  }, [phone]);

  async function send(payload: { text?: string; replyId?: string; location?: { lat: number; lng: number } }, optimistic: string) {
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, author: "CUSTOMER", body: optimistic, type: "text", payload: null, at: new Date().toISOString() }]);
    const res = await fetch("/api/dashboard/simulator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, ...payload }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Error");
    setMessages(data.messages);
    setAiPaused(data.aiPaused);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[2.2rem] border-[10px] border-ink bg-[#f3f3f1] shadow-2xl">
          <div className="flex items-center gap-3 bg-[#0a0a0a] px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ivory text-ink">✳︎</span>
            <div>
              <p className="text-sm font-semibold">Doménica Padilla</p>
              <p className="text-[11px] opacity-80">{busy ? "escribiendo…" : aiPaused ? "atiende una asesora" : "en línea"}</p>
            </div>
          </div>
          <div ref={scrollRef} className="flex h-[560px] flex-col gap-2 overflow-y-auto p-3" data-lenis-prevent>
            {messages.length === 0 ? <p className="m-auto max-w-56 text-center text-xs text-muted">Escribe “Hola” para empezar, o comparte una ubicación.</p> : null}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} onPick={busy ? undefined : (id, title) => send({ text: title, replyId: id }, title)} />
            ))}
            {busy ? <div className="h-8 w-14 animate-pulse rounded-2xl bg-paper" /> : null}
          </div>
          <form
            className="flex items-center gap-2 bg-[#f0f0f0] p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              const t = text;
              setText("");
              void send({ text: t }, t);
            }}
          >
            <button
              type="button"
              title="Compartir ubicación (Miraflores)"
              aria-label="Compartir ubicación"
              disabled={busy}
              onClick={() => send({ location: { lat: -12.1211, lng: -77.0297 } }, "📍 Ubicación compartida")}
              className="rounded-full p-2 text-muted hover:bg-white"
            >
              <MapPin className="h-5 w-5" />
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje" aria-label="Mensaje" className="h-10 flex-1 rounded-full bg-white px-4 text-sm focus:outline-none" />
            <button type="submit" disabled={busy} className="rounded-full bg-[#0a0a0a] p-2.5 text-white" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
        {error ? <p className="mt-3 text-center text-sm text-danger">{error}</p> : null}
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-paper p-4 text-sm">
          <p className="mb-2 font-semibold">Motor</p>
          {aiEnabled === null ? null : aiEnabled ? (
            <p className="text-muted">Claude con herramientas reales (disponibilidad, reservas, lista de espera). Las reservas que haga aquí se guardan de verdad.</p>
          ) : (
            <p className="text-muted">
              Sin <code>ANTHROPIC_API_KEY</code>: se usa el flujo guiado por botones. Configura la clave para probar el asistente con IA.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4">
          <label htmlFor="sim-phone" className="mb-2 block text-sm font-semibold">
            Teléfono de prueba
          </label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.phone} onClick={() => setPhone(p.phone)} className={cn("rounded-full border px-3 py-1 text-xs", phone === p.phone ? "border-ink bg-ink text-paper" : "border-line hover:bg-sand")}>
                {p.label}
              </button>
            ))}
          </div>
          <input id="sim-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={async () => {
              await fetch(`/api/dashboard/simulator?phone=${encodeURIComponent(phone)}`, { method: "DELETE" });
              setMessages([]);
              setAiPaused(false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reiniciar conversación
          </Button>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-4 text-xs text-muted">
          <p className="mb-1 font-semibold text-ink">Prueba estos casos</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>“Quiero lo mismo de siempre”</li>
            <li>“¿Tienen lifting en Miraflores el sábado en la tarde?”</li>
            <li>“Microblading + laminado en San Isidro mañana”</li>
            <li>“Soy alérgica a la lidocaína”</li>
            <li>“Quiero cancelar mi cita”</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
