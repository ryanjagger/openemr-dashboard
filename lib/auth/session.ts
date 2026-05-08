import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export type Session = {
  // Set after a successful token exchange:
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  userId?: string;
  fhirUser?: string;

  // Transient values written before the OAuth redirect, consumed in /callback:
  state?: string;
  codeVerifier?: string;
  nonce?: string;
  returnTo?: string;
};

let cachedOpts: SessionOptions | null = null;

function getSessionOptions(): SessionOptions {
  if (cachedOpts) return cachedOpts;
  const env = serverEnv();
  cachedOpts = {
    password: env.SESSION_SECRET,
    cookieName: "openemr_dashboard_session",
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    ttl: 60 * 60 * 8,
  };
  return cachedOpts;
}

export async function getSession(): Promise<IronSession<Session>> {
  const cookieStore = await cookies();
  return getIronSession<Session>(cookieStore, getSessionOptions());
}

export function isAuthenticated(session: Pick<Session, "accessToken">): boolean {
  return Boolean(session.accessToken);
}
