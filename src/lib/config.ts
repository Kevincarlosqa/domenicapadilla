import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DEMO_MODE: z.enum(["true", "false"]).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
  WHATSAPP_TEMPLATE_REMINDER: z.string().default("recordatorio_cita"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("es"),
  WHATSAPP_PUBLIC_NUMBER: z.string().default("51908881986"),
  CRON_SECRET: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  demoMode: parsed.DEMO_MODE === "true" || !parsed.DATABASE_URL,
  // En demo se usa un secreto fijo para que el login funcione sin configuración.
  sessionSecret: parsed.SESSION_SECRET ?? "demo-secret-domenica-padilla-cambia-esto-en-produccion",
  whatsappEnabled: Boolean(parsed.WHATSAPP_TOKEN && parsed.WHATSAPP_PHONE_NUMBER_ID),
  aiEnabled: Boolean(parsed.ANTHROPIC_API_KEY),
};

if (!config.demoMode && !parsed.SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET es obligatorio en producción (mínimo 32 caracteres).");
}
