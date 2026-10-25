"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";

const schema = z.object({
  email: z.email("Escribe un correo válido").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const prisma = await db();
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Comparar siempre para no filtrar qué correos existen por el tiempo de respuesta.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok || !user.active) return { error: "Correo o contraseña incorrectos." };
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, user.role);
  const next = parsed.data.next?.startsWith("/dashboard") ? parsed.data.next : user.role === "RECEPTION" ? "/dashboard/agenda" : "/dashboard";
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
