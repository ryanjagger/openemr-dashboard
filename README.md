# OpenEMR Patient Dashboard

A read-only Next.js dashboard for OpenEMR patients, phase one of an
incremental migration of OpenEMR's PHP UI to a modern frontend.

The Next.js app and the existing PHP UI live behind one hostname.
Next.js owns a small set of routes (the new dashboard, OAuth2 callback,
logout); everything else proxies through to OpenEMR's Apache. Auth is
OAuth2 + PKCE against OpenEMR's own auth server, so clinicians sign
in once.

See `PROMPT.md` for the full architecture brief and phased plan, and
`CLAUDE.md` for working notes.

## What's in scope (phase one)

- OAuth2 Authorization Code + PKCE login against OpenEMR.
- Reverse-proxy fallback so `/interface/...` (PHP UI), `/oauth2/...`,
  and `/apis/...` (FHIR + REST) keep working through one hostname.
- Persistent patient header (name, DOB + age, sex, MRN/External ID,
  active badge).
- Five clinical cards backed by FHIR R4 — Allergies, Problem List,
  Medications (`MedicationRequest` `intent=plan,status=active`),
  Prescriptions (`MedicationRequest` `intent=order`), Care Team.
- Recent encounters preview + full `/patient/[id]/encounters` page.
- A small PHP edit (`openemr-patches/patient-summary-bridge-link.patch`)
  adding a "New Dashboard" link in OpenEMR's left nav.

Out of scope: writing clinical data, patient search, replacing other
PHP pages, production-grade reverse proxy, SMART EHR Launch. See
PROMPT.md §7.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 22 LTS | `nvm install 22 && nvm use 22`; `.nvmrc` pins this |
| pnpm | 11+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| OpenEMR | 8.1.x | Local dev instance. Standard REST + FHIR APIs enabled |

OpenEMR-side checks before you start:

```bash
# FHIR metadata reachable?
curl -ks https://localhost:9300/apis/default/fhir/metadata | jq '.fhirVersion'
# expect: "4.0.1"

# OIDC discovery reachable?
curl -ks https://localhost:9300/oauth2/default/.well-known/openid-configuration \
  | jq '.authorization_endpoint, .token_endpoint, .end_session_endpoint, .registration_endpoint'
```

In OpenEMR Admin → Globals → Connectors:
- "Enable OpenEMR Standard REST API" = ON
- "Enable OpenEMR FHIR REST API" = ON

## Quick start (clone → dashboard in ≈10 minutes)

```bash
# 1. Install
git clone <this-repo> openemr-dashboard && cd openemr-dashboard
nvm use            # picks up .nvmrc → Node 22
corepack enable    # if pnpm isn't already on PATH
pnpm install

# 2. Configure
cp .env.example .env.local
# then fill in:
#   SESSION_SECRET=$(openssl rand -base64 48)
#   OPENEMR_BASE_URL=...   (defaults to https://localhost:9300)
#   TEST_PATIENT_ID=...    (FHIR Patient.id — see "Find a test patient" below)
#   TEST_PATIENT_PID=...   (OpenEMR pubpid for the same patient)

# 3. Register an OAuth2 client with OpenEMR (RFC 7591 dynamic registration)
pnpm tsx scripts/register-client.ts
# Copy the printed OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET into .env.local.

# (If your OpenEMR build leaves new clients in "Pending" state, go to
#  Administration → System → API Clients and flip "Is Enabled" on for
#  this client. 8.1.x is "Pending=enabled" by default in many builds.)

# 4. Run
pnpm dev
# Open http://localhost:3000/login — you'll be bounced to OpenEMR's
# login screen, then redirected back to /patient/{TEST_PATIENT_ID}.
```

## Finding a test patient

The new dashboard expects a FHIR `Patient.id` (UUID), not OpenEMR's
internal pid. Easiest path: pick a patient in OpenEMR's PHP UI and note
their pubpid (External ID column), then once OAuth is wired:

