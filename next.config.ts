import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const openemrOrigin = (() => {
  try {
    return process.env.OPENEMR_BASE_URL
      ? new URL(process.env.OPENEMR_BASE_URL).origin
      : null;
  } catch {
    return null;
  }
})();
const devFrameAncestors = ["http://localhost:8300", "https://localhost:9300"];
const embedFrameAncestors = [
  "'self'",
  ...(openemrOrigin ? [openemrOrigin] : []),
  ...(isDev ? devFrameAncestors : []),
]
  .filter((value, index, all) => all.indexOf(value) === index)
  .join(" ");

function securityHeadersFor(opts: {
  frameAncestors: string;
  xFrameOptions?: string;
}) {
  // CSP is strict by default. The embed route allows same-origin framing so
  // OpenEMR's tab shell can host the dashboard in an iframe.
  const csp = [
    "default-src 'self'",
    `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-ancestors ${opts.frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers = [
    { key: "Content-Security-Policy", value: csp },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
  if (opts.xFrameOptions) {
    headers.push({ key: "X-Frame-Options", value: opts.xFrameOptions });
  }
  return headers;
}

// Limit our security headers to app-owned routes. Proxied routes (anything
// not matched here) inherit whatever OpenEMR's Apache sends so the legacy
// PHP UI keeps rendering — its inline scripts would be killed by our
// strict CSP. Production hardening (one CSP across the whole hostname)
// is phase-2+ work after the PHP UI has been ported away.
const APP_ROUTE_SOURCES = [
  "/",
  "/logout",
  "/api/:path*",
  "/patient/:path*",
];

const EMBED_AUTH_ROUTE_SOURCES = ["/launch", "/login", "/callback"];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const strictHeaders = securityHeadersFor({
      frameAncestors: "'none'",
      xFrameOptions: "DENY",
    });
    const embedHeaders = securityHeadersFor({
      frameAncestors: embedFrameAncestors,
    });
    return [
      {
        source: "/embed/:path*",
        headers: embedHeaders,
      },
      ...EMBED_AUTH_ROUTE_SOURCES.map((source) => ({
        source,
        headers: embedHeaders,
      })),
      ...APP_ROUTE_SOURCES.map((source) => ({
        source,
        headers: strictHeaders,
      })),
    ];
  },
};

export default nextConfig;
