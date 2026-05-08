import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP: locked to 'self' per PROMPT.md §2 security posture.
// Dev needs 'unsafe-eval' for Next.js HMR/Turbopack and 'unsafe-inline' for
// styles injected by react-refresh. Production stays strict.
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Limit our security headers to app-owned routes. Proxied routes (anything
// not matched here) inherit whatever OpenEMR's Apache sends so the legacy
// PHP UI keeps rendering — its inline scripts would be killed by our
// strict CSP. Production hardening (one CSP across the whole hostname)
// is phase-2+ work after the PHP UI has been ported away.
const APP_ROUTE_SOURCES = [
  "/",
  "/login",
  "/callback",
  "/logout",
  "/api/:path*",
  "/patient/:path*",
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return APP_ROUTE_SOURCES.map((source) => ({
      source,
      headers: securityHeaders,
    }));
  },
};

export default nextConfig;
