import type { Metadata } from "next";
import { Simulator } from "@/components/dashboard/chat";
import { PageHeader } from "@/components/dashboard/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Simulador del bot" };

export default async function SimuladorPage() {
  await requireUser(["OWNER", "ADMIN", "BRANCH_MANAGER"]);
  return (
    <>
      <PageHeader title="Simulador del bot" description="Prueba el asistente de WhatsApp sin enviar mensajes reales." />
      <Simulator />
    </>
  );
}
