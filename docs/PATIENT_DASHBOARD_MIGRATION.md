# Patient Dashboard Migration — Architecture

How this Next.js app is structured and how it plugs into a running
OpenEMR (PHP) instance. For setup steps, see `README.md`. For the
phased build plan and the locked architectural decisions, see
`docs/PROMPT.md`.

---

## 1. Why this exists

OpenEMR's UI is PHP rendered out of `interface/patient_file/...` and
related Smarty templates. This repo is **phase one** of an incremental
replacement: port the UI, page by page, to a modern Next.js stack
without rewriting OpenEMR's backend. The patient dashboard is the
first wedge — a read-only view of a single patient — chosen because
it exercises every integration we'll need (auth, FHIR, session
sharing, navigation between old/new) without touching any clinical
data writes.

Routes flip from PHP to Next.js one
at a time. The PHP backend (controllers, MySQL access, business
logic) keeps running through the whole transition.

---

## 2. Migration pattern: strangler fig with a shared hostname

There is one hostname for the user. Both the legacy PHP UI and the
new Next.js app live behind it. A reverse proxy decides per request
who handles it:

```
                       ┌─────────────────────────────────────┐
   Browser ──────────► │ Next.js (this app) on :3000         │
   one hostname        │                                     │
                       │   /login,/callback,/logout,/launch  │ ◄── Next.js handles
                       │   /patient/[id], /embed/patient/... │ ◄── Next.js handles
                       │   /api/*                            │ ◄── Next.js handles
                       │                                     │
                       │   everything else  ─── proxy ───►   │ ──► OpenEMR Apache (:9300)
                       │                                     │     /interface/*    PHP UI
                       │                                     │     /oauth2/*       OAuth/OIDC
                       │                                     │     /apis/*/fhir/*  FHIR R4
                       │                                     │     /apis/*/api/*   REST
                       └─────────────────────────────────────┘
```

URLs that clinicians have bookmarked (`/interface/main/main_screen.php`,
encounter editors, billing pages, …) keep working. As more pages port
to Next.js, the matcher in `middleware.ts` claims more prefixes and
the proxy serves less.

In phase one **Next.js itself is the proxy**. That's good enough for
dev and a soft launch. Production hardening — moving the proxy into
nginx or Caddy in front of both processes for proper streaming,
WebSocket handling, and one shared CSP — is explicitly out of scope
(see `docs/PROMPT.md` §7).

---

## 3. Routing & request handling

### `middleware.ts`

Three buckets:

1. **Authed app routes** (`/patient/*`, `/embed/patient/*`) — `gateOrPass`
   reads the session; no token → redirect to `/login` with `returnTo`.
2. **Unauthed app routes** (`/`, `/login`, `/callback`, `/logout`,
   `/launch`, `/api/*`, `/embed/*`) — pass through to Next.js.
3. **Everything else** — `proxyToOpenEMR(req)` (in `lib/proxy.ts`).

Run on Node, not Edge — the proxy uses `undici` and the FHIR/OAuth
stacks need full Node primitives.

### `lib/proxy.ts`

A small streaming reverse proxy:

- Strips hop-by-hop headers per RFC 7230 §6.1 before forwarding.
- Rewrites `Host` to the upstream so OpenEMR's vhost matching works,
  sets `X-Forwarded-Host` / `Proto` / `For` so OpenEMR can see the
  client-facing origin.
- Streams the request body for non-GET/HEAD using `duplex: "half"`.
- `redirect: "manual"` so we can rewrite `Location` headers — absolute
  URLs pointing at OpenEMR's origin get rewritten to our public origin
  so the browser stays on the proxy. Relative locations resolve
  against the **original** request URL (not `/`) so a redirect from
  `/interface/main/main_info.php` to `calendar/index.php` lands at
  `/interface/main/calendar/index.php`.
- The PHP session cookie is forwarded unchanged so the legacy UI's
  own session (separate from our iron-session cookie) keeps working
  side-by-side.

---

## 4. Authentication

### OAuth2 + OIDC + PKCE against OpenEMR's own auth server

