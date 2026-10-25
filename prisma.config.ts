import "dotenv/config";
import { defineConfig } from "prisma/config";

// Las migraciones usan la conexión directa (sin pooler). La app usa DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});
