/**
 * Datos de ejemplo realistas. Se usa en modo demo (PGlite) y con `npm run db:seed:demo`.
 * No importa "server-only" para poder ejecutarse desde tsx.
 */
import bcrypt from "bcryptjs";
import type { BookingChannel, BookingStatus, PrismaClient, ServiceCategory, StylistLevel } from "@/generated/prisma/client";
import { addDaysKey, localDateKey, wallToUtc, weekdayOf } from "./time";

const TZ = "America/Lima";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const h = (hh: number, mm = 0) => hh * 60 + mm;

// ─── Sedes ──────────────────────────────────────────────────────────────────
// Coordenadas aproximadas: verificar antes de producción (docs/business-logic.md §1).
export const BRANCHES = [
  { slug: "dasso", name: "Dasso", district: "San Isidro", city: "Lima", address: "C. Miguel Dasso 126, piso 3", reference: "CC. El Sausalito", lat: -12.0977, lng: -77.0365, phone: "+51908881986", stations: 6, sunday: true },
  { slug: "begonias", name: "Begonias", district: "San Isidro", city: "Lima", address: "C. Las Begonias 429, piso 1, int. 4", reference: null, lat: -12.0912, lng: -77.0225, phone: "+51987359132", stations: 5, sunday: false },
  { slug: "monterosa", name: "Monte Rosa", district: "Chacarilla, Surco", city: "Lima", address: "C. Monte Rosa 284", reference: null, lat: -12.1065, lng: -76.9935, phone: "+51971157220", stations: 5, sunday: false },
  { slug: "cavenecia", name: "Cavenecia", district: "Miraflores", city: "Lima", address: "Av. Emilio Cavenecia 151", reference: null, lat: -12.1055, lng: -77.0385, phone: "+51926670064", stations: 4, sunday: false },
  { slug: "viareal", name: "Vía Real", district: "Lima", city: "Lima", address: "Vía Real 135", reference: "Centro empresarial", lat: -12.0905, lng: -77.0475, phone: "+51908882010", stations: 3, sunday: false },
  { slug: "compostela", name: "Compostela", district: "Lima", city: "Lima", address: "Jr. Santiago de Compostela 130", reference: null, lat: -12.1125, lng: -76.9785, phone: "+51936036277", stations: 3, sunday: false },
  { slug: "yanahuara", name: "Yanahuara", district: "Yanahuara", city: "Arequipa", address: "Francisco Bolognesi 108", reference: null, lat: -16.3878, lng: -71.5435, phone: "+51974469983", stations: 4, sunday: true },
] as const;

// ─── Servicios ──────────────────────────────────────────────────────────────
interface SeedService {
  slug: string;
  name: string;
  category: ServiceCategory;
  description: string;
  durationMin: number;
  price: number; // soles
  priceFrom?: boolean;
  bufferMin?: number;
  processing?: [number, number];
  retouchAfterDays?: number;
  requiresEvaluation?: boolean;
  featured?: boolean;
  variants?: Array<[string, number, number]>; // nombre, minutos, soles
}