OpenEMR ships an OAuth2/OIDC provider. We talk to it with
`oauth4webapi` and get real FHIR-scoped tokens. Confidential client,
PKCE mandatory.

Flow (happy path):

```
Browser            Next.js                          OpenEMR
   │                  │                                │
   │ GET /login ────► │ generate state+verifier+nonce │
   │                  │ stash in cookie+memory        │
   │ ◄── 302 ──────── │ build authorize URL ─────────►│
   │ GET /oauth2/.../authorize ────────────────────► │ login form (PHP)
   │ ◄── login UI ──────────────────────────────── │
   │ POST creds ───────────────────────────────────►│
   │ ◄── 302 ?code=&state= ────────────────────── │
   │ GET /callback?... ► validate state            │
   │                    exchange code+verifier ───►│ token endpoint
   │                  ◄ access+refresh+id_token   │
   │                    persist tokens             │
   │ ◄── 302 ──────── /patient/{returnTo}          │
```

Pieces:

- `lib/auth/pkce.ts` — wraps `oauth4webapi`'s verifier/challenge/state/nonce.
- `lib/auth/oauth.ts` — discovery, authorize URL builder, code-for-token
  exchange, refresh, end-session URL builder. Uses
  `client_secret_post` (matches what `register-client.ts` registers).
- `app/(auth)/login/route.ts` — generates PKCE/state, saves them in
  the session, redirects to OpenEMR's authorize endpoint. Also threads
  SMART `launch`/`iss`/`aud` params through when present (embedded
  mode, see §7).
- `app/(auth)/callback/route.ts` — validates state, exchanges code,
  saves tokens, clears transient PKCE/state, redirects to
  `returnTo` (or `/`).
- `app/(auth)/logout/route.ts` — destroys our session, then 302s to
  OpenEMR's OIDC `end_session_endpoint` with `id_token_hint` so the
  PHP session also tears down. Falls back to local-only logout if
  the discovery doc doesn't advertise `end_session_endpoint`.
- `lib/auth/refresh.ts` — `refreshIfNeeded` (skew-aware) and
  `forceRefresh` (called by the FHIR client on a 401).

### The same-origin issuer trick

The OIDC issuer we register with OpenEMR is the **dashboard's** public
URL, not OpenEMR's. That keeps all browser-side OAuth navigations
same-origin under the strangler-fig proxy (no third-party-cookie
pain, no second hostname for users to trust).

But our **server-side** code also needs to hit the discovery doc, the
token endpoint, and JWKS. If we just fetched the issuer URL we'd loop
back through our own HTTP server. So `lib/http.ts` exposes
`openemrFetch`, which detects targets pointing at our public origin
and rewrites them to `OPENEMR_BASE_URL` before dispatching. Both
`lib/auth/oauth.ts` and `lib/fhir/client.ts` route through it.

