import { NextResponse, type NextRequest } from "next/server";
import { resolveLoginReturnTo } from "@/lib/auth/post-login";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestedPatient = req.nextUrl.searchParams.get("patient");
  const patientPath = requestedPatient
    ? `/patient/${encodeURIComponent(requestedPatient)}`
    : "/";
  const returnTo = resolveLoginReturnTo(
    req.nextUrl.searchParams.get("returnTo") ?? patientPath,
  );

  const loginUrl = new URL("/login", publicEnv().NEXT_PUBLIC_APP_URL);
  loginUrl.searchParams.set("returnTo", returnTo);

  const launch = req.nextUrl.searchParams.get("launch");
  if (launch) {
    loginUrl.searchParams.set("launch", launch);
  }
  const iss = req.nextUrl.searchParams.get("iss");
  if (iss) {
    loginUrl.searchParams.set("iss", iss);
  }
  const aud = req.nextUrl.searchParams.get("aud");
  if (aud) {
    loginUrl.searchParams.set("aud", aud);
  }

  return NextResponse.redirect(loginUrl);
}
