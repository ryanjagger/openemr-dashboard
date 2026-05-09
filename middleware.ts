import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { proxyToOpenEMR } from "@/lib/proxy";

export const runtime = "nodejs";

// Paths owned by the Next.js app — never proxied.
const APP_ROUTES = new Set([
  "/",
  "/launch",
  "/login",
  "/callback",
  "/logout",
  "/favicon.ico",
]);

const APP_PREFIXES = ["/api/", "/patient/", "/embed/"];

function isAppOwned(pathname: string): boolean {
  if (APP_ROUTES.has(pathname)) return true;
  return APP_PREFIXES.some((p) => pathname.startsWith(p));
}

async function gateOrPass(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const session = await getSession();
  log.debug(
    { pathname, hasToken: Boolean(session.accessToken), userId: session.userId },
    "middleware.gate",
  );
  if (!session.accessToken) {
    const loginUrl = new URL("/login", publicEnv().NEXT_PUBLIC_APP_URL);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Authed app routes (the dashboard).
  if (pathname.startsWith("/patient/")) return gateOrPass(req);
  if (pathname.startsWith("/embed/patient/")) return gateOrPass(req);

  // Other app-owned routes pass through to Next.js.
  if (isAppOwned(pathname)) return NextResponse.next();

  // Everything else is proxied to OpenEMR's Apache so the legacy PHP UI,
  // OAuth2 endpoints, and FHIR/REST APIs stay reachable through one host.
  return proxyToOpenEMR(req);
}

export const config = {
  // Run middleware on every path *except* Next.js's own static bundles.
  // OpenEMR's static assets (e.g. /interface/themes/style.css) must hit
  // middleware so the proxy can reach them.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
