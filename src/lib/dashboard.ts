import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/client";
import type { CurrentUser } from "./auth";
import { db } from "./prisma";

export const BRANCH_COOKIE = "dp_branch";

export async function getSelectedBranch(user: CurrentUser): Promise<string> {
  const value = (await cookies()).get(BRANCH_COOKIE)?.value ?? "all";
  if (value === "all") return user.branchIds?.length === 1 ? user.branchIds[0]! : "all";
  if (user.branchIds && !user.branchIds.includes(value)) return "all";
  return value;
}

export async function visibleBranches(user: CurrentUser) {
  const prisma = await db();
  return prisma.branch.findMany({
    where: user.branchIds ? { id: { in: user.branchIds } } : {},
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, district: true, timezone: true, active: true },
  });
}

export const NAV: Array<{ href: string; label: string; icon: string; roles: Role[] }> = [
  { href: "/dashboard", label: "Inicio", icon: "chart", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "STYLIST"] },
  { href: "/dashboard/agenda", label: "Agenda", icon: "calendar", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION", "STYLIST"] },
  { href: "/dashboard/reservas", label: "Reservas", icon: "list", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"] },
  { href: "/dashboard/clientes", label: "Clientas", icon: "users", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION", "STYLIST"] },
  { href: "/dashboard/conversaciones", label: "Conversaciones", icon: "chat", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"] },
  { href: "/dashboard/simulador", label: "Simulador del bot", icon: "bot", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER"] },
  { href: "/dashboard/configuracion", label: "Configuración", icon: "settings", roles: ["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION", "STYLIST"] },
];

export const canSee = (role: Role, href: string) => NAV.find((n) => n.href === href)?.roles.includes(role) ?? false;

/** Datos para el formulario de reserva del staff (solo sedes visibles). */
export async function formCatalog(user: CurrentUser) {
  const prisma = await db();
  const branchFilter = user.branchIds ? { in: user.branchIds } : undefined;
  const [branches, services, stylists] = await Promise.all([
    prisma.branch.findMany({ where: { active: true, ...(branchFilter ? { id: branchFilter } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { branches: { where: { active: true, ...(branchFilter ? { branchId: branchFilter } : {}) } } },
    }),
    prisma.stylist.findMany({ where: { active: true }, include: { schedules: { select: { branchId: true } }, services: { select: { serviceId: true } } }, orderBy: { name: "asc" } }),
  ]);
  return {
    branches,
    services: services
      .filter((s) => s.branches.length)
      .map((s) => ({ id: s.id, name: s.name, category: s.category, durationMin: s.durationMin, priceCents: s.priceCents, branchIds: s.branches.map((b) => b.branchId) })),
    stylists: stylists.map((s) => ({ id: s.id, name: s.name, branchIds: [...new Set(s.schedules.map((x) => x.branchId))], serviceIds: s.services.map((x) => x.serviceId) })),
  };
}
