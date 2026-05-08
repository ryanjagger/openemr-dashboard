import { NextResponse } from "next/server";
import { buildEndSessionUrl } from "@/lib/auth/oauth";
import { getSession } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const idTokenHint = session.idToken;
  const userId = session.userId;
  session.destroy();

  const { NEXT_PUBLIC_APP_URL } = publicEnv();
  const postLogoutRedirectUri = `${NEXT_PUBLIC_APP_URL}/`;

  if (idTokenHint) {
    const endSessionUrl = await buildEndSessionUrl({
      idTokenHint,
      postLogoutRedirectUri,
    });
    if (endSessionUrl) {
      log.info({ userId }, "auth.logout.end_session_redirect");
      return NextResponse.redirect(endSessionUrl);
    }
    log.warn(
      { userId },
      "auth.logout.no_end_session_endpoint — falling back to local",
    );
  }

  return NextResponse.redirect(postLogoutRedirectUri);
}
