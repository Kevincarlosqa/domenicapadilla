import { LogoMark } from "@/components/brand/logo";
import { BeforeAfter } from "@/components/site/before-after";
import { BookingWidget } from "@/components/site/booking-widget";
import { Branches } from "@/components/site/branches";
import { ChatDemo } from "@/components/site/chat-demo";
import { Editorial } from "@/components/site/editorial";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/site/hero";
import { waLink } from "@/components/site/icons";
import { Cursor, RevealLines, SmoothScroll, Strands, VelocityMarquee } from "@/components/site/motion-kit";
import { Nav } from "@/components/site/nav";
import { Philosophy } from "@/components/site/philosophy";
import { Preloader } from "@/components/site/preloader";
import { Services } from "@/components/site/services";
import { Team } from "@/components/site/team";
import { Testimonials } from "@/components/site/testimonials";
import { DEMO_TESTIMONIALS, TESTIMONIALS } from "@/content/testimonials";
import { config } from "@/lib/config";
import { getLandingData } from "@/lib/landing";

export default async function Home() {
  const data = await getLandingData();
  const mainWhatsapp = waLink(config.WHATSAPP_PUBLIC_NUMBER);
  const testimonials = TESTIMONIALS.length ? TESTIMONIALS : config.demoMode ? DEMO_TESTIMONIALS : [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    name: "Doménica Padilla",
    slogan: "All types of beauty",
    description: "Expertos en micropigmentación. Brows, lashes, skin, nails & hair.",
    url: config.APP_URL,
    department: data.branches.map((b) => ({
      "@type": "BeautySalon",
      name: `Doménica Padilla ${b.name}`,
      telephone: b.phone,
      address: { "@type": "PostalAddress", streetAddress: b.address, addressLocality: b.district, addressRegion: b.city, addressCountry: "PE" },
      geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng },
    })),
  };

  return (
    <SmoothScroll>
      <Preloader />
      <Cursor />
      <Nav whatsappHref={mainWhatsapp} />
      <main id="contenido">
        <Hero whatsappHref={mainWhatsapp} branchCount={data.branches.length} />

        <div className="border-y border-ink/10 py-6 md:py-8" aria-hidden>
          <VelocityMarquee baseVelocity={-3}>
            {["Brows", "Lashes", "Lips", "Skin", "Nails", "Hair"].map((w) => (
              <span key={w} className="flex items-center gap-8 pr-8 font-display text-6xl md:text-8xl">
                <span className={w === "Lips" || w === "Nails" ? "italic text-rose" : ""}>{w}</span>
                <LogoMark className="h-10 w-10 md:h-14 md:w-14" title="" />
              </span>
            ))}
          </VelocityMarquee>
        </div>

        <Services services={data.services} branches={data.branches} whatsappNumber={config.WHATSAPP_PUBLIC_NUMBER} />
        <Editorial />
        <Strands />
        <Philosophy
          stats={{
            branches: data.branches.length,
            stylists: data.stylists.length,
            services: data.services.length,
            cities: new Set(data.branches.map((b) => b.city)).size,
          }}
        />
        <BeforeAfter />
        <Team stylists={data.stylists} />
        <Branches branches={data.branches} />
        <ChatDemo whatsappHref={mainWhatsapp} />
        <Testimonials items={testimonials} />
        <Strands flip />

        <section id="reservar" aria-labelledby="reservar-title" className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-4 pt-12 pb-28 md:px-10 lg:grid-cols-[1fr_1.25fr] lg:gap-12 [&>*]:min-w-0">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-muted uppercase">(09) Reserva</p>
            <h2 id="reservar-title" className="sr-only">
              Reserva tu cita
            </h2>
            <RevealLines lines={["Reserva tu cita", <em key="e" className="text-rose">en tiempo real</em>]} className="font-display text-[clamp(2.4rem,4.4vw,4.6rem)] leading-[0.95]" />
            <p className="mt-6 max-w-md text-ink-soft">Los horarios que ves son los reales de cada especialista. Si prefieres, escríbenos por WhatsApp y Domi te ayuda al instante, a cualquier hora.</p>
          </div>
          <BookingWidget branches={data.branches} />
        </section>
      </main>
      <Footer branches={data.branches} year={data.year} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </SmoothScroll>
  );
}