export const SERVICES: SeedService[] = [
  { slug: "microblading", name: "Microblading", category: "BROWS", description: "Pelo a pelo hiperrealista, diseñado según la arquitectura de tu rostro.", durationMin: 150, price: 690, bufferMin: 15, processing: [30, 20], retouchAfterDays: 40, featured: true },
  { slug: "microshading", name: "Microshading", category: "BROWS", description: "Efecto polvo suave y degradado, ideal para pieles mixtas y grasas.", durationMin: 150, price: 790, bufferMin: 15, processing: [30, 20], retouchAfterDays: 40, featured: true },
  { slug: "cejas-hibridas", name: "Cejas híbridas", category: "BROWS", description: "Pelo a pelo en el inicio y sombreado en la cola: lo mejor de ambas técnicas.", durationMin: 180, price: 890, bufferMin: 15, processing: [30, 20], retouchAfterDays: 40 },
  { slug: "laminado-cejas", name: "Laminado de cejas", category: "BROWS", description: "Cejas peinadas, con volumen y forma por 6 a 8 semanas.", durationMin: 60, price: 120, bufferMin: 10, processing: [15, 20] },
  { slug: "diseno-henna", name: "Diseño de cejas + henna", category: "BROWS", description: "Visagismo, depilación y henna para definir sin agujas.", durationMin: 45, price: 70, bufferMin: 5 },
  { slug: "lifting-pestanas", name: "Lifting de pestañas", category: "LASHES", description: "Curvatura natural desde la raíz con tinte incluido.", durationMin: 75, price: 140, bufferMin: 10, processing: [15, 25], featured: true },
  { slug: "extensiones", name: "Extensiones de pestañas", category: "LASHES", description: "Aplicación pelo a pelo con fibras de seda premium.", durationMin: 120, price: 190, bufferMin: 10, variants: [["Clásicas", 120, 190], ["Híbridas", 150, 230], ["Volumen ruso", 180, 270]] },
  { slug: "delineado", name: "Delineado permanente", category: "LASHES", description: "Línea de pestañas o delineado sutil que no se borra.", durationMin: 120, price: 650, bufferMin: 15, processing: [20, 20], retouchAfterDays: 40 },
  { slug: "lip-blush", name: "Lip blush", category: "LIPS", description: "Micropigmentación de labios: color, definición y simetría con acabado acuarela.", durationMin: 180, price: 890, bufferMin: 15, processing: [15, 25], retouchAfterDays: 45, featured: true },
  { slug: "neutralizacion-labios", name: "Neutralización de labios", category: "LIPS", description: "Corrige labios oscuros o pigmentados antes del color final.", durationMin: 180, price: 950, bufferMin: 15, processing: [15, 25], retouchAfterDays: 45, requiresEvaluation: true },
  { slug: "limpieza-profunda", name: "Limpieza facial profunda", category: "SKIN", description: "Extracción, peeling enzimático y mascarilla según tu tipo de piel.", durationMin: 75, price: 160, bufferMin: 10 },
  { slug: "hydrafacial", name: "Hydrafacial", category: "SKIN", description: "Limpieza, exfoliación e hidratación profunda en una sola sesión.", durationMin: 60, price: 290, bufferMin: 10, featured: true },
  { slug: "dermapen", name: "Dermapen", category: "SKIN", description: "Microagujas para textura, poros y marcas de acné.", durationMin: 75, price: 350, bufferMin: 15 },
  { slug: "bb-glow", name: "BB Glow", category: "SKIN", description: "Efecto piel de porcelana con pigmentos de cobertura semipermanente.", durationMin: 90, price: 320, bufferMin: 15 },
  { slug: "manicure-semi", name: "Manicure semipermanente", category: "NAILS", description: "Esmaltado en gel con 3 semanas de brillo.", durationMin: 60, price: 75, bufferMin: 5 },
  { slug: "unas-gel", name: "Uñas en gel / acrílicas", category: "NAILS", description: "Extensión y esculpido con diseño a elección.", durationMin: 120, price: 160, bufferMin: 10 },
  { slug: "pedicure-spa", name: "Pedicure spa", category: "NAILS", description: "Exfoliación, hidratación y esmaltado.", durationMin: 75, price: 95, bufferMin: 5 },
  { slug: "corte-brushing", name: "Corte y brushing", category: "HAIR", description: "Corte personalizado con lavado y brushing.", durationMin: 60, price: 90, bufferMin: 10, variants: [["Cabello corto", 60, 90], ["Cabello medio", 75, 110], ["Cabello largo", 90, 130]] },
  { slug: "balayage", name: "Balayage", category: "HAIR", description: "Iluminación a mano alzada con matizado y tratamiento.", durationMin: 210, price: 450, priceFrom: true, bufferMin: 15, processing: [60, 40] },
  { slug: "color-raiz", name: "Color de raíz", category: "HAIR", description: "Retoque de raíz con color libre de amoniaco.", durationMin: 120, price: 180, bufferMin: 10, processing: [30, 35] },
  { slug: "keratina", name: "Alisado con keratina", category: "HAIR", description: "Cabello liso, sin frizz y con brillo hasta por 4 meses.", durationMin: 180, price: 350, bufferMin: 15, variants: [["Cabello corto", 150, 350], ["Cabello medio", 180, 450], ["Cabello largo", 210, 550]] },
  { slug: "maquillaje-social", name: "Maquillaje social", category: "MAKEUP", description: "Maquillaje para eventos con pestañas incluidas.", durationMin: 60, price: 180, bufferMin: 10 },
  { slug: "peinado", name: "Peinado de evento", category: "MAKEUP", description: "Ondas, recogidos y semirecogidos.", durationMin: 60, price: 120, bufferMin: 10 },
];

/** Qué categorías ofrece cada sede. */
const BRANCH_CATEGORIES: Record<string, ServiceCategory[]> = {
  dasso: ["BROWS", "LASHES", "LIPS", "SKIN", "NAILS", "HAIR", "MAKEUP"],
  begonias: ["BROWS", "LASHES", "LIPS", "SKIN", "NAILS", "HAIR"],
  monterosa: ["BROWS", "LASHES", "LIPS", "SKIN", "NAILS", "HAIR", "MAKEUP"],
  cavenecia: ["BROWS", "LASHES", "LIPS", "NAILS", "SKIN"],
  viareal: ["BROWS", "LASHES", "NAILS"],
  compostela: ["BROWS", "LASHES", "LIPS", "NAILS"],
  yanahuara: ["BROWS", "LASHES", "LIPS", "SKIN", "NAILS"],
};

