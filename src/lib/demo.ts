import "server-only";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO_SNAPSHOT_FILE, DEMO_SNAPSHOT_META, applyMigrations } from "./migrations";
import { seedDatabase } from "./seed-data";

export { applyMigrations };

const DAY = 86_400_000;

/**
 * Corre todas las fechas de la foto las semanas completas transcurridas desde el build,
 * para que la demo siempre muestre "esta semana" y los turnos caigan en el mismo día de la semana.
 * Los feriados (fecha fija) no se mueven.
 */
async function shiftDates(pg: PGlite, days: number) {
  const add = `+ interval '${days} days'`;
  const cols: Record<string, string[]> = {
    Booking: ["startsAt", "endsAt", "createdAt", "updatedAt", "confirmedAt", "cancelledAt", "completedAt", "reminder24hSentAt", "reminder2hSentAt"],
    BookingItem: ["startsAt", "endsAt", "busyUntil", "processingStart", "processingEnd"],
    TimeOff: ["startsAt", "endsAt"],
    Customer: ["createdAt"],
    TechnicalNote: ["createdAt"],
    WaitlistEntry: ["dateFrom", "dateTo", "createdAt", "notifiedAt"],
    Conversation: ["createdAt", "lastMessageAt", "lastInboundAt"],
    Message: ["createdAt"],
  };
  const sql = Object.entries(cols).map(
    ([table, columns]) => `UPDATE "${table}" SET ${columns.map((c) => `"${c}" = "${c}" ${add}`).join(", ")};`,
  );
  sql.push(`UPDATE "BranchClosure" SET "startsAt" = "startsAt" ${add}, "endsAt" = "endsAt" ${add} WHERE "reason" NOT LIKE 'Feriado%';`);
  await pg.exec(sql.join("\n"));
}

/** Carga la foto generada en el build (rápido). Devuelve null si no existe. */
async function fromSnapshot(): Promise<PGlite | null> {
  let data: Buffer;
  let seededAt: number;
  try {
    [data, seededAt] = await Promise.all([readFile(DEMO_SNAPSHOT_FILE), readFile(DEMO_SNAPSHOT_META, "utf8").then((t) => Number(JSON.parse(t).seededAt))]);
  } catch {
    return null;
  }
  const pg = new PGlite({ loadDataDir: new Blob([new Uint8Array(data)]) });
  await pg.waitReady;
  const weeks = Math.floor((Date.now() - seededAt) / (7 * DAY));
  if (weeks > 0) await shiftDates(pg, weeks * 7);
  return pg;
}

/**
 * Base de datos en memoria con datos realistas. Se pierde al reiniciar el servidor.
 * En producción se carga la foto generada en el build; si no existe (p. ej. en `npm run dev`
 * sin build previo), se crea y siembra en el momento.
 */
export async function createDemoClient(): Promise<PrismaClient> {
  const started = Date.now();
  const snapshot = await fromSnapshot().catch((err) => {
    console.warn("[demo] no se pudo cargar la foto, se sembrará en el momento", err);
    return null;
  });
  if (snapshot) {
    console.info(`[demo] base demo cargada desde la foto del build en ${Date.now() - started} ms`);
    return new PrismaClient({ adapter: new PrismaPGlite(snapshot) });
  }
  const pg = new PGlite();
  await applyMigrations(pg);
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  await seedDatabase(client);
  console.info(`[demo] PGlite listo y sembrado en ${Date.now() - started} ms`);
  return client;
}
