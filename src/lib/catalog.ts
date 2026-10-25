import "server-only";
import type { Db, Tx } from "./prisma";
import type { EngineItem } from "./availability-engine";
import { distanceKm } from "./utils";

export { CATEGORY_LABELS } from "./labels";

export class CatalogError extends Error {}

export async function listActiveBranches(prisma: Db | Tx) {
  return prisma.branch.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

/** Catálogo de una sede con overrides aplicados (precio/duración de sede). */
export async function branchCatalog(prisma: Db | Tx, branchId: string) {
  const rows = await prisma.branchService.findMany({
    where: { branchId, active: true, service: { active: true } },
    include: { service: { include: { variants: { orderBy: { sortOrder: "asc" } } } } },
    orderBy: { service: { sortOrder: "asc" } },
  });
  return rows.map((r) => ({
    id: r.service.id,
    slug: r.service.slug,
    name: r.service.name,
    category: r.service.category,
    description: r.service.description,
    durationMin: r.durationMin ?? r.service.durationMin,
    priceCents: r.priceCents ?? r.service.priceCents,
    priceFrom: r.service.priceFrom || r.service.variants.length > 0,
    requiresEvaluation: r.service.requiresEvaluation,
    retouchAfterDays: r.service.retouchAfterDays,
    variants: r.service.variants.map((v) => ({ id: v.id, name: v.name, durationMin: v.durationMin, priceCents: v.priceCents })),
  }));
}

/**
 * Resuelve los servicios pedidos contra el catálogo de la sede.
 * Precedencia: variante > override de sede > servicio (la de especialista se aplica en el motor).
 */
export async function resolveItems(
  prisma: Db | Tx,
  branchId: string,
  requested: Array<{ serviceId: string; variantId?: string | null; stylistId?: string | null }>,
): Promise<EngineItem[]> {
  const ids = [...new Set(requested.map((r) => r.serviceId))];
  const rows = await prisma.branchService.findMany({
    where: { branchId, serviceId: { in: ids }, active: true, service: { active: true } },
    include: { service: { include: { variants: true } } },
  });
  const byService = new Map(rows.map((r) => [r.serviceId, r]));
  return requested.map((req) => {
    const row = byService.get(req.serviceId);
    if (!row) throw new CatalogError("Ese servicio no se ofrece en esta sede.");
    const s = row.service;
    const variant = req.variantId ? s.variants.find((v) => v.id === req.variantId) : undefined;
    if (req.variantId && !variant) throw new CatalogError("La variante elegida no existe.");
    return {
      serviceId: s.id,
      variantId: variant?.id ?? null,
      name: variant ? `${s.name} (${variant.name})` : s.name,
      durationMin: variant?.durationMin ?? row.durationMin ?? s.durationMin,
      priceCents: variant?.priceCents ?? row.priceCents ?? s.priceCents,
      bufferMin: s.bufferMin,
      processingOffsetMin: s.processingOffsetMin,
      processingMin: s.processingMin,
      stylistId: req.stylistId ?? null,
    };
  });
}

export async function nearestBranches(prisma: Db | Tx, point: { lat: number; lng: number }) {
  const branches = await listActiveBranches(prisma);
  return branches
    .map((b) => ({ ...b, distanceKm: Math.round(distanceKm(point, b) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Especialistas que trabajan en la sede (y opcionalmente saben hacer un servicio). */
export async function branchStylists(prisma: Db | Tx, branchId: string, serviceId?: string) {
  return prisma.stylist.findMany({
    where: {
      active: true,
      schedules: { some: { branchId } },
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    orderBy: [{ level: "desc" }, { name: "asc" }],
  });
}
