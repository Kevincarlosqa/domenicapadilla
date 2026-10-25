import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { db } from "./prisma";
import { readSession } from "./session";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  stylistId: string | null;
  /** null = todas las sedes. */
  branchIds: string[] | null;
}

export { ROLE_LABELS } from "./labels";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const isAdmin = (u: Pick<CurrentUser, "role">) => u.role === "OWNER" || u.role === "ADMIN";

/** Usuario de la sesión, validado contra la base en cada request (deduplicado por render). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const prisma = await db();
  const user = await prisma.user.findUnique({ where: { id: session.sub }, include: { branches: true, stylist: { include: { schedules: true } } } });
  if (!user || !user.active) return null;
  let branchIds: string[] | null = null;
  if (user.role === "BRANCH_MANAGER" || user.role === "RECEPTION") branchIds = user.branches.map((b) => b.branchId);
  if (user.role === "STYLIST") branchIds = [...new Set(user.stylist?.schedules.map((s) => s.branchId) ?? [])];
  return { id: user.id, name: user.name, email: user.email, role: user.role, stylistId: user.stylistId, branchIds };
});

export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción.") {
    super(message);
  }
}

/** Para server actions y APIs: lanza en vez de redirigir. */
export async function assertUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (roles && !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/**
 * Sedes visibles para el usuario, intersectadas con la sede elegida en el selector.
 * Devuelve undefined si puede ver todas y no filtró.
 */
export function scopeBranches(user: CurrentUser, selected?: string | null): string[] | undefined {
  if (user.branchIds === null) return selected && selected !== "all" ? [selected] : undefined;
  if (selected && selected !== "all") return user.branchIds.includes(selected) ? [selected] : [];
  return user.branchIds;
}

export function canAccessBranch(user: CurrentUser, branchId: string) {
  return user.branchIds === null || user.branchIds.includes(branchId);
}

/** Filtro Prisma de reservas según el alcance del usuario. */
export function bookingScope(user: CurrentUser, selected?: string | null) {
  const branches = scopeBranches(user, selected);
  return {
    ...(branches ? { branchId: { in: branches } } : {}),
    ...(user.role === "STYLIST" && user.stylistId ? { items: { some: { stylistId: user.stylistId } } } : {}),
  };
}

export async function assertBookingAccess(user: CurrentUser, bookingId: string) {
  const prisma = await db();
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, ...bookingScope(user) }, select: { id: true } });
  if (!booking) throw new ForbiddenError("No tienes acceso a esta reserva.");
}

/** Filtro Prisma de clientas visibles para el usuario. */
export function customerScope(user: CurrentUser, selected?: string | null) {
  const branches = scopeBranches(user, selected);
  if (user.role === "STYLIST") {
    return { bookings: { some: { items: { some: { stylistId: user.stylistId ?? "-" } } } } };
  }
  if (!branches) return {};
  return { OR: [{ bookings: { some: { branchId: { in: branches } } } }, { preferredBranchId: { in: branches } }] };
}
