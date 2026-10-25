import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // El panel depende de la sesión en cada request; solo validamos navegación instantánea donde se pida con `instant`.
  experimental: { instantInsights: { validationLevel: "manual-warning" } },
  // PGlite carga su WASM desde disco: no debe empaquetarse.
  // Fotografía editorial servida desde Unsplash (licencia Unsplash) y optimizada por next/image.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }],
    qualities: [60, 75, 85],
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
  // Las migraciones se leen en tiempo de ejecución en modo demo.
  outputFileTracingIncludes: { "/**": ["./prisma/migrations/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
