import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { openemrFetch } from "@/lib/http";
import { log } from "@/lib/log";

// Hop-by-hop headers (RFC 7230 §6.1) — never forwarded across a proxy.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  // Next.js will compute these itself when streaming the body back.
  "content-length",
  "transfer-encoding",
  // Don't let upstream Connection state leak into our response.
  "connection",
  "keep-alive",
]);

function buildUpstreamUrl(req: NextRequest, baseUrl: string): URL {
  const base = new URL(baseUrl);
  // pathname + search; preserve trailing slash semantics that PHP relies on.
  return new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, base);
}

function buildUpstreamHeaders(req: NextRequest, target: URL): Headers {
  const headers = new Headers();
  for (const [name, value] of req.headers) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers.set(name, value);
  }
  // Rewrite Host so OpenEMR's vhost matching works.
  headers.set("host", target.host);
  // Tell OpenEMR what the client-facing host/proto were.
  const originalHost = req.headers.get("host");
  if (originalHost) headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));
  const xfwd = req.headers.get("x-forwarded-for");
  const ip = req.headers.get("x-real-ip") ?? "";
  if (ip) headers.set("x-forwarded-for", xfwd ? `${xfwd}, ${ip}` : ip);
  return headers;
}

function copyResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of src) {
    if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    out.append(name, value);
  }
  return out;
}

export async function proxyToOpenEMR(
  req: NextRequest,
): Promise<NextResponse> {
  const env = serverEnv();
  const target = buildUpstreamUrl(req, env.OPENEMR_BASE_URL);
  const headers = buildUpstreamHeaders(req, target);

  const start = Date.now();

  // GET/HEAD never have a body; everything else streams the request body.
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.body;
    // undici needs duplex:'half' to send a streaming body.
    (init as RequestInit & { duplex: "half" }).duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await openemrFetch(target, init);
  } catch (err) {
    log.error(
      { err, method: req.method, path: req.nextUrl.pathname },
      "proxy.fetch_failed",
    );
    return new NextResponse("Bad Gateway", { status: 502 });
  }

  log.debug(
    {
      method: req.method,
      path: req.nextUrl.pathname,
      status: upstream.status,
      durationMs: Date.now() - start,
    },
    "proxy",
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyResponseHeaders(upstream.headers),
  });
}
