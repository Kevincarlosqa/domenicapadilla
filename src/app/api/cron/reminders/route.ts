import type { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/prisma";
import { sendDueReminders } from "@/lib/reminders";

export const maxDuration = 60;

/** Vercel Cron llama con `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: NextRequest) {
  if (!config.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${config.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDueReminders(await db());
  return Response.json(result);
}
