import { NextResponse, type NextRequest } from "next/server";

/**
 * Chequeo optimista: si no hay cookie de sesión, redirige al login.
 * La autorización real (firma, rol, sede) se valida en el servidor en cada página y acción.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("dp_session");
  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
