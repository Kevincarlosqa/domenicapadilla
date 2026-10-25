"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { changeStatus } from "@/app/dashboard/actions";
import { BookingForm, type FormCatalog } from "./booking-form";
import { Button } from "./ui";
import { STATUS_LABELS } from "@/lib/labels";

const NEXT: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function StatusActions({ bookingId, status, isAdmin }: { bookingId: string; status: BookingStatus; isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = status === "NO_SHOW" && isAdmin ? (["CONFIRMED", "COMPLETED"] as BookingStatus[]) : NEXT[status];
  if (!options.length) return null;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <select
        aria-label="Cambiar estado"
        disabled={pending}
        value=""
        onChange={(e) => {
          const to = e.target.value as BookingStatus;
          if (!to) return;
          if (to === "CANCELLED" && !confirm("¿Cancelar esta reserva? Se avisará a la lista de espera.")) return;
          start(async () => {
            const res = await changeStatus(bookingId, to);
            setError(res.ok ? null : res.error);
          });
        }}
        className="h-8 rounded-full border border-line bg-paper px-2 text-xs"
      >
        <option value="">{pending ? "Guardando…" : "Cambiar a…"}</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error ? <span className="max-w-48 text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}

export function NewBookingButton({ catalog, defaultBranchId, today }: { catalog: FormCatalog; defaultBranchId?: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva reserva
      </Button>
      {open ? <BookingForm catalog={catalog} defaultBranchId={defaultBranchId} defaultDate={today} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
