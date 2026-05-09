import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, getIdTokenClaims } from "@/lib/auth/oauth";
import { isSafeReturnTo } from "@/lib/auth/post-login";
import { getSession } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();

  const expectedState = session.state;
  const codeVerifier = session.codeVerifier;
  const expectedNonce = session.nonce;
  const returnTo = session.returnTo;

  const publicBase = publicEnv().NEXT_PUBLIC_APP_URL;

  if (!expectedState || !codeVerifier) {
    log.warn("auth.callback.missing_pkce_or_state");
    return NextResponse.redirect(new URL("/login", publicBase));
  }

  let result;
  try {
    // oauth4webapi does an instanceof URL check on the callback URL; Next's
    // NextURL fails that check, so re-wrap as a plain URL.
    const callbackUrl = new URL(req.url);
    result = await exchangeCodeForTokens({
      callbackUrl,
      expectedState,
      expectedNonce,
      codeVerifier,
    });
  } catch (err) {
    log.error({ err }, "auth.callback.exchange_failed");
    // Clear stale PKCE/state so a retry starts clean.
    session.state = undefined;
    session.codeVerifier = undefined;
    session.nonce = undefined;
    await session.save();
    return new NextResponse("OAuth callback failed", { status: 502 });
  }

  const claims = getIdTokenClaims(result);

  session.accessToken = result.access_token;
  if (result.refresh_token) session.refreshToken = result.refresh_token;
  if (typeof result.id_token === "string") session.idToken = result.id_token;
  session.expiresAt =
    Math.floor(Date.now() / 1000) + Number(result.expires_in ?? 3600);
  session.userId = claims?.sub;
  session.fhirUser =
    typeof claims?.fhirUser === "string" ? claims.fhirUser : undefined;

  // Consume transient values so they don't leak into a future login attempt.
  session.state = undefined;
  session.codeVerifier = undefined;
  session.nonce = undefined;
  session.returnTo = undefined;
  await session.save();

  log.info(
    {
      userId: session.userId,
      fhirUser: session.fhirUser,
      grantedScope: result.scope,
    },
    "auth.callback.ok",
  );

  // Stay inside the Next app after OAuth. Redirecting to OpenEMR's PHP
  // main.php here can trigger a second PHP-form login, depending on how
  // the OpenEMR build separates OAuth-provider and UI sessions.
  const destination = isSafeReturnTo(returnTo) ? returnTo : "/";
  return NextResponse.redirect(new URL(destination, publicBase));
}
