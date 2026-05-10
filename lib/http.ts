import { Agent, fetch as undiciFetch } from "undici";
import { publicEnv, serverEnv } from "@/lib/env";

let cachedInsecureAgent: Agent | null = null;

function getInsecureAgent(): Agent {
  if (!cachedInsecureAgent) {
    cachedInsecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });
  }
  return cachedInsecureAgent;
}

function shouldRelaxTls(target: URL): boolean {
  const env = serverEnv();
  if (env.NODE_ENV === "production") return false;
  const base = new URL(env.OPENEMR_BASE_URL);
  return target.protocol === base.protocol && target.host === base.host;
}

function toUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

// OAuth metadata advertises endpoints on the dashboard's public hostname (so
// browser navigations stay same-origin under the strangler-fig proxy). Server-
// side calls into those endpoints — discovery, token exchange, JWKs — would
// otherwise loop back through the dashboard's own HTTP server, which deadlocks
// the Next dev server and adds a wasted hop in prod. Redirect them to OpenEMR.
function maybeRewriteToOpenEmr(target: URL): URL {
  const publicBase = new URL(publicEnv().NEXT_PUBLIC_APP_URL);
  if (
    target.protocol !== publicBase.protocol ||
    target.host !== publicBase.host
  ) {
    return target;
  }
  const openemrBase = new URL(serverEnv().OPENEMR_BASE_URL);
  return new URL(
    target.pathname + target.search + target.hash,
    openemrBase,
  );
}

export const openemrFetch: typeof fetch = (input, init) => {
  const target = maybeRewriteToOpenEmr(toUrl(input));
  if (shouldRelaxTls(target)) {
    return undiciFetch(target, {
      ...(init as object),
      dispatcher: getInsecureAgent(),
    }) as unknown as Promise<Response>;
  }
  return fetch(target, init);
};
