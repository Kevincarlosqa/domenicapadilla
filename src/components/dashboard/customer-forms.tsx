"use client";

import { useState, useTransition } from "react";
import { addTechnicalNote, updateCustomer } from "@/app/dashboard/actions";
import { Button, Field, inputClass } from "./ui";
import { cn } from "@/lib/utils";

function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={cn("text-xs", msg.ok ? "text-success" : "text-danger")}>
      {msg.text}
    </p>
  );
}

export function CustomerEditor({
  customer,
}: {
  customer: { id: string; name: string; email: string; skinType: string; hairType: string; allergies: string; notes: string; tags: string; marketingOptIn: boolean };
}) {
  const [form, setForm] = useState(customer);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateCustomer(customer.id, form);
          setMsg(res.ok ? { ok: true, text: "Guardado" } : { ok: false, text: res.error });
        });
      }}
    >
      <Field label="Nombre" htmlFor="c-name">
        <input id="c-name" className={inputClass} value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Correo" htmlFor="c-email">
        <input id="c-email" type="email" className={inputClass} value={form.email} onChange={set("email")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de piel" htmlFor="c-skin">
          <input id="c-skin" className={inputClass} value={form.skinType} onChange={set("skinType")} />
        </Field>
        <Field label="Tipo de cabello" htmlFor="c-hair">
          <input id="c-hair" className={inputClass} value={form.hairType} onChange={set("hairType")} />
        </Field>
      </div>
      <Field label="Alergias" htmlFor="c-allergies">
        <input id="c-allergies" className={inputClass} value={form.allergies} onChange={set("allergies")} />
      </Field>
      <Field label="Etiquetas" htmlFor="c-tags" hint="Separadas por coma">
        <input id="c-tags" className={inputClass} value={form.tags} onChange={set("tags")} />
      </Field>
      <Field label="Notas internas" htmlFor="c-notes">
        <textarea id="c-notes" rows={4} className={cn(inputClass, "h-auto py-2")} value={form.notes} onChange={set("notes")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} className="h-4 w-4 accent-rose" />
        Acepta comunicaciones de marketing
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

export function TechnicalNoteForm({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", formula: "", body: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Agregar nota técnica
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addTechnicalNote(customerId, form);
          if (res.ok) {
            setForm({ title: "", formula: "", body: "" });
            setOpen(false);
          } else setMsg({ ok: false, text: res.error });
        });
      }}
    >
      <Field label="Título" htmlFor="tn-title">
        <input id="tn-title" required className={inputClass} placeholder="Microblading — sesión inicial" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>
      <Field label="Fórmula / pigmento / aguja" htmlFor="tn-formula">
        <input id="tn-formula" className={inputClass} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} />
      </Field>
      <Field label="Observaciones" htmlFor="tn-body">
        <textarea id="tn-body" rows={3} className={cn(inputClass, "h-auto py-2")} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Guardar nota
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}
