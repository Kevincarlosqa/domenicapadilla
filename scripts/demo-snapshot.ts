/**
 * Genera la "foto" de la base demo (PGlite ya migrada y sembrada) para que el modo demo
 * arranque en milisegundos en vez de sembrar en cada servidor nuevo.
 * El archivo resultante se guarda en el código; solo hay que volver a generarlo (`npm run demo:snapshot`)
 * si cambian los datos de ejemplo de src/lib/seed-data.ts.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_SNAPSHOT_DIR, DEMO_SNAPSHOT_FILE, DEMO_SNAPSHOT_META, applyMigrations } from "../src/lib/migrations";
import { seedDatabase } from "../src/lib/seed-data";

async function main() {
  const demo = process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL;
  if (!demo && !process.argv.includes("--force")) {
    console.log("[demo-snapshot] Hay DATABASE_URL: no hace falta la foto demo.");
    return;
  }
  const started = Date.now();
  const pg = new PGlite();
  await applyMigrations(pg);
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const seededAt = Date.now();
  const res = await seedDatabase(prisma, { now: new Date(seededAt) });
  const dump = await pg.dumpDataDir("gzip");
  await mkdir(DEMO_SNAPSHOT_DIR, { recursive: true });
  await writeFile(DEMO_SNAPSHOT_FILE, Buffer.from(await dump.arrayBuffer()));
  await writeFile(DEMO_SNAPSHOT_META, JSON.stringify({ seededAt }));
  await prisma.$disconnect();
  await pg.close();
  console.log(`[demo-snapshot] ${res.bookings} reservas, ${res.customers} clientas → ${DEMO_SNAPSHOT_FILE} (${Date.now() - started} ms)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
