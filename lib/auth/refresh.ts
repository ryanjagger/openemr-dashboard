import { refreshTokens } from "@/lib/auth/oauth";
import type { Session } from "@/lib/auth/session";
import { log } from "@/lib/log";

const REFRESH_SKEW_SECONDS = 30;

export function isExpired(
  session: Pick<Session, "expiresAt">,
  skewSeconds = REFRESH_SKEW_SECONDS,
): boolean {
  if (!session.expiresAt) return true;
  return Date.now() / 1000 >= session.expiresAt - skewSeconds;
}

export class RefreshFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RefreshFailedError";
  }
}

/**
 * Force a refresh — used by the FHIR client on 401 (the server rejected
 * the token even though our local expiresAt may still look valid).
 * Mutates and persists the session in place.
 */
export async function forceRefresh(session: Session): Promise<void> {
  if (!session.refreshToken) {
    throw new RefreshFailedError("No refresh token in session");
  }
  log.debug({ userId: session.userId }, "auth.refresh.start");
  try {
    const result = await refreshTokens(session.refreshToken);
    session.accessToken = result.access_token;
    if (result.refresh_token) session.refreshToken = result.refresh_token;
    if (typeof result.id_token === "string") session.idToken = result.id_token;
    session.expiresAt =
      Math.floor(Date.now() / 1000) + Number(result.expires_in ?? 3600);
    await session.save();
    log.info({ userId: session.userId }, "auth.refresh.ok");
  } catch (err) {
    log.warn({ err, userId: session.userId }, "auth.refresh.failed");
    throw new RefreshFailedError("Failed to refresh access token", {
      cause: err,
    });
  }
}

/**
 * Refresh the session's access token if it's near/past expiry. Mutates
 * and persists the session in place. Returns true if a refresh occurred.
 */
export async function refreshIfNeeded(session: Session): Promise<boolean> {
  if (!session.accessToken) return false;
  if (!session.refreshToken) return false;
  if (!isExpired(session)) return false;
  await forceRefresh(session);
  return true;
}
