import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { assertUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { recordInbound, respond, simulatorKey } from "@/lib/conversations";
import { db } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

export const maxDuration = 60;

const ROLES = ["OWNER", "ADMIN", "BRANCH_MANAGER"] as const;
const phoneSchema = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: "custom", message: "Teléfono inválido" });
  return p ?? "";
});

async function thread(phone: string) {
  const prisma = await db();
  const conv = await prisma.conversation.findUnique({ where: { phone: simulatorKey(phone) } });
  if (!conv) return { messages: [], aiPaused: false };
  const messages = await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
  return {
    aiPaused: conv.aiPaused,
    messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, type: m.type, payload: m.payload, at: m.createdAt.toISOString() })),
  };
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    await assertUser([...ROLES]);
    const phone = phoneSchema.parse(request.nextUrl.searchParams.get("phone") ?? "");
    return Response.json({ ...(await thread(phone)), aiEnabled: config.aiEnabled });
  } catch (e) {
    return apiError(e);
  }
}

const postSchema = z.object({
  phone: phoneSchema,
  text: z.string().max(2000).default(""),
  replyId: z.string().max(256).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

/** Simula un mensaje entrante de WhatsApp y ejecuta el bot de forma síncrona. */
export async function POST(request: NextRequest) {
  try {
    await assertUser([...ROLES]);
    const body = postSchema.parse(await request.json());
    const prisma = await db();
    const inbound = {
      waMessageId: `sim-${crypto.randomUUID()}`,
      from: body.phone,
      timestamp: Date.now(),
      type: body.location ? ("location" as const) : body.replyId ? ("interactive" as const) : ("text" as const),
      text: body.location ? "📍 Ubicación compartida" : body.text,
      replyId: body.replyId,
      location: body.location,
    };
    const conv = await recordInbound(prisma, inbound, { simulator: true });
    if (conv) await respond(prisma, conv.id, inbound);
    return Response.json(await thread(body.phone));
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await assertUser([...ROLES]);
    const phone = phoneSchema.parse(request.nextUrl.searchParams.get("phone") ?? "");
    await (await db()).conversation.deleteMany({ where: { phone: simulatorKey(phone) } });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
