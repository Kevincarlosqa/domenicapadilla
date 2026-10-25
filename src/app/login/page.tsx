import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import { config } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <LoginForm next={next} demo={config.demoMode} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink text-ivory lg:block">
        <LogoMark className="absolute -right-40 -bottom-40 h-[44rem] w-[44rem] animate-spin-slow text-ivory/[0.06]" title="" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="font-display text-2xl">
            Doménica <em>Padilla</em>
          </Link>
          <div>
            <p className="font-display text-6xl leading-[0.95]">
              All types
              <br />
              of <em className="text-blush">beauty</em>*
            </p>
            <p className="mt-6 max-w-sm text-sm text-ivory/70">Panel de gestión de sedes, agenda, clientas y WhatsApp.</p>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <LogoMark className="mb-8 h-10 w-10 lg:hidden" />
          <h1 className="font-display text-4xl">Bienvenida de vuelta</h1>
          <p className="mt-2 mb-8 text-sm text-muted">Ingresa con la cuenta que te dio administración. No hay registro público.</p>
          <Suspense fallback={<div className="h-64" />}>
            <Form searchParams={props.searchParams} />
          </Suspense>
          {config.demoMode ? (
            <div className="mt-8 rounded-2xl border border-line bg-paper p-4 text-xs text-muted">
              <p className="mb-2 font-semibold text-ink">Modo demo — contraseña <code>demo1234</code></p>
              <ul className="space-y-1">
                <li>owner@domenicapadilla.pe — todas las sedes</li>
                <li>sanisidro@domenicapadilla.pe — gerencia Dasso + Begonias</li>
                <li>recepcion.dasso@domenicapadilla.pe — recepción Dasso</li>
                <li>carla@domenicapadilla.pe — especialista</li>
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
