import type { BookingChannel, BookingStatus, Role, ServiceCategory, StylistLevel } from "@/generated/prisma/enums";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};

export const CHANNEL_LABELS: Record<BookingChannel, string> = {
  WHATSAPP: "WhatsApp",
  WEB: "Web",
  DASHBOARD: "Dashboard",
  PHONE: "Teléfono",
  WALK_IN: "Walk-in",
};

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  BROWS: "Cejas",
  LASHES: "Pestañas",
  LIPS: "Labios",
  SKIN: "Piel",
  NAILS: "Uñas",
  HAIR: "Cabello",
  MAKEUP: "Maquillaje",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Dirección",
  ADMIN: "Administración",
  BRANCH_MANAGER: "Gerencia de sede",
  RECEPTION: "Recepción",
  STYLIST: "Especialista",
};

export const LEVEL_LABELS: Record<StylistLevel, string> = { JUNIOR: "Junior", SENIOR: "Senior", MASTER: "Master" };
