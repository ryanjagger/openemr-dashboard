import { randomUUID } from "node:crypto";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import {
  deleteTokens,
  readTokens,
  writeTokens,
  type StoredTokens,
} from "@/lib/auth/session-store";

/**
 * What callers see. Cookie holds only the session id + transient OAuth
 * pre-callback state (PKCE/state/nonce/returnTo) — the actual tokens
 * are kept in {@link session-store}.
 */
export type Session = StoredTokens & {
  // Transient values written before the OAuth redirect, consumed in /callback.
  state?: string;
  codeVerifier?: string;
  nonce?: string;
  returnTo?: string;

  save: () => Promise<void>;
  destroy: () => void;
};

type CookieData = {
  sid?: string;
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

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const cookie = await getIronSession<CookieData>(cookieStore, getSessionOptions());

  if (!cookie.sid) cookie.sid = randomUUID();
  const tokens = readTokens(cookie.sid) ?? {};

  const session: Session = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken,
    expiresAt: tokens.expiresAt,
    userId: tokens.userId,
    fhirUser: tokens.fhirUser,
    state: cookie.state,
    codeVerifier: cookie.codeVerifier,
    nonce: cookie.nonce,
    returnTo: cookie.returnTo,

    async save() {
      cookie.state = session.state;
      cookie.codeVerifier = session.codeVerifier;
      cookie.nonce = session.nonce;
      cookie.returnTo = session.returnTo;
      writeTokens(cookie.sid!, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        idToken: session.idToken,
        expiresAt: session.expiresAt,
        userId: session.userId,
        fhirUser: session.fhirUser,
      });
      await cookie.save();
    },

    destroy() {
      if (cookie.sid) deleteTokens(cookie.sid);
      cookie.destroy();
    },
  };

  return session;
}

export function isAuthenticated(session: Pick<Session, "accessToken">): boolean {
  return Boolean(session.accessToken);
}
