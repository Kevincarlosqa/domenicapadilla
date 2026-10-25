"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

const ROSE = "#0a0a0a";
const INK_MUTED = "#5f5f5c";
const GRID = "#ebebe8";

const money = (v: number) => `S/ ${Math.round(v).toLocaleString("es-PE")}`;
const shortDate = (k: string) => {
  const [, m, d] = k.split("-");
  return `${Number(d)}/${Number(m)}`;
};

function TipBox({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-muted">
          <span>{k}</span>
          <span className="font-medium text-ink tabular-nums">{v}</span>
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: Array<{ date: string; revenue: number; bookings: number }> }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Ingresos diarios del periodo">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ROSE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={ROSE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ stroke: "#0a0a0a", strokeOpacity: 0.25 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { date: string; revenue: number; bookings: number } | undefined;
              return active && p ? <TipBox title={shortDate(p.date)} rows={[["Ingresos", money(p.revenue)], ["Reservas", String(p.bookings)]]} /> : null;
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke={ROSE} strokeWidth={2} fill="url(#rev)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#fffdfa" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, valueLabel, format = "money" }: { data: Array<{ name: string; value: number; extra?: string }>; valueLabel: string; format?: "money" | "count" }) {
  const fmt = format === "money" ? money : (v: number) => String(v);
  return (
    <div className="w-full" style={{ height: Math.max(120, data.length * 34 + 16) }} role="img" aria-label={valueLabel}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={128} tick={{ fill: "#2b2b2b", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "#ececea", opacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { name: string; value: number; extra?: string } | undefined;
              return active && p ? <TipBox title={p.name} rows={[[valueLabel, fmt(p.value)], ...(p.extra ? [["Detalle", p.extra] as [string, string]] : [])]} /> : null;
            }}
          />
          <Bar dataKey="value" fill={ROSE} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fill: "#2b2b2b", fontSize: 11, formatter: (v: unknown) => fmt(Number(v)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Mapa de calor secuencial (un solo tono, de claro a oscuro). */
export function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  const shades = ["#ededeb", "#d4d4d1", "#b0b0ac", "#85857f", "#4d4d4a", "#0a0a0a"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-[11px]">
        <caption className="sr-only">Reservas por día de la semana y hora de inicio</caption>
        <thead>
          <tr>
            <th className="w-10" />
            {data[0]!.map((_, i) => (
              <th key={i} scope="col" className="font-normal text-muted">
                {i + 8}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((wd) => (
            <tr key={wd}>
              <th scope="row" className="pr-1 text-left font-medium text-ink-soft">
                {DAYS[wd]}
              </th>
              {data[wd]!.map((v, h) => {
                const idx = v === 0 ? -1 : Math.min(shades.length - 1, Math.floor((v / max) * shades.length));
                return (
                  <td
                    key={h}
                    title={`${DAYS[wd]} ${h + 8}:00 — ${v} reservas`}
                    className={cn("h-7 rounded-[4px] text-center tabular-nums", idx >= 4 ? "text-white" : "text-ink-soft")}
                    style={{ background: idx < 0 ? "#f5f5f3" : shades[idx] }}
                  >
                    {v > 0 && v / max > 0.6 ? v : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        Menos
        {shades.map((s) => (
          <span key={s} className="h-2.5 w-4 rounded-sm" style={{ background: s }} />
        ))}
        Más
      </div>
    </div>
  );
}
