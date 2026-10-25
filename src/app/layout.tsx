import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap" });
const sans = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Doménica Padilla — All types of beauty", template: "%s · Doménica Padilla" },
  description: "Expertos en micropigmentación. Brows, lashes, skin, nails & hair en 7 sedes en Lima y Arequipa. Reserva por WhatsApp.",
  openGraph: { title: "Doménica Padilla — All types of beauty", description: "Expertos en micropigmentación. Reserva en tu sede por WhatsApp.", locale: "es_PE", type: "website" },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-PE" className={`${display.variable} ${sans.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
