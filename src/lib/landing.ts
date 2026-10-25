import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./prisma";
import { minToHHMM } from "./time";

/**
 * Datos públicos de la landing. Se cachean y se invalidan con updateTag("catalog")
 * cuando cambian sedes, servicios o especialistas desde el panel.
 */
export async function getLandingData() {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const prisma = await db();
  const [branches, services, stylists] = await Promise.all([
    prisma.branch.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { hours: true } }),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { branches: { where: { active: true, branch: { active: true } } }, variants: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.stylist.findMany({
      where: { active: true },
      orderBy: [{ level: "desc" }, { name: "asc" }],
      include: { schedules: { select: { branchId: true } } },
    }),
  ]);

  const summarizeHours = (hours: Array<{ weekday: number; startMin: number; endMin: number }>) => {
    const fmt = (wd: number) => {
      const list = hours.filter((h) => h.weekday === wd).sort((a, b) => a.startMin - b.startMin);
      return list.length ? `${minToHHMM(list[0]!.startMin)}–${minToHHMM(list.at(-1)!.endMin)}` : "Cerrado";
    };
    const weekdays = fmt(1);
    const out = [{ label: "Lun–Vie", value: weekdays }, { label: "Sáb", value: fmt(6) }, { label: "Dom", value: fmt(0) }];
    return out;
  };

  return {
    year: new Date().getFullYear(),
    branches: branches.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      district: b.district,
      city: b.city,
      address: b.address,
      reference: b.reference,
      lat: b.lat,
      lng: b.lng,
      phone: b.phone,
      hours: summarizeHours(b.hours),
    })),
    services: services
      .filter((s) => s.branches.length > 0)
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        category: s.category,
        description: s.description,
        durationMin: s.durationMin,
        featured: s.featured,
        retouchAfterDays: s.retouchAfterDays,
        requiresEvaluation: s.requiresEvaluation,
        priceFrom: s.priceFrom || s.variants.length > 0,
        basePriceCents: Math.min(s.priceCents, ...s.variants.map((v) => v.priceCents)),
        /** Precio por sede (override aplicado); ausente = no se ofrece ahí. */
        prices: Object.fromEntries(s.branches.map((bs) => [bs.branchId, bs.priceCents ?? s.priceCents])),
      })),
    stylists: stylists
      .filter((s) => s.schedules.length > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        level: s.level,
        bio: s.bio,
        photoUrl: s.photoUrl,
        branches: [...new Set(s.schedules.map((x) => branches.find((b) => b.id === x.branchId)?.name).filter(Boolean))] as string[],
      })),
  };
}

export type LandingData = Awaited<ReturnType<typeof getLandingData>>;
