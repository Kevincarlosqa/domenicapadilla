import { describe, expect, it } from "vitest";
import { slotsForDate, type EngineInput, type EngineItem, type EngineStylist } from "@/lib/availability-engine";
import { wallToUtc } from "@/lib/time";

const LIMA = "America/Lima";
const DAY = "2026-11-05"; // jueves
const WD = 4;
const h = (x: number, m = 0) => x * 60 + m;
const at = (hh: number, mm = 0, tz = LIMA, day = DAY) => wallToUtc(day, h(hh, mm), tz).getTime();

function stylist(id: string, over: Partial<EngineStylist> = {}): EngineStylist {
  return {
    id,
    name: id,
    level: "SENIOR",
    skills: new Map([["brows", {}], ["lash", {}], ["color", {}], ["nails", {}]]),
    schedules: [{ weekday: WD, startMin: h(9), endMin: h(18) }],
    timeOff: [],
    busy: [],
    ...over,
  };
}

const brows: EngineItem = { serviceId: "brows", name: "Microblading", durationMin: 120, priceCents: 69000, bufferMin: 15 };
const lash: EngineItem = { serviceId: "lash", name: "Lifting", durationMin: 60, priceCents: 14000, bufferMin: 10 };
const nails: EngineItem = { serviceId: "nails", name: "Manicure", durationMin: 60, priceCents: 7500, bufferMin: 0 };

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    branch: { id: "b1", timezone: LIMA, stations: 4, slotIntervalMin: 30, minLeadMinutes: 60, maxDaysAhead: 60 },
    hours: [{ weekday: WD, startMin: h(9), endMin: h(20) }],
    closures: [],
    stylists: [stylist("ana")],
    stationUsage: [],
    items: [brows],
    now: at(6, 0, LIMA, "2026-11-04"),
    ...over,
  };
}