```bash
# Replace <pubpid> with the External ID column value (e.g. "66").
curl -ks -H "Authorization: Bearer <access-token>" \
  -H "Accept: application/fhir+json" \
  "https://localhost:9300/apis/default/fhir/Patient?identifier=<pubpid>" \
  | jq '.entry[].resource.id'
```

For OpenEMR 8.1.x specifically, the FHIR `Patient.identifier` only
exposes `pubpid` (PT type), not the internal numeric `pid`. The Phase 6
PHP bridge link uses pubpid in the URL slot for now; production work
should switch to a server-side pid → FHIR resolution via the OpenEMR
REST API.

## Development workflow

```bash
pnpm dev          # Next.js dev server (also reverse-proxies OpenEMR)
pnpm test         # Vitest unit + integration
pnpm test:watch   # Vitest watch mode
pnpm test:e2e     # Playwright (needs E2E_USERNAME / E2E_PASSWORD env)
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm build        # Next.js production build
pnpm start        # Run the production build locally
```

## Applying the OpenEMR PHP patch

The patch under `openemr-patches/patient-summary-bridge-link.patch`
adds a "New Dashboard" link to OpenEMR's PHP left nav so clinicians can
jump from the legacy UI into the new dashboard for the patient they're
viewing.

```bash
# In your OpenEMR checkout (NOT this repo):
cd path/to/openemr
git checkout -b new-dashboard-bridge
git apply path/to/openemr-dashboard/openemr-patches/patient-summary-bridge-link.patch
# Verify the diff looks right, then commit on your fork.
```

The link target is built from the OpenEMR globals key
`new_dashboard_url` if set, otherwise falls back to
`http://localhost:3000`. Set it via Administration → Globals → System
to point at your dashboard deployment.

## Architecture in 60 seconds

```
Browser ─────────────────────► localhost:3000 (Next.js)
                                   ├── /login, /callback, /logout    → app routes (auth)
                                   ├── /patient/[id]                  → app routes (dashboard)
                                   ├── /api/...                       → app routes
                                   └── everything else                → reverse proxy → OpenEMR Apache (https://localhost:9300)
```

- Tokens live in a server-side in-memory store keyed by a random
  session id; the iron-session cookie holds only the id + transient
  PKCE/state. They never touch the browser.
- All FHIR calls run server-side via `lib/fhir/client.ts` (audit-logged,
  refresh-on-401, retry-on-5xx, Zod validation at the boundary).
- Cards are async Server Components wrapped in per-card Suspense + a
  client error boundary so they stream in independently.

For the security posture, see PROMPT.md §2.

## Production hardening (out of scope for phase one — known TODOs)

- Replace the in-memory token store with Redis or another shared
  store so tokens survive restarts and work across replicas.
- Replace the Next.js-middleware proxy with nginx or Caddy in front
  for proper streaming + WebSocket handling.
- Investigate full bidirectional SSO (OAuth2 login → PHP session
  active). See `memory/project_openemr_sso_directionality.md` notes.
- Lighthouse audit on the dashboard route (Performance ≥ 90,
  Accessibility ≥ 95, Best Practices ≥ 95).

## Troubleshooting

**Self-signed cert errors on `https://localhost:9300`.**
`lib/http.ts` wires a scoped undici dispatcher that disables cert
verification for OpenEMR's base URL in non-prod, so you don't need
the global `NODE_TLS_REJECT_UNAUTHORIZED=0` escape hatch.

**`pnpm dev` runs but `/login` 500s with "missing OAUTH_CLIENT_ID".**
Run `pnpm tsx scripts/register-client.ts` and paste the output values
into `.env.local`.

**OAuth flow loops back to OpenEMR's login.**
The dynamically registered client is probably disabled. Open
Administration → System → API Clients and enable it.

**Cards render but the body says "Couldn't load this patient".**
Check `pnpm dev` stdout for the actual error (pino logs the FHIR call
with status + duration). Common causes: token expired (clear cookie,
re-login), bad TEST_PATIENT_ID (verify it's a real FHIR Patient.id).

**Dev server restart logs everyone out.**
Expected in phase one — token store is in-process memory. Re-login
via `/login`. Phase-2+ swap for Redis.
