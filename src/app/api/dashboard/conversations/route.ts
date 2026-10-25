import { connection, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { assertUser } from "@/lib/auth";
import { customerPhone, insideWindow } from "@/lib/conversations";
import { db } from "@/lib/prisma";

/** Bandeja (polling): lista de conversaciones y mensajes de la seleccionada. */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const user = await assertUser(["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"]);
    const prisma = await db();
    const id = request.nextUrl.searchParams.get("id");
    const filter = request.nextUrl.searchParams.get("f") ?? "all";
    const scope = user.branchIds ? { OR: [{ branchId: { in: user.branchIds } }, { branchId: null }] } : {};
    const conversations = await prisma.conversation.findMany({
      where: {
        isSimulator: false,
        ...scope,
        ...(filter === "unread" ? { unreadCount: { gt: 0 } } : filter === "human" ? { status: "HUMAN" as const } : {}),
      },
      include: { customer: true, branch: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" },
      take: 80,
    });
    let thread = null;
    if (id) {
      const conv = await prisma.conversation.findFirst({ where: { id, ...scope }, include: { customer: true, branch: true, assignedUser: true } });
      if (conv) {
        const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: 200 });
        thread = {
          id: conv.id,
          phone: customerPhone(conv),
          name: conv.customer?.name ?? null,
          customerId: conv.customerId,
          branch: conv.branch?.name ?? null,
          status: conv.status,
          aiPaused: conv.aiPaused,
          assignedTo: conv.assignedUser?.name ?? null,
          canReply: insideWindow(conv),
          messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, type: m.type, payload: m.payload, at: m.createdAt.toISOString(), status: m.status })),
        };
      }
    }
    return Response.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        phone: c.phone,
        name: c.customer?.name ?? null,
        branch: c.branch?.name ?? null,
        status: c.status,
        unread: c.unreadCount,
        lastAt: c.lastMessageAt.toISOString(),
        preview: c.messages[0]?.body.slice(0, 90) ?? "",
      })),
      thread,
    });
  } catch (e) {
    return apiError(e);
  }
}
