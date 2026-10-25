/**
 * Seed para una base real (Supabase).
 *  - `npm run db:seed`       → solo crea el usuario OWNER inicial (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 *  - `npm run db:seed:demo`  → además carga sedes, catálogo, especialistas y 90 días de reservas de ejemplo.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDatabase } from "../src/lib/seed-data";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Define DATABASE_URL o DIRECT_URL para sembrar la base.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const demo = process.argv.includes("--demo");
  if (demo) {
    if ((await prisma.branch.count()) > 0) throw new Error("La base ya tiene datos; el seed demo solo corre sobre una base vacía.");
    const res = await seedDatabase(prisma, { password: process.env.SEED_ADMIN_PASSWORD });
    console.log(`Seed demo listo: ${res.bookings} reservas, ${res.customers} clientas.`);
    return;
  }
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 10 caracteres).");
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Dirección general", role: "OWNER", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Usuario OWNER listo: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
