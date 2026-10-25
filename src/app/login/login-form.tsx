"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button, Field, inputClass } from "@/components/dashboard/ui";

export function LoginForm({ next, demo }: { next?: string; demo: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Correo" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass} defaultValue={demo ? "owner@domenicapadilla.pe" : ""} />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} defaultValue={demo ? "demo1234" : ""} />
      </Field>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-[#f5e1e1] px-3 py-2 text-sm text-[#8a2c2c]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-2 h-11">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
