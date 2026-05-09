import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, SCOPES } from "@/lib/auth/oauth";
import { resolveLoginReturnTo } from "@/lib/auth/post-login";
import {
  generateChallenge,
  generateNonce,
  generateState,
  generateVerifier,
} from "@/lib/auth/pkce";
import { getSession } from "@/lib/auth/session";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const searchParams = req.nextUrl.searchParams;
  const launch = searchParams.get("launch");
  const iss = searchParams.get("iss") ?? "";
  const aud = searchParams.get("aud") ?? "";

  const verifier = await generateVerifier();
  const challenge = await generateChallenge(verifier);
  const state = await generateState();
  const nonce = await generateNonce();

  session.codeVerifier = verifier;
  session.state = state;
  session.nonce = nonce;
  session.returnTo = resolveLoginReturnTo(
    req.nextUrl.searchParams.get("returnTo"),
  );
  await session.save();

  const effectiveScope = launch ? `${SCOPES} launch` : undefined;
  const authorizeParams = {
    launch: launch ?? "",
    iss,
    aud,
    autosubmit: launch ? "1" : "",
  };

  const url = await buildAuthorizeUrl({
    state,
    codeChallenge: challenge,
    nonce,
    scope: effectiveScope,
    authorizeParams,
  });
  log.debug(
    {
      returnTo: session.returnTo,
      launchFlow: Boolean(launch),
      authorizeScope: effectiveScope ?? SCOPES,
      authorizeParams,
    },
    "auth.login.redirect",
  );
  return NextResponse.redirect(url);
}
