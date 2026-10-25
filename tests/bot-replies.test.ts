import { describe, expect, it } from "vitest";
import { repeatsInteractive, toWhatsAppFormat } from "@/lib/ai-agent";
import type { Outbound } from "@/lib/whatsapp";

// Caso real del simulador: el bot mandó botones y luego repitió todo en texto.
const buttons: Outbound = {
  type: "buttons",
  body: "Para mañana lunes 26 no queda ningún horario de microshading en Cavenecia. Revisé también Dasso, Begonias y Monte Rosa, y tampoco tienen espacio ese día 💞\n\nLo más pronto que encontré:\n• Cavenecia: martes 27, 4:15 p. m., con Gabriela Flores (S/ 790)\n• Monte Rosa, en Chacarilla: martes 27, 10:00 a. m., con Alessandra Ríos (S/ 790)\n\nSi quieres que sea el lunes sí o sí, te anoto en la lista de espera y te avisamos si alguien cancela.",
  buttons: [
    { id: "a", title: "Cavenecia mar 4:15pm" },
    { id: "b", title: "Monte Rosa mar 10am" },
    { id: "c", title: "Lista de espera lun" },
  ],
};

describe("respuestas del bot", () => {
  it("descarta el texto que repite el mensaje con botones", () => {
    const repeated =
      "Mañana lunes 26 no hay ningún horario para microshading en Cavenecia. Revisé también Dasso, Begonias y Monte Rosa, y ninguna tiene espacio ese día.\n\nLos horarios más cercanos que hay:\n• **Cavenecia:** martes 27, 4:15 p. m., con Gabriela Flores (S/ 790).\n• **Monte Rosa (Chacarilla):** martes 27, 10:00 a. m., con Alessandra Ríos (S/ 790).\n\nTe mandé botones para que elijas 💞 ¿Me dices tu nombre para la reserva?";
    expect(repeatsInteractive(repeated, [buttons])).toBe(true);
  });

  it("deja pasar una pregunta corta nueva", () => {
    expect(repeatsInteractive("¿Me dices tu nombre para la reserva?", [buttons])).toBe(false);
  });

  it("no filtra nada si no hubo mensaje con botones", () => {
    expect(repeatsInteractive("Hola, ¿en qué sede te atendemos?", [])).toBe(false);
  });

  it("convierte la negrita Markdown al formato de WhatsApp", () => {
    expect(toWhatsAppFormat("**Cavenecia:** martes")).toBe("*Cavenecia:* martes");
  });
});
