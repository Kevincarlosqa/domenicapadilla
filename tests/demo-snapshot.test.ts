import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createDemoClient } from "@/lib/demo";
import { DEMO_SNAPSHOT_FILE, DEMO_SNAPSHOT_META } from "@/lib/migrations";

// Solo corre si existe la foto (se genera con `npm run demo:snapshot` o en el build demo).
describe.skipIf(!existsSync(DEMO_SNAPSHOT_FILE))("foto de la base demo", () => {
  it("carga rápido y con datos", async () => {
    const t = Date.now();
    const prisma = await createDemoClient();
    const ms = Date.now() - t;
    const [bookings, users] = await Promise.all([prisma.booking.count(), prisma.user.count()]);
    console.log(`carga desde la foto: ${ms} ms, ${bookings} reservas`);
    expect(bookings).toBeGreaterThan(1000);
    expect(users).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5000);
  });

  it("corre las fechas semanas completas si la foto es antigua", async () => {
    const original = await readFile(DEMO_SNAPSHOT_META, "utf8");
    const seededAt = Number(JSON.parse(original).seededAt);
    try {
      // Simula que el build se hizo hace 15 días → se deben sumar 14 días (2 semanas).
      await writeFile(DEMO_SNAPSHOT_META, JSON.stringify({ seededAt: seededAt - 15 * 86_400_000 }));
      const fresh = await createDemoClient();
      await writeFile(DEMO_SNAPSHOT_META, original);
      const base = await createDemoClient();
      const [a, b] = await Promise.all([
        fresh.booking.findFirstOrThrow({ where: { id: "bk_00000" } }),
        base.booking.findFirstOrThrow({ where: { id: "bk_00000" } }),
      ]);
      expect(a.startsAt.getTime() - b.startsAt.getTime()).toBe(14 * 86_400_000);
      expect(a.startsAt.getUTCDay()).toBe(b.startsAt.getUTCDay()); // mismo día de la semana
    } finally {
      await writeFile(DEMO_SNAPSHOT_META, original);
    }
  });
});
