import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { branchCatalog, branchStylists } from "@/lib/catalog";
import { db } from "@/lib/prisma";

const query = z.object({ branch: z.string().min(1).max(40) });

/** Catálogo y especialistas de una sede (por slug o id). */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const { branch: key } = query.parse(Object.fromEntries(request.nextUrl.searchParams));
    const prisma = await db();
    const branch = await prisma.branch.findFirst({ where: { active: true, OR: [{ slug: key }, { id: key }] } });
    if (!branch) return Response.json({ error: "Sede no encontrada" }, { status: 404 });
    const [services, stylists] = await Promise.all([branchCatalog(prisma, branch.id), branchStylists(prisma, branch.id)]);
    const skills = await prisma.stylistService.findMany({ where: { stylistId: { in: stylists.map((s) => s.id) } }, select: { stylistId: true, serviceId: true } });
    return Response.json({
      branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
      services,
      stylists: stylists.map((s) => ({ id: s.id, name: s.name, title: s.title, level: s.level, serviceIds: skills.filter((k) => k.stylistId === s.id).map((k) => k.serviceId) })),
    });
  } catch (e) {
    return apiError(e);
  }
}
