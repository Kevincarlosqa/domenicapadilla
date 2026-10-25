/**
 * Reseñas reales de clientas (con su autorización). La sección se oculta si la lista está vacía.
 * En modo demo se muestran ejemplos marcados como tales: reemplázalos antes de publicar.
 */
export interface Testimonial {
  quote: string;
  author: string;
  service: string;
  branch: string;
}

export const TESTIMONIALS: Testimonial[] = [];

export const DEMO_TESTIMONIALS: Testimonial[] = [
  { quote: "Por fin unas cejas que parecen mías, pero en su mejor versión. Me explicaron cada paso y el retoque quedó perfecto.", author: "Clienta", service: "Microblading", branch: "Dasso" },
  { quote: "Agendé por WhatsApp en dos minutos, a las once de la noche. Al día siguiente ya tenía mi lifting.", author: "Clienta", service: "Lifting de pestañas", branch: "Monte Rosa" },
  { quote: "El lip blush me cambió la cara sin que nadie note qué me hice. Natural, como pedí.", author: "Clienta", service: "Lip blush", branch: "Begonias" },
];
