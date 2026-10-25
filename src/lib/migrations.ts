import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

/** Aplica todas las migraciones SQL de prisma/migrations en orden (modo demo y tests). */
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

/** Dónde se guarda la foto de la base demo generada en el build. */
export const DEMO_SNAPSHOT_DIR = path.join(process.cwd(), "prisma", "demo-snapshot");
export const DEMO_SNAPSHOT_FILE = path.join(DEMO_SNAPSHOT_DIR, "pglite.tar.gz");
export const DEMO_SNAPSHOT_META = path.join(DEMO_SNAPSHOT_DIR, "meta.json");