Same module also handles dev TLS: OpenEMR ships with a self-signed
cert on `https://localhost:9300`, so `openemrFetch` swaps in an
`undici` `Agent` with `rejectUnauthorized: false` **only** when the
target host matches `OPENEMR_BASE_URL` and `NODE_ENV !== production`.
No global `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Silent SSO (one direction)

If a clinician is already logged into OpenEMR's PHP UI in another tab,
opening the dashboard does an OAuth round-trip but OpenEMR auto-grants
because the PHP session is live → the user never sees a second login
prompt.

The reverse direction (OAuth login → PHP UI also logged in) does
**not** work in OpenEMR 8.1.x: the OAuth provider session and the
PHP UI session are separate. This is a known phase-6+ polish item;
the workaround in `app/(auth)/callback/route.ts` is to redirect
into the Next app rather than into a PHP page after login, since
that PHP page would otherwise bounce back to its own login form.

---

## 5. Session model & token storage

Two-part design — a cookie holds only an opaque session id, real
tokens live server-side keyed by that id.

### `lib/auth/session.ts`

`iron-session`-encrypted httpOnly cookie carrying:

- `sid` — random UUID, the lookup key
- transient OAuth pre-callback values: `state`, `codeVerifier`,
  `nonce`, `returnTo` (consumed and cleared in `/callback`)

Cookie attributes adapt: when the dashboard origin differs from
OpenEMR's origin (embedded-tab mode), the cookie is `SameSite=None;
Secure` so it survives third-party-context loading inside OpenEMR's
PHP iframe.

### `lib/auth/session-store.ts`

Process-memory `Map<sid, { accessToken, refreshToken, idToken,
expiresAt, userId, fhirUser, lastTouchedAt }>` with an 8-hour
sliding TTL and a sweep on every read.

Why server-side and not in the cookie:

- OpenEMR issues encrypted opaque tokens (the `def502...` blobs).
  Access + refresh + id easily exceed the 4 KB cookie limit even
  after iron-session compression.
- **Tokens never reach the browser.** No `localStorage`, no
  `sessionStorage`, no non-httpOnly cookie, no client-side fetches
  to OpenEMR. This is non-negotiable — see `docs/PROMPT.md` §2.

The Map is pinned on `globalThis` because (a) Next.js dev HMR reloads
modules, and (b) Turbopack instantiates middleware and route handler
modules independently, so a plain module-scoped `new Map()` would
fragment into per-context maps that never see each other's writes.

### Phase-1 limitations

- Server restart logs everyone out.
- Multi-replica deployments need sticky routing or a shared store.

Phase-2+ swap: Redis, with the same read/write/delete API.

---

## 6. FHIR data layer

### `lib/fhir/client.ts` — `fhirGet<T>(session, path, options)`

Single entry point for every FHIR call. Behavior:

- Builds `${OPENEMR_BASE_URL}/apis/${OPENEMR_SITE}/fhir${path}` and
  appends search params, skipping `undefined`/`""`.
- Sends `Authorization: Bearer <accessToken>` and
  `Accept: application/fhir+json`.
- **401** → `forceRefresh(session)`, retry once. Second 401 throws
  `AuthExpiredError`. Refresh failures (`RefreshFailedError`) are
  re-thrown as `AuthExpiredError` so the layout's error boundary
  can route the user back through `/login`.
- **5xx** → one retry after `RETRY_BACKOFF_MS` (200 ms). Still 5xx
  → `FhirServerError`.
- **404** → `FhirNotFoundError` (callers decide: render an empty
  card vs. trigger `notFound()`).
- Network failures → `FhirNetworkError`.
- Optional Zod schema validation at the boundary. **Validation
  failure is a logged warning, not a hard error** — the raw payload
  is returned so the UI degrades gracefully rather than exploding
  on a single odd field. Real EHR data is messy.
- Audit logs every call: `userId`, `patientId`, `resource`, status,
  duration. `lib/log.ts` has redaction rules for tokens/cookies/
  authorization headers so they never leak into logs.

### `lib/fhir/queries.ts` — typed query functions per resource

| Function                        | FHIR query                                                                | Notes                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPatient(s, id)`             | `GET /Patient/{id}`                                                       |                                                                                                                                                       |
| `getAllergies(s, pid)`          | `GET /AllergyIntolerance?patient={pid}`                                   |                                                                                                                                                       |
| `getProblems(s, pid)`           | `GET /Condition?patient={pid}&category=problem-list-item`                 | OpenEMR 8.1.x doesn't list `category` as a searchParam in its CapabilityStatement; we send it anyway and **also** filter client-side as a safety net. |
| `getMedications(s, pid)`        | `GET /MedicationRequest?patient={pid}&intent=plan&status=active`          | OpenEMR 8.1.x doesn't expose `MedicationStatement`, so the medication list is filtered `MedicationRequest`.                                           |
| `getPrescriptions(s, pid)`      | `GET /MedicationRequest?patient={pid}&intent=order`                       |                                                                                                                                                       |
| `getCareTeam(s, pid)`           | `GET /CareTeam?patient={pid}&status=active`                               |                                                                                                                                                       |
| `getEncounters(s, pid, n)`      | `GET /Encounter?patient={pid}&_sort=-date&_count=n`                       |                                                                                                                                                       |
| `getLabObservations(s, pid, n)` | `GET /Observation?patient={pid}&category=laboratory&_sort=-date&_count=n` |                                                                                                                                                       |

