"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { Role, StylistLevel, TimeOffKind } from "@/generated/prisma/enums";
import { ForbiddenError, assertUser, canAccessBranch, hashPassword, isAdmin, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { hhmmToMin, wallToUtc } from "@/lib/time";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const ADMIN = ["OWNER", "ADMIN"] as const;
const MANAGERS = ["OWNER", "ADMIN", "BRANCH_MANAGER"] as const;

async function handle(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const message = (await fn()) ?? "Cambios guardados";
    refresh();
    return { ok: true, message };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" · ") };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya existe un registro con ese valor único (slug o correo)." };
    console.error(e);
    return { ok: false, error: "No se pudo guardar." };
  }
}

const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** "09:00-13:00, 14:00-19:00" → franjas en minutos. Vacío = cerrado. */
function parseRanges(text: string): Array<{ startMin: number; endMin: number }> {
  if (!text.trim()) return [];
  return text.split(",").map((part) => {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) throw new z.ZodError([{ code: "custom", path: [], message: `Franja inválida: "${part.trim()}" (usa 09:00-13:00)`, input: part }]);
    const startMin = hhmmToMin(m[1]!);
    const endMin = hhmmToMin(m[2]!);
    if (endMin <= startMin || endMin > 24 * 60) throw new z.ZodError([{ code: "custom", path: [], message: `La franja ${part.trim()} termina antes de empezar`, input: part }]);
    return { startMin, endMin };
  });
}

// ─── Sedes ──────────────────────────────────────────────────────────────────

const branchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(4).max(160),
  reference: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(9).max(20),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("es", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria inválida"),
  stations: int(1, 50),
  slotIntervalMin: int(5, 120),
  minLeadMinutes: int(0, 60 * 24 * 7),
  maxDaysAhead: int(1, 365),
  cancelWindowHours: int(0, 168),
  maxActiveBookings: int(1, 20),
  noShowWarnAt: int(1, 20),
  noShowBlockAt: int(1, 50),
  active: bool,
});

export async function saveBranch(_: FormState, fd: FormData) {
  return handle(async () => {
    const user = await assertUser([...MANAGERS]);
    const d = branchSchema.parse(Object.fromEntries(fd));
    if (!canAccessBranch(user, d.id)) throw new ForbiddenError();
    const hours = [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => parseRanges(String(fd.get(`hours_${weekday}`) ?? "")).map((r) => ({ weekday, ...r })));
    const prisma = await db();
    const { id, ...data } = d;
    await prisma.$transaction([
      prisma.branch.update({ where: { id }, data: { ...data, reference: data.reference || null } }),
      prisma.branchHours.deleteMany({ where: { branchId: id } }),
      prisma.branchHours.createMany({ data: hours.map((h) => ({ ...h, branchId: id })) }),
    ]);
    updateTag("catalog");
  });
}

const closureSchema = z.object({ branchId: z.string().min(1), from: z.iso.date(), to: z.iso.date(), reason: z.string().trim().min(2).max(120) });

export async function addClosure(_: FormState, fd: FormData) {
  return handle(async () => {
    const user = await assertUser([...MANAGERS]);
    const d = closureSchema.parse(Object.fromEntries(fd));
    if (!canAccessBranch(user, d.branchId)) throw new ForbiddenError();
    const prisma = await db();
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: d.branchId } });
    const start = wallToUtc(d.from, 0, branch.timezone);
    const end = wallToUtc(d.to, 24 * 60 - 1, branch.timezone);
    if (end <= start) throw new ForbiddenError("La fecha final debe ser posterior.");
    await prisma.branchClosure.create({ data: { branchId: d.branchId, startsAt: start, endsAt: end, reason: d.reason } });
    return "Cierre agregado";
  });
}

export async function removeClosure(id: string) {
  const user = await assertUser([...MANAGERS]);
  const prisma = await db();
  const c = await prisma.branchClosure.findUniqueOrThrow({ where: { id } });
  if (!canAccessBranch(user, c.branchId)) throw new ForbiddenError();
  await prisma.branchClosure.delete({ where: { id } });
  refresh();
}

// ─── Especialistas ──────────────────────────────────────────────────────────

const stylistSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(80),
  level: z.enum(StylistLevel),
  bio: z.string().max(400).optional(),
  instagram: z.string().max(60).optional(),
  active: bool,
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export async function saveStylist(_: FormState, fd: FormData) {
  return handle(async () => {
    const user = await assertUser([...MANAGERS]);
    const d = stylistSchema.parse(Object.fromEntries(fd));
    const prisma = await db();
    const branches = await prisma.branch.findMany({ where: user.branchIds ? { id: { in: user.branchIds } } : {}, select: { id: true } });
    // Horario: campos sched_<branchId>_<weekday>; solo se tocan las sedes que el usuario gestiona.
    const schedules = branches.flatMap((b) =>
      [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => parseRanges(String(fd.get(`sched_${b.id}_${weekday}`) ?? "")).map((r) => ({ branchId: b.id, weekday, ...r }))),
    );
    const skills = fd.getAll("skills").map(String);
    const overrides = skills.map((serviceId) => ({
      serviceId,
      priceCents: fd.get(`price_${serviceId}`) ? Math.round(Number(fd.get(`price_${serviceId}`)) * 100) || null : null,
      durationMin: fd.get(`dur_${serviceId}`) ? Number(fd.get(`dur_${serviceId}`)) || null : null,
    }));
    const data = { name: d.name, title: d.title, level: d.level, bio: d.bio || null, instagram: d.instagram || null, active: d.active };
    const managed = branches.map((b) => b.id);

    if (d.id) {
      if (user.branchIds) {
        const s = await prisma.stylist.findFirst({ where: { id: d.id, schedules: { some: { branchId: { in: user.branchIds } } } } });
        if (!s) throw new ForbiddenError();
      }
      await prisma.$transaction([
        prisma.stylist.update({ where: { id: d.id }, data }),
        prisma.stylistSchedule.deleteMany({ where: { stylistId: d.id, branchId: { in: managed } } }),
        prisma.stylistSchedule.createMany({ data: schedules.map((s) => ({ ...s, stylistId: d.id! })) }),
        ...(isAdmin(user)
          ? [prisma.stylistService.deleteMany({ where: { stylistId: d.id } }), prisma.stylistService.createMany({ data: overrides.map((o) => ({ ...o, stylistId: d.id! })) })]
          : []),
      ]);
    } else {
      await prisma.stylist.create({
        data: { ...data, slug: `${slugify(d.name)}-${Math.random().toString(36).slice(2, 6)}`, schedules: { create: schedules }, services: { create: overrides } },
      });
    }
    updateTag("catalog");
  });
}

const timeOffSchema = z.object({
  stylistId: z.string().min(1),
  kind: z.enum(TimeOffKind),
  from: z.iso.datetime({ local: true }),
  to: z.iso.datetime({ local: true }),
  reason: z.string().max(120).optional(),
});

async function assertStylistAccess(user: Awaited<ReturnType<typeof assertUser>>, stylistId: string) {
  if (!user.branchIds) return;
  const ok = await (await db()).stylist.findFirst({ where: { id: stylistId, schedules: { some: { branchId: { in: user.branchIds } } } }, select: { id: true } });
  if (!ok) throw new ForbiddenError();
}

export async function addTimeOff(_: FormState, fd: FormData) {
  return handle(async () => {
    const user = await assertUser([...MANAGERS]);
    const d = timeOffSchema.parse(Object.fromEntries(fd));
    await assertStylistAccess(user, d.stylistId);
    const [fromDate, fromTime] = d.from.split("T") as [string, string];
    const [toDate, toTime] = d.to.split("T") as [string, string];
    const start = wallToUtc(fromDate, hhmmToMin(fromTime.slice(0, 5)), "America/Lima");
    const end = wallToUtc(toDate, hhmmToMin(toTime.slice(0, 5)), "America/Lima");
    if (end <= start) throw new ForbiddenError("El fin debe ser posterior al inicio.");
    await (await db()).timeOff.create({ data: { stylistId: d.stylistId, kind: d.kind, startsAt: start, endsAt: end, reason: d.reason || null } });
    return "Ausencia registrada";
  });
}

export async function removeTimeOff(id: string) {
  const user = await assertUser([...MANAGERS]);
  const prisma = await db();
  const t = await prisma.timeOff.findUniqueOrThrow({ where: { id } });
  await assertStylistAccess(user, t.stylistId);
  await prisma.timeOff.delete({ where: { id } });
  refresh();
}

// ─── Servicios ──────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  durationMin: int(5, 600),
  price: z.coerce.number().min(0).max(100000),
  priceFrom: bool,
  bufferMin: int(0, 120),
  processingOffsetMin: z.coerce.number().int().min(0).max(600).optional().or(z.literal("")),
  processingMin: z.coerce.number().int().min(0).max(600).optional().or(z.literal("")),
  retouchAfterDays: z.coerce.number().int().min(0).max(365).optional().or(z.literal("")),
  active: bool,
  featured: bool,
});

