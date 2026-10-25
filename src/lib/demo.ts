import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import { seedDatabase } from "./seed-data";

/** Aplica todas las migraciones SQL de prisma/migrations en orden. */
export async function applyMigrations(pg: PGlite) {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of entries) {
    const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8");
    await pg.exec(sql);
  }
}

/** Base de datos en memoria con datos realistas. Se pierde al reiniciar el servidor. */
export async function createDemoClient(): Promise<PrismaClient> {
  const pg = new PGlite();
  await applyMigrations(pg);
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const started = Date.now();
  await seedDatabase(client);
  console.info(`[demo] PGlite listo y sembrado en ${Date.now() - started} ms`);
  return client;
}
