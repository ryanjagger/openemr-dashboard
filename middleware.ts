import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const PUBLIC_PREFIXES = [
  "/login",
  "/callback",
  "/logout",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Phase 1 scope: gate /patient/*. Phase 2 will extend this with the
  // reverse-proxy fallback for unmatched routes.
  if (!pathname.startsWith("/patient")) return NextResponse.next();

  const session = await getSession();
  if (!session.accessToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to everything except static asset paths.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)).*)",
  ],
};
