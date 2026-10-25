import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getAvailability } from "@/lib/availability";
import { db } from "@/lib/prisma";
import { formatLocal } from "@/lib/time";

const query = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  variantId: z.string().optional(),
  stylistId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  await connection();
  try {
    const q = query.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { days, timezone } = await getAvailability(await db(), {
      branchId: q.branchId,
      items: [{ serviceId: q.serviceId, variantId: q.variantId, stylistId: q.stylistId }],
      fromKey: q.date,
    });
    return Response.json({
      timezone,
      slots: (days[0]?.slots ?? []).map((s) => ({
        start: new Date(s.start).toISOString(),
        label: formatLocal(s.start, timezone, "HH:mm"),
        totalCents: s.totalCents,
        stylists: s.items.map((i) => ({ id: i.stylistId, name: i.stylistName })),
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
