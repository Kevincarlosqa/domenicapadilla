"use client";

import { useActionState, useTransition, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type { FormState } from "@/app/dashboard/configuracion/actions";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

/** Formulario con server action y mensaje de resultado. Funciona sin JS (mejora progresiva). */
export function ActionForm({
  action,
  children,
  submitLabel = "Guardar",
  className,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={cn("space-y-4", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : state.message ? (
          <p role="status" className="text-sm text-success">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function InlineAction({ action, label, confirmText, icon = false }: { action: () => Promise<void>; label: string; confirmText?: string; icon?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(() => action());
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-sand hover:text-ink disabled:opacity-50"
    >
      {icon ? <Trash2 className="h-3.5 w-3.5" /> : label}
    </button>
  );
}
