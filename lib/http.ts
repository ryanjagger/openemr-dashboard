import { Agent, fetch as undiciFetch } from "undici";
import { serverEnv } from "@/lib/env";

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

export const openemrFetch: typeof fetch = (input, init) => {
  const target = toUrl(input);
  if (shouldRelaxTls(target)) {
    return undiciFetch(target, {
      ...(init as object),
      dispatcher: getInsecureAgent(),
    }) as unknown as Promise<Response>;
  }
  return fetch(input, init);
};
