import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config";

/** Mensaje saliente independiente del canal (WhatsApp real o simulador). */
export type Outbound =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; body: string; button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };

export interface Inbound {
  waMessageId: string;
  from: string;
  name?: string;
  timestamp: number;
  type: "text" | "interactive" | "location" | "other";
  text: string;
  /** id de la opción elegida en una lista o botón. */
  replyId?: string;
  location?: { lat: number; lng: number; name?: string };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Valida X-Hub-Signature-256 con el App Secret de Meta. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!config.WHATSAPP_APP_SECRET) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", config.WHATSAPP_APP_SECRET).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const webhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(z.record(z.string(), z.unknown())).optional(),
            statuses: z.array(z.object({ id: z.string(), status: z.string() })).optional(),
          }),
        }),
      ),
    }),
  ),
});

const messageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string(), text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number(), name: z.string().optional(), address: z.string().optional() }).optional(),
});

export function parseWebhook(body: unknown): { messages: Inbound[]; statuses: Array<{ id: string; status: string }> } {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return { messages: [], statuses: [] };
  const messages: Inbound[] = [];
  const statuses: Array<{ id: string; status: string }> = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const names = new Map(change.value.contacts?.map((c) => [c.wa_id, c.profile?.name]) ?? []);
      statuses.push(...(change.value.statuses ?? []));
      for (const raw of change.value.messages ?? []) {
        const m = messageSchema.safeParse(raw);
        if (!m.success) continue;
        const msg = m.data;
        const base = { waMessageId: msg.id, from: `+${msg.from}`, name: names.get(msg.from) ?? undefined, timestamp: Number(msg.timestamp) * 1000 };
        if (msg.type === "text" && msg.text) messages.push({ ...base, type: "text", text: msg.text.body });
        else if (msg.type === "interactive" && msg.interactive) {
          const reply = msg.interactive.list_reply ?? msg.interactive.button_reply;
          if (reply) messages.push({ ...base, type: "interactive", text: reply.title, replyId: reply.id });
        } else if (msg.type === "button" && msg.button) {
          messages.push({ ...base, type: "interactive", text: msg.button.text, replyId: msg.button.payload });
        } else if (msg.type === "location" && msg.location) {
          messages.push({
            ...base,
            type: "location",
            text: `📍 Ubicación compartida${msg.location.name ? `: ${msg.location.name}` : ""}`,
            location: { lat: msg.location.latitude, lng: msg.location.longitude, name: msg.location.name },
          });
        } else {
          messages.push({ ...base, type: "other", text: `[${msg.type}]` });
        }
      }
    }
  }
  return { messages, statuses };
}

async function graph(payload: Record<string, unknown>): Promise<string | null> {
  if (!config.whatsappEnabled) return null;
  const res = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message: string } };
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${data.error?.message ?? "error"}`);
  return data.messages?.[0]?.id ?? null;
}

/** Convierte un Outbound al formato de la Cloud API respetando sus límites de longitud. */
export function toGraphPayload(to: string, msg: Outbound): Record<string, unknown> {
  const recipient = to.replace(/^\+/, "");
  if (msg.type === "text") return { to: recipient, type: "text", text: { body: clip(msg.body, 4096), preview_url: false } };
  if (msg.type === "buttons") {
    return {
      to: recipient,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clip(msg.body, 1024) },
        action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: clip(b.id, 256), title: clip(b.title, 20) } })) },
      },
    };
  }
  let remaining = 10;
  return {
    to: recipient,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(msg.body, 1024) },
      action: {
        button: clip(msg.button, 20),
        sections: msg.sections
          .map((s) => {
            const rows = s.rows.slice(0, remaining);
            remaining -= rows.length;
            return {
              title: clip(s.title, 24),
              rows: rows.map((r) => ({ id: clip(r.id, 200), title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })),
            };
          })
          .filter((s) => s.rows.length > 0),
      },
    },
  };
}

export async function sendWhatsApp(to: string, msg: Outbound) {
  return graph(toGraphPayload(to, msg));
}

/** Plantilla aprobada (necesaria fuera de la ventana de 24 h). */
export async function sendTemplate(to: string, name: string, bodyParams: string[], buttonPayloads: string[] = []) {
  return graph({
    to: to.replace(/^\+/, ""),
    type: "template",
    template: {
      name,
      language: { code: config.WHATSAPP_TEMPLATE_LANG },
      components: [
        { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
        ...buttonPayloads.map((payload, index) => ({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] })),
      ],
    },
  });
}

export async function markRead(waMessageId: string) {
  await graph({ status: "read", message_id: waMessageId }).catch(() => null);
}

/** Texto plano equivalente de un Outbound (para guardar en la bandeja y para el historial de la IA). */
export function outboundText(msg: Outbound) {
  if (msg.type === "text") return msg.body;
  if (msg.type === "buttons") return `${msg.body}\n${msg.buttons.map((b) => `[${b.title}]`).join(" ")}`;
  return `${msg.body}\n${msg.sections.flatMap((s) => s.rows.map((r) => `• ${r.title}${r.description ? ` — ${r.description}` : ""}`)).join("\n")}`;
}
