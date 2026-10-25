import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "./config";

export type Db = PrismaClient;
/** Cliente dentro de una transacción interactiva. */
export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const globalForDb = globalThis as unknown as { dpDb?: Promise<PrismaClient> };

async function createClient(): Promise<PrismaClient> {
  if (config.demoMode) {
    const { createDemoClient } = await import("./demo");
    return createDemoClient();
  }
  const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
  return new PrismaClient({ adapter });
}

/**
 * Devuelve el cliente de Prisma. Es asíncrono porque en modo demo hay que
 * arrancar PGlite, aplicar migraciones y sembrar datos la primera vez.
 */
export function db(): Promise<PrismaClient> {
  if (!globalForDb.dpDb) {
    globalForDb.dpDb = createClient().catch((err) => {
      globalForDb.dpDb = undefined;
      throw err;
    });
  }
  return globalForDb.dpDb;
}
