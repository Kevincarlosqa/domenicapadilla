import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createBooking } from "@/lib/booking";
import { db } from "@/lib/prisma";
import { humanDateTime } from "@/lib/time";

const body = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  variantId: z.string().optional(),
  stylistId: z.string().optional(),
  start: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(20),
  notes: z.string().max(300).optional(),
  consent: z.literal(true),
  website: z.string().max(0).optional(), // honeypot anti-bots
});

/** Reserva web con disponibilidad real. */
export async function POST(request: NextRequest) {
  try {
    const data = body.parse(await request.json());
    const prisma = await db();
    const booking = await createBooking(prisma, {
      branchId: data.branchId,
      phone: data.phone,
      customerName: data.name,
      items: [{ serviceId: data.serviceId, variantId: data.variantId, stylistId: data.stylistId }],
      start: new Date(data.start),
      channel: "WEB",
      notes: data.notes,
    });
    return Response.json({
      code: booking.code,
      status: booking.status,
      when: humanDateTime(booking.startsAt, booking.branch.timezone),
      branch: booking.branch.name,
      address: booking.branch.address,
      services: booking.items.map((i) => `${i.service.name} con ${i.stylist.name}`),
      totalCents: booking.totalCents,
    });
  } catch (e) {
    return apiError(e);
  }
}