const times = (slots: { start: number }[], tz = LIMA) =>
  slots.map((s) => new Intl.DateTimeFormat("es-PE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(s.start));

describe("motor de disponibilidad", () => {
  it("respeta el horario de la especialista con el buffer incluido", () => {
    const t = times(slotsForDate(input(), DAY));
    // 120 min + 15 de buffer deben caber antes de las 18:00 → último inicio 15:30 (termina 17:45)
    expect(t[0]).toBe("09:00");
    expect(t.at(-1)).toBe("15:30");
  });

  it("cambio de día: las 19:30 en Lima son las 00:30 UTC del día siguiente y siguen siendo del mismo día local", () => {
    const late = input({
      items: [nails],
      stylists: [stylist("ana", { schedules: [{ weekday: WD, startMin: h(18), endMin: h(21) }] })],
      hours: [{ weekday: WD, startMin: h(9), endMin: h(21) }],
    });
    const s1930 = slotsForDate(late, DAY).find((s) => times([s])[0] === "19:30");
    expect(s1930).toBeDefined();
    expect(new Date(s1930!.start).toISOString()).toBe("2026-11-06T00:30:00.000Z");
    // El viernes (el día UTC) no tiene horario: no debe haber slots.
    expect(slotsForDate(late, "2026-11-06")).toHaveLength(0);
  });

  it("zona horaria con horario de verano: Madrid pasa a CET el 25-10-2026", () => {
    const tz = "Europe/Madrid";
    const day = "2026-10-25"; // domingo del cambio de hora
    const inp = input({
      branch: { id: "b2", timezone: tz, stations: 2, slotIntervalMin: 60, minLeadMinutes: 0, maxDaysAhead: 60 },
      hours: [{ weekday: 0, startMin: h(9), endMin: h(13) }],
      stylists: [stylist("eva", { schedules: [{ weekday: 0, startMin: h(9), endMin: h(13) }] })],
      items: [nails],
      now: wallToUtc("2026-10-20", 0, tz).getTime(),
    });
    const slots = slotsForDate(inp, day);
    expect(times(slots, tz)).toEqual(["09:00", "10:00", "11:00", "12:00"]);
    expect(new Date(slots[0]!.start).toISOString()).toBe("2026-10-25T08:00:00.000Z"); // UTC+1 tras el cambio
  });

  it("una especialista ocupada en otra sede no aparece libre aquí", () => {
    const inp = input({ stylists: [stylist("ana", { busy: [{ start: at(10), end: at(13) }] })] });
    const t = times(slotsForDate(inp, DAY));
    expect(t).not.toContain("09:00"); // 9:00 + 2 h 15 choca con las 10:00
    expect(t).not.toContain("12:30");
    expect(t).toContain("13:00");
  });

  it("multiservicio encadenado con dos especialistas distintas", () => {
    const inp = input({
      items: [brows, { ...lash, stylistId: "bea" }],
      stylists: [stylist("ana", { skills: new Map([["brows", {}]]) }), stylist("bea", { skills: new Map([["lash", {}]]) })],
    });
    const slot = slotsForDate(inp, DAY)[0]!;
    expect(slot.items.map((i) => i.stylistId)).toEqual(["ana", "bea"]);
    expect(slot.items[1]!.start).toBe(slot.items[0]!.end); // la clienta no espera
    expect(slot.totalCents).toBe(83000);
  });

  it("multiservicio con la misma especialista omite el buffer intermedio", () => {
    const slot = slotsForDate(input({ items: [brows, lash] }), DAY)[0]!;
    expect(slot.items[0]!.busyUntil).toBe(slot.items[0]!.end);
    expect(slot.items[1]!.busyUntil - slot.items[1]!.end).toBe(10 * 60_000);
  });

  it("aprovecha la ventana de processing de otra cita", () => {
    // Ana ocupada 9:00-9:30 y 10:30-11:00 (el color actúa de 9:30 a 10:30)
    const inp = input({
      items: [nails],
      stylists: [stylist("ana", { busy: [{ start: at(9), end: at(9, 30) }, { start: at(10, 30), end: at(11) }] })],
    });
    const t = times(slotsForDate(inp, DAY));
    expect(t).toContain("09:30");
    expect(t).not.toContain("10:00"); // 60 min desde las 10:00 chocaría a las 10:30

    const color: EngineItem = { serviceId: "color", name: "Color", durationMin: 120, priceCents: 18000, bufferMin: 0, processingOffsetMin: 30, processingMin: 60 };
    const s = slotsForDate(input({ items: [color] }), DAY)[0]!;
    expect(s.items[0]!.processingEnd! - s.items[0]!.processingStart!).toBe(60 * 60_000);
  });

  it("respeta la capacidad de camillas de la sede", () => {
    const inp = input({
      items: [nails],
      branch: { id: "b1", timezone: LIMA, stations: 1, slotIntervalMin: 60, minLeadMinutes: 0, maxDaysAhead: 60 },
      stylists: [stylist("ana"), stylist("bea")],
      stationUsage: [{ start: at(9), end: at(12) }],
    });
    const t = times(slotsForDate(inp, DAY));
    expect(t).not.toContain("10:00");
    expect(t).toContain("12:00");
  });

  it("no ofrece horarios en un cierre ni dentro de la anticipación mínima", () => {
    expect(slotsForDate(input({ closures: [{ start: at(0), end: at(23, 59) }] }), DAY)).toHaveLength(0);
    const soon = input({ now: at(9, 10), items: [nails] });
    expect(times(slotsForDate(soon, DAY))[0]).toBe("10:30"); // 9:10 + 60 min → siguiente múltiplo de 30
  });

  it("las ausencias bloquean la agenda", () => {
    const inp = input({ items: [nails], stylists: [stylist("ana", { timeOff: [{ start: at(9), end: at(14) }] })] });
    expect(times(slotsForDate(inp, DAY))[0]).toBe("14:00");
  });

  it("cualquier especialista: elige la que deja menos hueco muerto", () => {
    const inp = input({
      items: [nails],
      stylists: [stylist("ana", { busy: [{ start: at(9), end: at(12) }] }), stylist("bea", { busy: [{ start: at(9), end: at(10) }] })],
    });
    const slots = slotsForDate(inp, DAY);
    expect(slots.find((s) => times([s])[0] === "12:00")!.items[0]!.stylistId).toBe("ana"); // Ana termina justo a las 12:00
    expect(slots.find((s) => times([s])[0] === "10:00")!.items[0]!.stylistId).toBe("bea");
  });

  it("no asigna a una especialista sin la habilidad", () => {
    const inp = input({ items: [{ ...lash, stylistId: "ana" }], stylists: [stylist("ana", { skills: new Map([["brows", {}]]) })] });
    expect(slotsForDate(inp, DAY)).toHaveLength(0);
  });

  it("usa la duración y el precio propios de la especialista", () => {
    const inp = input({ stylists: [stylist("ana", { skills: new Map([["brows", { durationMin: 90, priceCents: 89000 }]]) })] });
    const s = slotsForDate(inp, DAY)[0]!;
    expect(s.end - s.start).toBe(90 * 60_000);
    expect(s.totalCents).toBe(89000);
  });
});
