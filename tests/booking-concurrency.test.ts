import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import { applyMigrations } from "@/lib/demo";
import { seedDatabase } from "@/lib/seed-data";
import { getAvailability } from "@/lib/availability";
import { BookingError, createBooking } from "@/lib/booking";
import type { Slot } from "@/lib/availability-engine";
import { addDaysKey, localDateKey } from "@/lib/time";

let prisma: PrismaClient;

beforeAll(async () => {
  const pg = new PGlite();
  await applyMigrations(pg);
  prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  await seedDatabase(prisma);
});

async function firstSlot(branchId: string, items: Array<{ serviceId: string; stylistId?: string }>) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const today = localDateKey(new Date(), branch.timezone);
  for (let d = 2; d < 14; d++) {
    const { days } = await getAvailability(prisma, { branchId, items, fromKey: addDaysKey(today, d) });
    if (days[0]!.slots[0]) return days[0]!.slots[0] as Slot;
  }
  throw new Error("sin huecos");
}

describe("reservas", () => {
  it("dos clientas no pueden quedarse el mismo hueco", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: "dasso" } });
    const stylist = await prisma.stylist.findUniqueOrThrow({ where: { slug: "andrea-salazar" } });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: "lifting-pestanas" } });
    const items = [{ serviceId: service.id, stylistId: stylist.id }];
    const start = new Date((await firstSlot(branch.id, items)).start);

    const results = await Promise.allSettled([
      createBooking(prisma, { branchId: branch.id, phone: "+51911000001", customerName: "Clienta A", items, start, channel: "WEB" }),
      createBooking(prisma, { branchId: branch.id, phone: "+51911000002", customerName: "Clienta B", items, start, channel: "WHATSAPP" }),
    ]);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const err = failed[0]!.reason as BookingError;
    expect(err).toBeInstanceOf(BookingError);
    expect(err.code).toBe("SLOT_TAKEN");
    expect(err.alternatives.length).toBeGreaterThan(0);
  });

  it("una especialista en dos sedes no puede tener dos citas a la vez", async () => {
    // Carla trabaja en Dasso (L-M-V) y Begonias (Ma-J): se reserva en Dasso y se comprueba que el bloque no se ofrezca en ninguna sede.
    const carla = await prisma.stylist.findUniqueOrThrow({ where: { slug: "carla-mendoza" }, include: { schedules: { include: { branch: true } } } });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: "diseno-henna" } });
    const dasso = carla.schedules.find((s) => s.branch.slug === "dasso")!.branch;
    const items = [{ serviceId: service.id, stylistId: carla.id }];
    const slot = await firstSlot(dasso.id, items);
    await createBooking(prisma, { branchId: dasso.id, phone: "+51911000010", items, start: new Date(slot.start), channel: "WEB" });
    const key = localDateKey(slot.start, dasso.timezone);
    for (const b of new Set(carla.schedules.map((s) => s.branchId))) {
      const { days } = await getAvailability(prisma, { branchId: b, items, fromKey: key });
      expect(days[0]!.slots.some((s) => s.start < slot.end && slot.start < s.end)).toBe(false);
    }
  });

  it("aplica el límite de reservas activas por clienta", async () => {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { slug: "dasso" } });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: "manicure-semi" } });
    const items = [{ serviceId: service.id }];
    const today = localDateKey(new Date(), branch.timezone);
    let created = 0;
    let policyError: BookingError | null = null;
    for (let d = 2; d < 14 && !policyError; d++) {
      const { days } = await getAvailability(prisma, { branchId: branch.id, items, fromKey: addDaysKey(today, d) });
      const s = days[0]!.slots[0];
      if (!s) continue;
      try {
        await createBooking(prisma, { branchId: branch.id, phone: "+51911000099", items, start: new Date(s.start), channel: "WEB" });
        created++;
      } catch (e) {
        policyError = e as BookingError;
      }
    }
    expect(created).toBe(branch.maxActiveBookings);
    expect(policyError?.code).toBe("POLICY");
  });
});