// ─── Especialistas ──────────────────────────────────────────────────────────
interface SeedStylist {
  slug: string;
  name: string;
  title: string;
  level: StylistLevel;
  bio: string;
  skills: string[];
  /** [sede, días (0-6), inicio, fin] — dos franjas por día = descanso. */
  shifts: Array<[string, number[], number, number]>;
  overrides?: Record<string, { price?: number; durationMin?: number }>;
}

const BROW_PMU = ["microblading", "microshading", "cejas-hibridas", "laminado-cejas", "diseno-henna"];
const LIP_PMU = ["lip-blush", "neutralizacion-labios"];
const LASH = ["lifting-pestanas", "extensiones", "laminado-cejas"];
const NAIL = ["manicure-semi", "unas-gel", "pedicure-spa"];
const SKIN = ["limpieza-profunda", "hydrafacial", "dermapen", "bb-glow"];
const HAIR = ["corte-brushing", "balayage", "color-raiz", "keratina", "peinado"];
const WEEK = [1, 2, 3, 4, 5, 6];

export const STYLISTS: SeedStylist[] = [
  { slug: "carla-mendoza", name: "Carla Mendoza", title: "Master en micropigmentación", level: "MASTER", bio: "Doce años diseñando cejas y labios. Formadora del método DP.", skills: [...BROW_PMU, ...LIP_PMU, "delineado"], overrides: { microblading: { price: 890 }, "lip-blush": { price: 1090 }, microshading: { price: 990 } },
    shifts: [["dasso", [1, 3, 5], h(10), h(14)], ["dasso", [1, 3, 5], h(15), h(19)], ["begonias", [2, 4], h(11), h(19)], ["monterosa", [6], h(9), h(15)]] },
  { slug: "valeria-quispe", name: "Valeria Quispe", title: "Especialista en cejas", level: "SENIOR", bio: "Microshading y cejas híbridas con acabado natural.", skills: [...BROW_PMU, "delineado"],
    shifts: [["dasso", [2, 4, 6], h(9), h(13)], ["dasso", [2, 4, 6], h(14), h(18)], ["cavenecia", [1, 3, 5], h(10), h(19)]] },
  { slug: "andrea-salazar", name: "Andrea Salazar", title: "Lash artist", level: "SENIOR", bio: "Volumen ruso y lifting con mirada de editorial.", skills: [...LASH, "diseno-henna"], overrides: { extensiones: { durationMin: 105 } },
    shifts: [["dasso", WEEK, h(10), h(14)], ["dasso", WEEK, h(15), h(20)], ["dasso", [0], h(11), h(16)]] },
  { slug: "fiorella-rojas", name: "Fiorella Rojas", title: "Cosmiatra", level: "SENIOR", bio: "Protocolos faciales a medida y tecnología de piel.", skills: SKIN,
    shifts: [["dasso", [1, 2, 3], h(10), h(19)], ["monterosa", [4, 5, 6], h(9), h(18)]] },
  { slug: "camila-huaman", name: "Camila Huamán", title: "Nail artist", level: "JUNIOR", bio: "Diseño de uñas minimalista y gel de larga duración.", skills: NAIL,
    shifts: [["dasso", WEEK, h(9), h(13)], ["dasso", WEEK, h(14), h(19)], ["dasso", [0], h(11), h(16)]] },
  { slug: "diego-ponce", name: "Diego Ponce", title: "Colorista", level: "MASTER", bio: "Balayage y color con técnicas de Buenos Aires y Madrid.", skills: HAIR, overrides: { balayage: { price: 590 } },
    shifts: [["dasso", [2, 4, 6], h(10), h(19)], ["monterosa", [1, 3, 5], h(10), h(19)]] },
  { slug: "daniela-torres", name: "Daniela Torres", title: "Especialista en labios", level: "SENIOR", bio: "Lip blush y neutralización para todo tono de piel.", skills: [...LIP_PMU, "microshading", "diseno-henna"],
    shifts: [["begonias", [1, 3, 5], h(10), h(19)], ["monterosa", [2, 4], h(10), h(19)]] },
  { slug: "lucia-vargas", name: "Lucía Vargas", title: "Lash & brow artist", level: "JUNIOR", bio: "Lifting, laminado y diseño express.", skills: [...LASH, "diseno-henna"],
    shifts: [["begonias", WEEK, h(9), h(13)], ["begonias", WEEK, h(14), h(18)]] },
  { slug: "mariana-chavez", name: "Mariana Chávez", title: "Nail artist", level: "SENIOR", bio: "Esculpido en gel y nail art.", skills: NAIL, overrides: { "unas-gel": { durationMin: 100 } },
    shifts: [["begonias", [1, 2, 3], h(10), h(19)], ["viareal", [4, 5, 6], h(9), h(18)]] },
  { slug: "ximena-paredes", name: "Ximena Paredes", title: "Estilista", level: "SENIOR", bio: "Cortes con movimiento, keratina y peinados.", skills: [...HAIR, "maquillaje-social"],
    shifts: [["begonias", [2, 4, 6], h(10), h(19)], ["monterosa", [1, 3, 5], h(10), h(19)]] },
  { slug: "alessandra-rios", name: "Alessandra Ríos", title: "Micropigmentadora", level: "SENIOR", bio: "Cejas, delineado y labios en Surco.", skills: [...BROW_PMU, "delineado", "lip-blush"],
    shifts: [["monterosa", [1, 2, 3, 4, 5], h(10), h(14)], ["monterosa", [1, 2, 3, 4, 5], h(15), h(19)], ["compostela", [6], h(9), h(15)]] },
  { slug: "nicole-castillo", name: "Nicole Castillo", title: "Lash & nails", level: "JUNIOR", bio: "Extensiones clásicas y manicure.", skills: [...LASH, ...NAIL],
    shifts: [["monterosa", WEEK, h(9), h(13)], ["monterosa", WEEK, h(14), h(18)]] },
  { slug: "gabriela-flores", name: "Gabriela Flores", title: "Micropigmentadora", level: "SENIOR", bio: "Especialista en pieles maduras y corrección de cejas.", skills: [...BROW_PMU, ...LIP_PMU],
    shifts: [["cavenecia", [2, 4, 6], h(10), h(19)], ["viareal", [1, 3, 5], h(9), h(17)]] },
  { slug: "renata-gutierrez", name: "Renata Gutiérrez", title: "Lash artist & cosmiatra", level: "SENIOR", bio: "Mirada y piel en una sola cita.", skills: [...LASH, "limpieza-profunda", "hydrafacial"],
    shifts: [["cavenecia", WEEK, h(10), h(14)], ["cavenecia", WEEK, h(15), h(19)]] },
  { slug: "sofia-ramirez", name: "Sofía Ramírez", title: "Brow & nail artist", level: "JUNIOR", bio: "Cejas express y uñas en Compostela.", skills: ["diseno-henna", "laminado-cejas", "lifting-pestanas", ...NAIL],
    shifts: [["compostela", WEEK, h(9), h(13)], ["compostela", WEEK, h(14), h(18)], ["viareal", [3], h(18), h(20)]] },
  { slug: "milagros-caceres", name: "Milagros Cáceres", title: "Master en micropigmentación", level: "MASTER", bio: "Referente de micropigmentación en el sur del país.", skills: [...BROW_PMU, ...LIP_PMU, "delineado"],
    shifts: [["yanahuara", WEEK, h(9), h(13)], ["yanahuara", WEEK, h(14), h(19)]] },
  { slug: "paola-zegarra", name: "Paola Zegarra", title: "Lash, skin & nails", level: "SENIOR", bio: "Pestañas, faciales y uñas en Arequipa.", skills: [...LASH, ...NAIL, "limpieza-profunda", "hydrafacial", "dermapen"],
    shifts: [["yanahuara", WEEK, h(10), h(19)], ["yanahuara", [0], h(10), h(15)]] },
];