export async function saveService(_: FormState, fd: FormData) {
  return handle(async () => {
    await assertUser([...ADMIN]);
    const d = serviceSchema.parse(Object.fromEntries(fd));
    const prisma = await db();
    const branches = await prisma.branch.findMany({ select: { id: true } });
    const num = (v: unknown) => (v === "" || v === undefined || v === 0 ? null : Number(v));
    await prisma.$transaction([
      prisma.service.update({
        where: { id: d.id },
        data: {
          name: d.name,
          description: d.description,
          durationMin: d.durationMin,
          priceCents: Math.round(d.price * 100),
          priceFrom: d.priceFrom,
          bufferMin: d.bufferMin,
          processingOffsetMin: num(d.processingOffsetMin),
          processingMin: num(d.processingMin),
          retouchAfterDays: num(d.retouchAfterDays),
          active: d.active,
          featured: d.featured,
        },
      }),
      ...branches.map((b) => {
        const offered = fd.get(`offer_${b.id}`) === "on";
        const price = fd.get(`bprice_${b.id}`);
        const dur = fd.get(`bdur_${b.id}`);
        const data = { active: offered, priceCents: price ? Math.round(Number(price) * 100) : null, durationMin: dur ? Number(dur) : null };
        return prisma.branchService.upsert({
          where: { branchId_serviceId: { branchId: b.id, serviceId: d.id } },
          create: { branchId: b.id, serviceId: d.id, ...data },
          update: data,
        });
      }),
    ]);
    updateTag("catalog");
  });
}

// ─── Usuarios ───────────────────────────────────────────────────────────────

const userSchema = z.object({
  email: z.email("Correo inválido").transform((v) => v.toLowerCase().trim()),
  name: z.string().trim().min(2).max(80),
  role: z.enum(Role),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200),
  stylistId: z.string().optional(),
});

export async function createUser(_: FormState, fd: FormData) {
  return handle(async () => {
    const me = await assertUser([...ADMIN]);
    const d = userSchema.parse(Object.fromEntries(fd));
    if (d.role === "OWNER" && me.role !== "OWNER") throw new ForbiddenError("Solo dirección puede crear otro usuario de dirección.");
    const branches = fd.getAll("branches").map(String);
    if ((d.role === "BRANCH_MANAGER" || d.role === "RECEPTION") && branches.length === 0) throw new ForbiddenError("Asigna al menos una sede.");
    if (d.role === "STYLIST" && !d.stylistId) throw new ForbiddenError("Vincula la cuenta a una especialista.");
    await (await db()).user.create({
      data: {
        email: d.email,
        name: d.name,
        role: d.role,
        passwordHash: await hashPassword(d.password),
        stylistId: d.role === "STYLIST" ? d.stylistId : null,
        branches: d.role === "BRANCH_MANAGER" || d.role === "RECEPTION" ? { create: branches.map((branchId) => ({ branchId })) } : undefined,
      },
    });
    return "Usuario creado";
  });
}

export async function toggleUser(id: string) {
  const me = await assertUser([...ADMIN]);
  if (id === me.id) throw new ForbiddenError("No puedes desactivarte a ti misma.");
  const prisma = await db();
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (u.role === "OWNER" && me.role !== "OWNER") throw new ForbiddenError();
  await prisma.user.update({ where: { id }, data: { active: !u.active } });
  refresh();
}

export async function resetPassword(_: FormState, fd: FormData) {
  return handle(async () => {
    const me = await assertUser([...ADMIN]);
    const { id, password } = z.object({ id: z.string(), password: z.string().min(10, "Mínimo 10 caracteres").max(200) }).parse(Object.fromEntries(fd));
    const prisma = await db();
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (u.role === "OWNER" && me.role !== "OWNER") throw new ForbiddenError();
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
    return "Contraseña actualizada";
  });
}

// ─── Mi cuenta ──────────────────────────────────────────────────────────────

export async function changeOwnPassword(_: FormState, fd: FormData) {
  return handle(async () => {
    const me = await assertUser();
    const d = z
      .object({ current: z.string().min(1, "Escribe tu contraseña actual"), next: z.string().min(10, "La nueva contraseña debe tener al menos 10 caracteres").max(200), confirm: z.string() })
      .refine((v) => v.next === v.confirm, { message: "Las contraseñas no coinciden" })
      .parse(Object.fromEntries(fd));
    const prisma = await db();
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(d.current, u.passwordHash))) throw new ForbiddenError("La contraseña actual no es correcta.");
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(d.next) } });
    return "Contraseña actualizada";
  });
}
