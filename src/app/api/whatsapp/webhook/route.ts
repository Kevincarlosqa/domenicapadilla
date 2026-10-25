import { after, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { recordInbound, respond } from "@/lib/conversations";
import { db } from "@/lib/prisma";
import { parseWebhook, verifySignature } from "@/lib/whatsapp";

export const maxDuration = 60;

/** Verificación del webhook (Meta envía hub.challenge). */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && config.WHATSAPP_VERIFY_TOKEN && p.get("hub.verify_token") === config.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { messages, statuses } = parseWebhook(body);
  const prisma = await db();

  // Guardar rápido y responder 200; la IA trabaja en segundo plano.
  const toProcess: Array<{ conversationId: string; inbound: (typeof messages)[number] }> = [];
  for (const inbound of messages) {
    const conversation = await recordInbound(prisma, inbound);
    if (conversation) toProcess.push({ conversationId: conversation.id, inbound });
  }
  for (const s of statuses) {
    await prisma.message.updateMany({ where: { waMessageId: s.id }, data: { status: s.status } });
  }
  after(async () => {
    for (const { conversationId, inbound } of toProcess) {
      await respond(prisma, conversationId, inbound).catch((e) => console.error("[webhook] respond", e));
    }
  });
  return Response.json({ ok: true });
}
