import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, getIdTokenClaims } from "@/lib/auth/oauth";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();

  const expectedState = session.state;
  const codeVerifier = session.codeVerifier;
  const expectedNonce = session.nonce;
  const returnTo = session.returnTo;

  if (!expectedState || !codeVerifier) {
    log.warn("auth.callback.missing_pkce_or_state");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let result;
  try {
    result = await exchangeCodeForTokens({
      callbackUrl: req.nextUrl,
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
    { userId: session.userId, fhirUser: session.fhirUser },
    "auth.callback.ok",
  );

  const env = serverEnv();
  const dest =
    returnTo ??
    (env.TEST_PATIENT_ID
      ? `/patient/${env.TEST_PATIENT_ID}`
      : "/patient/placeholder");
  return NextResponse.redirect(new URL(dest, req.url));
}