`lib/fhir/extract.ts` holds pure helpers (`formatPatientName`,
`formatCodeableConcept`, `bundleEntries`, etc.) that never touch IO.
`lib/fhir/schemas.ts` holds the Zod schemas.

### Rendering shape

`app/(dashboard)/patient/[id]/layout.tsx` resolves the URL id, fetches
`Patient` once, and renders `<PatientHeader>` above `{children}`. The
page (`page.tsx`) renders a grid of `<CardShell title="...">`, each
of which is a per-card Suspense + error boundary
(`components/cards/CardShell.tsx`):

- `<Suspense>` lets each Server-Component card stream in independently.
- `<CardErrorBoundary>` catches anything one card throws so a single
  500'd card surfaces as a small "Couldn't load Allergies — retry"
  panel instead of taking down the whole dashboard.

`React.cache` wraps `resolvePatientId` so layout / page / cards in the
same request share one validation pass.

---

## 7. Embedded mode (OpenEMR launches the dashboard in a tab)

The PHP UI's left-nav has a "New Dashboard" entry. When clicked it
opens a tab inside OpenEMR's PHP tab shell pointing at
`/launch?patient=<uuid>&returnTo=/embed/patient/<uuid>&launch=...&iss=...&aud=...`

That URL exercises three things in sequence:

1. **`app/(auth)/launch/route.ts`** — accepts SMART-on-FHIR launch
   params, extracts `returnTo`, and forwards to `/login` carrying
   `launch` / `iss` / `aud` so the OAuth round-trip preserves them.
2. **`app/(auth)/login/route.ts`** — when `launch` is present,
   appends ` launch` to scope and propagates `iss`/`aud`/
   `autosubmit=1` to the authorize URL.
3. **`app/(dashboard)/embed/patient/[id]/`** — re-uses the same
   layout and page as `/patient/[id]/`, just with iframe-friendly
   security headers (see §8).

CSP `frame-ancestors` for `/embed/*`, `/launch`, `/login`,
`/callback` allows OpenEMR's origin so its tab shell can iframe the
dashboard. Top-level dashboard routes still send `X-Frame-Options:
DENY`.

Session cookie attributes flip to `SameSite=None; Secure` when the
dashboard origin ≠ OpenEMR origin (third-party-cookie context), per
the check in `lib/auth/session.ts`.

---

## 8. Security headers / CSP

Configured in `next.config.ts`. **App routes get a strict CSP;
proxied PHP routes get whatever OpenEMR's Apache sends** (its inline
scripts and Smarty templates would be killed by our CSP, so we
deliberately don't apply ours to those paths).

App-route CSP:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` in dev only)
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: blob:`, `font-src 'self' data:`
- `connect-src 'self'`
- `frame-ancestors 'none'` (top-level) or `'self' <openemr-origin>`
  (embed)
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`

Plus HSTS (2y, includeSubDomains, preload), `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` denying camera/mic/geolocation, and
`X-Frame-Options: DENY` on top-level routes only.

`'unsafe-inline'` in `script-src` is a known phase-6+ debt: Next.js's
RSC streaming injects inline `<script>` blocks whose hashes change
each build. The fix is a per-request nonce minted in middleware;
it's not done yet.

---

## 9. PHP-side integration

Three small edits in OpenEMR (tracked as
`openemr-patches/patient-summary-bridge-link.patch`):

1. **`src/Menu/PatientMenuRole.php`** — `applyNewDashboardUrl()`
   builds the `/launch?...` URL when the patient menu item is
   "New Dashboard". Resolves the active session's `pid` to the
   patient's FHIR `uuid` via `patient_data.uuid`, builds a
   `SMARTLaunchToken`, includes `iss`/`aud` from `ServerConfig`,
   and rewrites `on_click` to call `top.navigateTab(...)` so the
   tab opens inside OpenEMR's PHP tab shell instead of a new
   browser window.
2. **`library/globals.inc.php`** — declares a `new_dashboard_url`
   global so admins can point the menu link at a deployed dashboard
   (e.g. `https://dashboard.example.com`) via Administration →
   Globals → Connectors. Without this, the menu link falls back to
   `http://localhost:3000`, which causes audience mismatches in
   non-dev environments.