const FIRST = ["María", "Lucía", "Valentina", "Camila", "Daniela", "Andrea", "Sofía", "Fernanda", "Alejandra", "Gabriela", "Nicole", "Paola", "Carolina", "Mariana", "Claudia", "Rosa", "Patricia", "Jimena", "Isabella", "Natalia", "Ana", "Milagros", "Romina", "Kiara", "Brenda", "Estefanía", "Pamela", "Lorena", "Diana", "Vanessa", "Javier", "Luis", "Carlos"];
const LAST = ["García", "Rodríguez", "Flores", "Quispe", "Sánchez", "Ramírez", "Torres", "Díaz", "Vargas", "Castillo", "Mendoza", "Rojas", "Chávez", "Gutiérrez", "Huamán", "Salazar", "Paredes", "Benavides", "Delgado", "Cáceres", "Zegarra", "Valdivia", "Herrera", "Montoya", "Aguilar", "Bustamante", "Ferreyra", "Salas"];

function slotsUsed(list: Array<[number, number]>, s: number, e: number) {
  return list.some(([a, b]) => s < b && a < e);
}

export async function seedDatabase(prisma: PrismaClient, opts: { now?: Date; password?: string } = {}) {
  const r = rng(20261024);
  const now = opts.now ?? new Date();
  const todayKey = localDateKey(now, TZ);

  // Sedes, horarios y cierres
  const branchIds: Record<string, string> = {};
  for (const [i, b] of BRANCHES.entries()) {
    const created = await prisma.branch.create({
      data: {
        id: `br_${b.slug}`,
        slug: b.slug, name: b.name, district: b.district, city: b.city, address: b.address, reference: b.reference,
        lat: b.lat, lng: b.lng, phone: b.phone, stations: b.stations, timezone: TZ, sortOrder: i,
        hours: {
          create: [
            ...WEEK.map((weekday) => ({ weekday, startMin: weekday === 6 ? h(9) : h(9), endMin: weekday === 6 ? h(18) : h(20) })),
            ...(b.sunday ? [{ weekday: 0, startMin: h(10), endMin: h(17) }] : []),
          ],
        },
      },
    });
    branchIds[b.slug] = created.id;
  }
  // Feriado de Todos los Santos (1 de noviembre) en todas las sedes y un cierre por mantenimiento.
  const year = Number(todayKey.slice(0, 4));
  for (const id of Object.values(branchIds)) {
    await prisma.branchClosure.create({
      data: { branchId: id, startsAt: wallToUtc(`${year}-11-01`, 0, TZ), endsAt: wallToUtc(`${year}-11-02`, 0, TZ), reason: "Feriado: Día de Todos los Santos" },
    });
  }
  await prisma.branchClosure.create({
    data: { branchId: branchIds.viareal!, startsAt: wallToUtc(addDaysKey(todayKey, 9), h(9), TZ), endsAt: wallToUtc(addDaysKey(todayKey, 9), h(14), TZ), reason: "Mantenimiento del centro empresarial" },
  });

  // Servicios + variantes
  const serviceIds: Record<string, string> = {};
  const serviceMeta: Record<string, SeedService> = {};
  for (const [i, s] of SERVICES.entries()) {
    const created = await prisma.service.create({
      data: {
        id: `svc_${s.slug}`,
        slug: s.slug, name: s.name, category: s.category, description: s.description, durationMin: s.durationMin,
        priceCents: s.price * 100, priceFrom: s.priceFrom ?? false, bufferMin: s.bufferMin ?? 0,
        processingOffsetMin: s.processing?.[0] ?? null, processingMin: s.processing?.[1] ?? null,
        retouchAfterDays: s.retouchAfterDays ?? null, requiresEvaluation: s.requiresEvaluation ?? false,
        featured: s.featured ?? false, sortOrder: i,
        variants: s.variants ? { create: s.variants.map(([name, durationMin, price], j) => ({ name, durationMin, priceCents: price * 100, sortOrder: j })) } : undefined,
      },
    });
    serviceIds[s.slug] = created.id;
    serviceMeta[s.slug] = s;
  }

  // Catálogo por sede con overrides: Arequipa ~10 % menos; Dasso (centro comercial) +5 % en uñas.
  for (const b of BRANCHES) {
    const cats = BRANCH_CATEGORIES[b.slug]!;
    await prisma.branchService.createMany({
      data: SERVICES.filter((s) => cats.includes(s.category) || (s.slug === "delineado" && cats.includes("LASHES"))).map((s) => ({
        branchId: branchIds[b.slug]!,
        serviceId: serviceIds[s.slug]!,
        priceCents: b.slug === "yanahuara" ? Math.round(s.price * 0.9) * 100 : b.slug === "dasso" && s.category === "NAILS" ? Math.round(s.price * 1.05) * 100 : null,
      })),
    });
  }

  // Especialistas
  const stylistIds: Record<string, string> = {};
  for (const st of STYLISTS) {
    const created = await prisma.stylist.create({
      data: {
        id: `sty_${st.slug}`,
        slug: st.slug, name: st.name, title: st.title, level: st.level, bio: st.bio,
        services: { create: st.skills.map((slug) => ({ serviceId: serviceIds[slug]!, priceCents: st.overrides?.[slug]?.price ? st.overrides[slug]!.price! * 100 : null, durationMin: st.overrides?.[slug]?.durationMin ?? null })) },
        schedules: { create: st.shifts.flatMap(([slug, days, startMin, endMin]) => days.map((weekday) => ({ branchId: branchIds[slug]!, weekday, startMin, endMin }))) },
      },
    });
    stylistIds[st.slug] = created.id;
  }
  await prisma.timeOff.createMany({
    data: [
      { stylistId: stylistIds["valeria-quispe"]!, kind: "VACATION", startsAt: wallToUtc(addDaysKey(todayKey, 5), 0, TZ), endsAt: wallToUtc(addDaysKey(todayKey, 8), 0, TZ), reason: "Vacaciones" },
      { stylistId: stylistIds["diego-ponce"]!, kind: "TRAINING", startsAt: wallToUtc(addDaysKey(todayKey, 3), h(9), TZ), endsAt: wallToUtc(addDaysKey(todayKey, 3), h(13), TZ), reason: "Capacitación de color" },
      { stylistId: stylistIds["carla-mendoza"]!, kind: "BLOCK", startsAt: wallToUtc(addDaysKey(todayKey, 1), h(13), TZ), endsAt: wallToUtc(addDaysKey(todayKey, 1), h(15), TZ), reason: "Sesión de fotos" },
    ],
  });

  // Clientas
  const customers: Array<{ id: string; phone: string; name: string }> = [];
  const usedPhones = new Set<string>();
  for (let i = 0; i < 520; i++) {
    let phone: string;
    do phone = `+519${String(Math.floor(r() * 1e8)).padStart(8, "0")}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    customers.push({ id: `cus_${i.toString(36).padStart(4, "0")}`, phone, name: `${pick(r, FIRST)} ${pick(r, LAST)}` });
  }
  const demoCustomerPhone = "+51999111222";
  customers[0] = { ...customers[0]!, phone: demoCustomerPhone, name: "Lucía Benavides" };
  await prisma.customer.createMany({
    data: customers.map((c, i) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      email: i % 3 === 0 ? `${c.name.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}${i}@correo.pe` : null,
      marketingOptIn: r() < 0.6,
      tags: i === 0 ? ["VIP", "Retoque pendiente"] : r() < 0.08 ? ["VIP"] : r() < 0.05 ? ["Piel sensible"] : [],
      allergies: r() < 0.06 ? pick(r, ["Látex", "Lidocaína (usar anestésico alternativo)", "Níquel", "PPD (tintes)"]) : null,
      skinType: r() < 0.5 ? pick(r, ["Seca", "Mixta", "Grasa", "Sensible", "Normal"]) : null,
      createdAt: new Date(now.getTime() - Math.floor(r() * 400) * 86_400_000),
    })),
  });

  // Reservas: 90 días atrás y 14 adelante, sin solapes por especialista ni por camilla.
  const busy = new Map<string, Array<[number, number]>>(); // stylist → intervalos ms
  const stationLoad = new Map<string, Array<[number, number]>>(); // branch → intervalos
  const bookings: Array<{ id: string; code: string; customerId: string; branchId: string; status: BookingStatus; channel: BookingChannel; startsAt: Date; endsAt: Date; totalCents: number; createdAt: Date; confirmedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; cancelReason: string | null }> = [];
  const items: Array<{ bookingId: string; serviceId: string; variantId: null; stylistId: string; position: number; startsAt: Date; endsAt: Date; busyUntil: Date; processingStart: Date | null; processingEnd: Date | null; durationMin: number; priceCents: number }> = [];
  const usedCodes = new Set<string>();
  const noShows = new Map<string, number>();
  const regulars = customers.slice(0, 160);
  // Solo una minoría de clientas falta a sus citas (para que los avisos de no-show sean significativos).
  const flaky = new Set(customers.filter((_, i) => i % 11 === 7).map((c) => c.id));
  let n = 0;

  for (let d = -90; d <= 14; d++) {
    const key = addDaysKey(todayKey, d);
    const wd = weekdayOf(key);
    if (key.endsWith("-11-01")) continue;
    for (const st of STYLISTS) {
      for (const [branchSlug, days, startMin, endMin] of st.shifts) {
        if (!days.includes(wd)) continue;
        const branch = BRANCHES.find((b) => b.slug === branchSlug)!;
        const fillRate = d > 0 ? 0.55 - d * 0.025 : 0.72;
        let cursor = startMin + (r() < 0.5 ? 0 : 30);
        while (cursor < endMin - 45) {
          const slug = pick(r, st.skills.filter((s) => BRANCH_CATEGORIES[branchSlug]!.includes(serviceMeta[s]!.category) || s === "delineado"));
          const svc = serviceMeta[slug]!;
          const dur = st.overrides?.[slug]?.durationMin ?? svc.durationMin;
          const buffer = svc.bufferMin ?? 0;
          if (cursor + dur > endMin) break;
          if (r() > fillRate) {
            cursor += pick(r, [30, 45, 60]);
            continue;
          }
          const start = wallToUtc(key, cursor, TZ).getTime();
          const end = start + dur * 60_000;
          const until = end + buffer * 60_000;
          const sBusy = busy.get(st.slug) ?? [];
          const bLoad = stationLoad.get(branchSlug) ?? [];
          const concurrent = bLoad.filter(([a, b]) => start < b && a < until).length;
          if (slotsUsed(sBusy, start, until) || concurrent >= branch.stations) {
            cursor += 30;
            continue;
          }
          sBusy.push([start, until]);
          busy.set(st.slug, sBusy);
          bLoad.push([start, until]);
          stationLoad.set(branchSlug, bLoad);

          const customer = r() < 0.7 ? pick(r, regulars) : pick(r, customers);
          const isPast = end < now.getTime();
          const roll = r();
          const status: BookingStatus = isPast
            ? roll < 0.86 ? "COMPLETED" : roll < 0.93 ? "CANCELLED" : flaky.has(customer.id) && roll < 0.97 ? "NO_SHOW" : "COMPLETED"
            : start < now.getTime() ? "IN_PROGRESS" : roll < 0.88 ? "CONFIRMED" : roll < 0.95 ? "PENDING" : "CANCELLED";
          const cr = r();
          const channel: BookingChannel = cr < 0.56 ? "WHATSAPP" : cr < 0.68 ? "WEB" : cr < 0.8 ? "PHONE" : cr < 0.9 ? "DASHBOARD" : "WALK_IN";
          const basePrice = st.overrides?.[slug]?.price ?? svc.price;
          const price = Math.round((branchSlug === "yanahuara" ? basePrice * 0.9 : basePrice)) * 100;
          let code: string;
          do code = `DP-${Math.floor(r() * 36 ** 5).toString(36).toUpperCase().padStart(5, "2").replace(/[01OI]/g, "7")}`;
          while (usedCodes.has(code));
          usedCodes.add(code);
          const id = `bk_${(n++).toString(36).padStart(5, "0")}`;
          const createdAt = new Date(start - (1 + Math.floor(r() * 12)) * 86_400_000);
          if (status === "NO_SHOW") noShows.set(customer.id, (noShows.get(customer.id) ?? 0) + 1);
          bookings.push({
            id, code, customerId: customer.id, branchId: branchIds[branchSlug]!, status, channel,
            startsAt: new Date(start), endsAt: new Date(end), totalCents: price, createdAt,
            confirmedAt: status === "PENDING" ? null : createdAt,
            completedAt: status === "COMPLETED" ? new Date(end) : null,
            cancelledAt: status === "CANCELLED" ? new Date(start - 86_400_000) : null,
            cancelReason: status === "CANCELLED" ? pick(r, ["Viaje", "Se sintió mal", "Cambio de planes", "Trabajo"]) : null,
          });
          items.push({
            bookingId: id, serviceId: serviceIds[slug]!, variantId: null, stylistId: stylistIds[st.slug]!, position: 0,
            startsAt: new Date(start), endsAt: new Date(end), busyUntil: new Date(until),
            processingStart: svc.processing && svc.processing[0] + svc.processing[1] < dur ? new Date(start + svc.processing[0] * 60_000) : null,
            processingEnd: svc.processing && svc.processing[0] + svc.processing[1] < dur ? new Date(start + (svc.processing[0] + svc.processing[1]) * 60_000) : null,
            durationMin: dur, priceCents: price,
          });
          // Las canceladas liberan el hueco.
          if (status === "CANCELLED") {
            sBusy.pop();
            bLoad.pop();
          }
          cursor += dur + buffer + (r() < 0.4 ? 15 : 0);
        }
      }
    }
  }
  for (let i = 0; i < bookings.length; i += 1000) await prisma.booking.createMany({ data: bookings.slice(i, i + 1000) });
  for (let i = 0; i < items.length; i += 1000) await prisma.bookingItem.createMany({ data: items.slice(i, i + 1000) });
  for (const [customerId, count] of noShows) await prisma.customer.update({ where: { id: customerId }, data: { noShowCount: count } });

  // Preferencias de la clienta demo + ficha técnica
  await prisma.customer.update({
    where: { id: customers[0]!.id },
    data: { preferredBranchId: branchIds.dasso, preferredStylistId: stylistIds["carla-mendoza"], skinType: "Mixta", allergies: null, notes: "Prefiere citas a primera hora. Le gusta un arco suave." },
  });
  await prisma.technicalNote.createMany({
    data: [
      { customerId: customers[0]!.id, stylistId: stylistIds["carla-mendoza"]!, title: "Microblading — sesión inicial", formula: "Pigmento Perma Blend 'Fudgesicle' 70 % + 'Mocha' 30 %. Aguja 18U 0.18 mm.", body: "Piel mixta, buena retención esperada. Arco levantado 2 mm.", createdAt: new Date(now.getTime() - 50 * 86_400_000) },
      { customerId: customers[0]!.id, stylistId: stylistIds["carla-mendoza"]!, title: "Retoque a los 40 días", formula: "Mismo pigmento, +10 % 'Mocha' en la cola.", body: "Retención 85 %. Reforzar cola izquierda.", createdAt: new Date(now.getTime() - 10 * 86_400_000) },
    ],
  });

  // Lista de espera
  await prisma.waitlistEntry.create({
    data: { customerId: customers[5]!.id, branchId: branchIds.dasso!, serviceIds: [serviceIds["lip-blush"]!], stylistId: stylistIds["carla-mendoza"]!, dateFrom: now, dateTo: new Date(now.getTime() + 10 * 86_400_000), notes: "Solo mañanas" },
  });

  // Conversaciones de ejemplo
  const convo = async (customerIdx: number, branchSlug: string, status: "BOT" | "HUMAN", unread: number, lines: Array<[("CUSTOMER" | "BOT" | "STAFF"), string, number]>) => {
    const c = customers[customerIdx]!;
    const last = lines[lines.length - 1]!;
    await prisma.conversation.create({
      data: {
        phone: c.phone, customerId: c.id, branchId: branchIds[branchSlug], status, aiPaused: status === "HUMAN", unreadCount: unread,
        lastMessageAt: new Date(now.getTime() - last[2] * 60_000),
        lastInboundAt: new Date(now.getTime() - Math.min(...lines.filter((l) => l[0] === "CUSTOMER").map((l) => l[2])) * 60_000),
        messages: {
          create: lines.map(([author, body, minsAgo]) => ({
            direction: author === "CUSTOMER" ? "IN" : "OUT", author, body, createdAt: new Date(now.getTime() - minsAgo * 60_000),
          })),
        },
      },
    });
  };
  await convo(0, "dasso", "BOT", 0, [
    ["CUSTOMER", "Hola! Quería agendar mi retoque de cejas 💞", 95],
    ["BOT", "¡Hola, Lucía! ✨ Qué gusto saludarte otra vez. ¿Lo agendamos con Carla en Dasso, como tu sesión anterior?", 94],
    ["CUSTOMER", "Sí, con Carla porfa. Jueves en la mañana?", 92],
    ["BOT", "Carla tiene libre el jueves a las 10:00, 10:30 y 11:15. ¿Cuál prefieres?", 91],
    ["CUSTOMER", "10:30 perfecto", 90],
    ["BOT", "Listo ✨ Tu cita quedó confirmada: Microblading (retoque) con Carla en Dasso, jueves 10:30. Código DP-7KQ4M. Te recordaremos un día antes.", 89],
  ]);
  await convo(12, "begonias", "HUMAN", 2, [
    ["CUSTOMER", "Buenas, tengo alergia a la lidocaína, ¿igual puedo hacerme lip blush?", 40],
    ["BOT", "Gracias por avisarnos 🙏 Es un tema importante: te comunico con una especialista para evaluarlo contigo.", 39],
    ["STAFF", "Hola, soy Daniela. Sí trabajamos con anestésico alternativo; te pedimos una evaluación previa de 15 min. ¿Te queda bien el miércoles?", 30],
    ["CUSTOMER", "Sí! A qué hora?", 12],
    ["CUSTOMER", "Y cuánto cuesta la evaluación?", 11],
  ]);
  await convo(27, "monterosa", "BOT", 1, [
    ["CUSTOMER", "Hola, precio de extensiones de pestañas en Surco?", 8],
  ]);
  await convo(44, "yanahuara", "BOT", 0, [
    ["CUSTOMER", "Hola, están en Arequipa?", 300],
    ["BOT", "¡Sí! Te esperamos en Yanahuara, Francisco Bolognesi 108 ✨ ¿Qué servicio te interesa?", 299],
    ["CUSTOMER", "Microblading", 298],
    ["BOT", "El microblading en Yanahuara cuesta S/ 621 e incluye retoque a los 40 días. Milagros tiene espacio el sábado a las 9:00 o a las 14:00. ¿Te reservo alguno?", 297],
  ]);

  // Usuarios del dashboard
  const passwordHash = await bcrypt.hash(opts.password ?? "demo1234", 10);
  const users: Array<{ email: string; name: string; role: "OWNER" | "ADMIN" | "BRANCH_MANAGER" | "RECEPTION" | "STYLIST"; branches?: string[]; stylist?: string }> = [
    { email: "owner@domenicapadilla.pe", name: "Dirección general", role: "OWNER" },
    { email: "admin@domenicapadilla.pe", name: "Administración", role: "ADMIN" },
    { email: "sanisidro@domenicapadilla.pe", name: "Gerencia San Isidro", role: "BRANCH_MANAGER", branches: ["dasso", "begonias"] },
    { email: "arequipa@domenicapadilla.pe", name: "Gerencia Arequipa", role: "BRANCH_MANAGER", branches: ["yanahuara"] },
    { email: "recepcion.dasso@domenicapadilla.pe", name: "Recepción Dasso", role: "RECEPTION", branches: ["dasso"] },
    { email: "carla@domenicapadilla.pe", name: "Carla Mendoza", role: "STYLIST", stylist: "carla-mendoza" },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: `usr_${u.email.split("@")[0]!.replace(/[^a-z0-9]/g, "")}`,
        email: u.email, name: u.name, role: u.role, passwordHash,
        stylistId: u.stylist ? stylistIds[u.stylist] : null,
        branches: u.branches ? { create: u.branches.map((slug) => ({ branchId: branchIds[slug]! })) } : undefined,
      },
    });
  }

  return { bookings: bookings.length, customers: customers.length };
}
