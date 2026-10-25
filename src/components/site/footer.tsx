import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import type { LandingData } from "@/lib/landing";
import { waLink } from "./icons";

export function Footer({ branches, year }: Pick<LandingData, "branches" | "year">) {
  return (
    <footer className="relative overflow-hidden bg-ink text-ivory">
      <div className="mx-auto max-w-[1440px] px-4 pt-24 pb-10 md:px-10">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <p className="font-display text-5xl leading-none md:text-6xl">
              All types
              <br />
              of <em className="text-blush">beauty</em>*
            </p>
            <p className="mt-6 max-w-sm text-sm text-ivory/60">Expertos en micropigmentación · Brows · Lashes · Skin · Nails · Hair. Una nueva filosofía desarrollada por @domenikpm.</p>
          </div>
          <nav aria-label="Sedes">
            <p className="mb-4 text-xs font-semibold tracking-[0.25em] text-ivory/50 uppercase">Sedes · WhatsApp</p>
            <ul className="space-y-2 text-sm">
              {branches.map((b) => (
                <li key={b.id}>
                  <a href={waLink(b.phone)} target="_blank" rel="noopener noreferrer" className="group flex justify-between gap-4 hover:text-blush">
                    <span>{b.name}</span>
                    <span className="text-ivory/50 group-hover:text-blush">{b.address}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Enlaces">
            <p className="mb-4 text-xs font-semibold tracking-[0.25em] text-ivory/50 uppercase">Explora</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#servicios" className="hover:text-blush">
                  Servicios y precios
                </a>
              </li>
              <li>
                <a href="#equipo" className="hover:text-blush">
                  Equipo
                </a>
              </li>
              <li>
                <a href="#reservar" className="hover:text-blush">
                  Reservar online
                </a>
              </li>
              <li>
                <Link href="/login" className="hover:text-blush">
                  Acceso del equipo
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-20 flex items-end justify-between gap-6 border-t border-ivory/15 pt-6 text-xs text-ivory/50">
          <p>© {year} Doménica Padilla. Todos los derechos reservados.</p>
          <p>Lima · Arequipa</p>
        </div>
      </div>
      <svg viewBox="0 0 1000 190" className="pointer-events-none mb-[-2vw] block w-full" aria-hidden>
        <text x="500" y="180" textAnchor="middle" fill="currentColor" className="font-display text-ivory/6" style={{ fontSize: 250, letterSpacing: "-0.04em" }}>
          Doménica
        </text>
      </svg>
      <LogoMark className="absolute top-16 right-6 h-16 w-16 animate-spin-slow text-ivory/80 md:right-10" title="" />
    </footer>
  );
}
