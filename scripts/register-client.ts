/**
 * One-shot OAuth2 client registration via RFC 7591.
 *
 * Usage:  pnpm tsx scripts/register-client.ts
 *
 * Reads OPENEMR_BASE_URL, OPENEMR_SITE, OAUTH_REDIRECT_URI from .env.local,
 * POSTs to {issuer}/registration, prints the resulting client_id and
 * client_secret. Paste both into .env.local.
 *
 * If OpenEMR requires admin approval for new clients, visit
 * Administration → System → API Clients in the OpenEMR UI and approve the
 * client before attempting the auth flow.
 */
import { readFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";

// Tiny .env.local loader (avoids adding dotenv just for one script).
function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");

const required = ["OPENEMR_BASE_URL", "OPENEMR_SITE", "OAUTH_REDIRECT_URI"] as const;
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}. Set it in .env.local.`);
    process.exit(1);
  }
}

const baseUrl = process.env.OPENEMR_BASE_URL!;
const site = process.env.OPENEMR_SITE!;
const redirectUri = process.env.OAUTH_REDIRECT_URI!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const registrationUrl = `${baseUrl}/oauth2/${site}/registration`;
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

const SCOPES = [
  "openid",
  "fhirUser",
  "offline_access",
  "user/Patient.read",
  "user/AllergyIntolerance.read",
  "user/Condition.read",
  "user/MedicationRequest.read",
  "user/CareTeam.read",
  "user/Encounter.read",
];

const body = {
  application_type: "private",
  redirect_uris: [redirectUri],
  client_name: "OpenEMR Patient Dashboard (dev)",
  token_endpoint_auth_method: "client_secret_post",
  contacts: ["dev@example.com"],
  scope: SCOPES.join(" "),
  initiate_login_uri: `${appUrl}/login`,
  post_logout_redirect_uris: [`${appUrl}/`],
  jwks_uri: undefined as string | undefined,
};

async function main() {
  console.log(`Registering OAuth2 client at ${registrationUrl} ...`);

  const res = await undiciFetch(registrationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    dispatcher: insecureAgent,
  });

  if (!res.ok) {
    console.error(`Registration failed: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }

  const json = (await res.json()) as Record<string, unknown>;

  console.log("\nClient registered successfully.\n");
  console.log("Paste these into .env.local:\n");
  console.log(`OAUTH_CLIENT_ID=${json.client_id}`);
  console.log(`OAUTH_CLIENT_SECRET=${json.client_secret}`);
  console.log("");

  if (json.client_id_issued_at || json.client_secret_expires_at) {
    console.log("Metadata:");
    if (typeof json.client_id_issued_at === "number") {
      console.log(`  Issued at:         ${new Date(json.client_id_issued_at * 1000).toISOString()}`);
    }
    if (typeof json.client_secret_expires_at === "number") {
      const ts = json.client_secret_expires_at;
      console.log(`  Secret expires at: ${ts === 0 ? "never" : new Date(ts * 1000).toISOString()}`);
    }
  }

  console.log(
    "\nNext: if OpenEMR's Administration → System → API Clients lists this " +
      "client as 'Pending', approve it before running the OAuth flow.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