3. **`interface/main/tabs/js/custom_bindings.js`** — the cross-origin
   tab title fallback used to render "Unknown" for any iframe whose
   document the parent can't read. Patched to detect dashboard URLs
   (`/launch`, `/embed/patient/`, `localhost:3000`) and label the
   tab "New Dashboard" instead.

The patch file is a snippet/apply guide rather than a strict
`git apply`-able diff because OpenEMR's source moves between
releases. Review and apply manually against the equivalent code
in your fork.

---

## 10. Where things live

Mirrors the file map in `docs/PROMPT.md` §2 with a note on what each
piece does:

```
app/
  (auth)/
    launch/route.ts        SMART launch entry; forwards launch/iss/aud → /login
    login/route.ts         generates PKCE/state, redirects to authorize
    callback/route.ts      validates state, exchanges code, persists tokens
    logout/route.ts        destroys session + OIDC end-session
  (dashboard)/
    patient/[id]/
      layout.tsx           loads Patient, renders PatientHeader
      page.tsx             grid of CardShell-wrapped cards
      loading.tsx          route-level skeleton
      error.tsx            route-level error UI
      not-found.tsx        404 (bad patient id / FHIR 404)
      encounters/page.tsx  full encounter list
    embed/patient/[id]/    iframe-friendly variants of the above
  api/                     small server endpoints (health, etc.)

lib/
  auth/
    oauth.ts               oauth4webapi: discovery, exchange, refresh, end-session
    pkce.ts                verifier/challenge/state/nonce wrappers
    session.ts             iron-session cookie + sid → token-store glue
    session-store.ts       in-memory token store keyed by sid
    refresh.ts             refreshIfNeeded + forceRefresh
    post-login.ts          returnTo safety check
  fhir/
    client.ts              fhirGet — auth, refresh-on-401, retry-on-5xx, audit
    queries.ts             typed query function per resource
    schemas.ts             Zod schemas for boundary validation
    extract.ts             pure formatters (name, codeable concept, period, MRN)
  openemr/
    resolvePatientId.ts    URL-id → FHIR Patient.id (cached per request)
  http.ts                  openemrFetch: same-origin issuer rewrite + dev TLS relax
  proxy.ts                 streaming reverse proxy → OpenEMR Apache
  env.ts                   Zod-validated env loader
  log.ts                   pino + audit() helper, with token redaction

middleware.ts              auth gate + reverse-proxy fallback
next.config.ts             CSP/HSTS/etc., per-route header policy

components/
  PatientHeader.tsx
  EncountersList.tsx, EncountersPreview.tsx
  cards/                   AllergiesCard, ProblemsCard, MedicationsCard,
                           PrescriptionsCard, CareTeamCard, LabsCard,
                           CardShell, CardErrorBoundary

scripts/
  register-client.ts       one-shot RFC 7591 OAuth2 client registration

openemr-patches/
  patient-summary-bridge-link.patch   PHP-side menu link + globals + tab title
```

---

## 11. Known limitations & phase-2+ work

| Area                  | Phase-1 state                    | Production fix                                                                 |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Token store           | Process memory; restart = logout | Redis or equivalent shared store                                               |
| Reverse proxy         | Next.js middleware               | nginx/Caddy in front of both Next.js and Apache                                |
| CSP `script-src`      | `'unsafe-inline'`                | Per-request nonce minted in middleware                                         |
| OAuth → PHP SSO       | Not bidirectional                | Investigate sharing the OpenEMR OAuth-provider session with the PHP UI session |
| PHP patch             | Snippet/apply guide              | Upstream-friendly module, version-pinned                                       |
| Patient ID resolution | URL must already be a FHIR uuid  | Server-side pid → uuid lookup via REST API, called from layout                 |

Each of these is documented inline at the relevant code site as
well — search for "phase-2", "phase-1 limitation", or "TODO".
