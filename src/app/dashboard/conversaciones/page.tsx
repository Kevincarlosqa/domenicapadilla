import type { Metadata } from "next";
import { Inbox } from "@/components/dashboard/chat";
import { PageHeader } from "@/components/dashboard/ui";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Conversaciones" };

export default async function ConversacionesPage() {
  await requireUser(["OWNER", "ADMIN", "BRANCH_MANAGER", "RECEPTION"]);
  return (
    <>
      <PageHeader
        title="Conversaciones"
        description={config.whatsappEnabled ? "WhatsApp Cloud API conectada · un solo número para todas las sedes" : "WhatsApp aún no está conectado: los mensajes se guardan pero no se envían (ver README)."}
      />
      <Inbox />
    </>
  );
}
