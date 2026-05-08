import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl } from "@/lib/auth/oauth";
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

  const verifier = await generateVerifier();
  const challenge = await generateChallenge(verifier);
  const state = await generateState();
  const nonce = await generateNonce();

  session.codeVerifier = verifier;
  session.state = state;
  session.nonce = nonce;
  const returnTo = req.nextUrl.searchParams.get("returnTo");
  if (returnTo && returnTo.startsWith("/")) session.returnTo = returnTo;
  await session.save();

  const url = await buildAuthorizeUrl({
    state,
    codeChallenge: challenge,
    nonce,
  });
  log.debug({ returnTo: session.returnTo }, "auth.login.redirect");
  return NextResponse.redirect(url);
}
