import { connection } from "next/server";
import { listActiveBranches } from "@/lib/catalog";
import { db } from "@/lib/prisma";

export async function GET() {
  await connection();
  const branches = await listActiveBranches(await db());
  return Response.json(
    branches.map((b) => ({ id: b.id, slug: b.slug, name: b.name, district: b.district, city: b.city, address: b.address, reference: b.reference, lat: b.lat, lng: b.lng, phone: b.phone })),
  );
}
