import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "./auth";
import { BookingError } from "./booking";
import { CatalogError } from "./catalog";

/** Respuesta JSON de error uniforme para las rutas API. */
export function apiError(err: unknown) {
  // Las señales internas de Next (prerender, redirect, notFound) no son errores de la API.
  unstable_rethrow(err);
  if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos", detalles: z.flattenError(err).fieldErrors }, { status: 400 });
  if (err instanceof ForbiddenError) return Response.json({ error: err.message }, { status: 403 });
  if (err instanceof CatalogError) return Response.json({ error: err.message }, { status: 400 });
  if (err instanceof BookingError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "SLOT_TAKEN" ? 409 : 422;
    return Response.json({ error: err.message, code: err.code, alternatives: err.alternatives }, { status });
  }
  console.error(err);
  return Response.json({ error: "Error interno" }, { status: 500 });
}
