# OpenEMR Patient Dashboard — Next.js Port (Phase One of UI Migration)

A Claude Code working brief. Read this top to bottom before starting Phase 0.

---

## 1. Project brief

OpenEMR's patient dashboard is currently a PHP-rendered, server-side application
(`interface/patient_file/summary/*.php` and friends). It reads directly from the
MySQL schema and renders HTML via inline PHP and Smarty templates.

**This project is phase one of a multi-year migration.** The eventual goal is
to replace OpenEMR's PHP frontend with a modern Next.js application,
incrementally, route by route. The patient dashboard is the first wedge. The
PHP backend continues to run; we are replacing the presentation layer.

The migration follows the **strangler fig pattern with a shared hostname**.
Both the new Next.js app and the existing PHP UI live behind one URL. A
reverse proxy decides per-route which serves the request. URLs stay stable
for clinicians. As we port more pages, more routes shift from PHP to Next.js.
Authentication and session are shared, so clinicians log in once.

### Scope of phase one

In scope:

1. **Authentication** — OAuth2 Authorization Code + PKCE against OpenEMR's
   existing OAuth2/OIDC server, with silent re-auth via the shared OpenEMR
   session.
2. **Reverse proxy** — Next.js middleware proxies unmatched routes to
   OpenEMR's Apache so the entire site works through one hostname.
3. **Patient header** — persistent identity bar showing name, date of birth,
   sex, MRN, and active status.
4. **Clinical cards** — five live cards backed by FHIR R4: allergies, problem
   list, medications, prescriptions, care team.
5. **Encounters section** — a "recent encounters" preview card on the
   dashboard plus a full encounter list page at `/patient/[id]/encounters`.
6. **PHP bridge link** — a small edit to OpenEMR's PHP UI adding a
   "View new dashboard" link in the patient left-nav so clinicians can
   navigate from the old UI into the new one.

Out of scope for phase one:

- Editing or writing any clinical data (read-only dashboard).
- Patient search / picker (clinicians enter the dashboard via a link from the
  PHP patient finder).
- Porting any other PHP page beyond the dashboard.
- Production-grade reverse proxy (nginx/Caddy in front). Phase one uses
  Next.js middleware as the proxy; production hardening is phase-two work.
- Replacing OpenEMR's login screen. The PHP login screen remains the canonical
  login UI in phase one.
- SMART on FHIR EHR Launch (phase two consideration).

### What "feature parity" means here

Parity with the **listed scope** of the existing PHP dashboard, not with the
entire PHP UI. For each card, the new version should display the same clinical
data points a clinician sees in the corresponding PHP panel. Visual fidelity
to the PHP look is **not** required — this is a redesign opportunity within
sensible accessibility and clinical-information-density constraints.

---

## 2. Architecture decisions (locked — do not relitigate)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15+, App Router, TypeScript strict | Long-term host for the eventual replacement of OpenEMR's UI |
| Migration pattern | Pattern A — shared hostname, strangler fig | Best UX during transition, stable URLs |
| Reverse proxy (phase one) | Next.js middleware proxies unmatched routes to OpenEMR Apache | Simplest deployment for phase one; nginx is phase-two hardening |
| Auth flow | OAuth2 Authorization Code + PKCE, confidential client | Standard, supported by OpenEMR's auth server, gives real FHIR tokens |
| Auth library | `oauth4webapi` | Spec-compliant, framework-agnostic, lighter than Auth.js |
| Session | `iron-session` — encrypted httpOnly cookie, server-side only | Tokens never reach the browser |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) | Accessible, scales from 5 cards to 200 forms |
| Data fetching | Server Components for initial render; TanStack Query for client cache and refetch | App Router idiom; gives streaming + Suspense for free |
| FHIR types | `@types/fhir` (R4) | Don't hand-write |
| Runtime validation | Zod at the FHIR boundary | Real EHR data is messy; static types aren't enough |
| Forms | React Hook Form + Zod (chosen now even though phase one is read-only) | Decide once, used heavily in phase two |
| Testing | Vitest + Testing Library + Playwright + MSW | Standard Next.js stack |
| Logging | `pino` to stdout | Structured, fast |
| Lint/format | ESLint + Prettier | — |
| Package manager | pnpm | — |
| Node | 22 LTS | — |

### Security posture (non-negotiable)

- Access tokens, refresh tokens, and id tokens **never** appear in
  client-side JavaScript, `localStorage`, `sessionStorage`, or any
  non-httpOnly cookie. They live exclusively in the server-side encrypted
  session.
- All FHIR/REST calls to OpenEMR happen from Next.js server code (Server
  Components, Route Handlers, or Server Actions). The browser talks only to
  our Next.js server.
- HTTPS required in all environments except local dev against
  `localhost:9300`.
- PKCE is mandatory even though we are a confidential client.
- The session cookie uses a 32+ byte secret from the `SESSION_SECRET` env
  var. Rotate on deploy if compromised.
- Treat all FHIR responses as untrusted input for rendering. No
  `dangerouslySetInnerHTML`. Validate at the boundary with Zod schemas
  before passing into components.
- Set strict security headers in `next.config.ts`: CSP (`default-src 'self'`),
  HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
- Audit logging: log every FHIR fetch with user id, patient id, resource
  type, status, duration. Use `pino` to stdout. Never log token values or
  full response bodies.
- Logout coordinates with OpenEMR via the OIDC end-session endpoint so
  logging out of the dashboard also clears the PHP session.

### Repo layout

The Next.js app lives in a **separate repository** alongside (not inside) the
OpenEMR PHP tree. The PHP edit (the bridge link) is committed to a fork or
branch of `openemr/openemr` and tracked as a patch in this repo.

```
openemr-dashboard/                        # this repo
├── app/
│   ├── (auth)/
│   │   ├── login/route.ts                # initiates OAuth2 redirect
│   │   ├── callback/route.ts             # OAuth2 callback
│   │   └── logout/route.ts               # destroys session + OIDC end-session
│   ├── (dashboard)/
│   │   ├── layout.tsx                    # patient header lives here
│   │   └── patient/[id]/
│   │       ├── page.tsx                  # dashboard with cards
│   │       ├── loading.tsx
│   │       ├── error.tsx
│   │       └── encounters/page.tsx
│   ├── api/health/route.ts
│   ├── layout.tsx
│   └── page.tsx                          # landing — redirect to OpenEMR home
├── lib/
│   ├── auth/
│   │   ├── oauth.ts                      # discovery + token exchange
│   │   ├── session.ts                    # iron-session wrapper
│   │   ├── pkce.ts
│   │   └── refresh.ts
│   ├── fhir/
│   │   ├── client.ts                     # fetch wrapper, retries, refresh-on-401
│   │   ├── queries.ts                    # typed query functions per resource
│   │   ├── search-params.ts
│   │   ├── extract.ts                    # pure helpers: formatPatientName, etc.
│   │   └── schemas.ts                    # Zod schemas for validation at boundary
│   └── log.ts
├── middleware.ts                         # auth check + reverse proxy fallback
├── components/
│   ├── PatientHeader.tsx
│   ├── cards/
│   │   ├── AllergiesCard.tsx
│   │   ├── ProblemsCard.tsx
│   │   ├── MedicationsCard.tsx
│   │   ├── PrescriptionsCard.tsx
│   │   └── CareTeamCard.tsx
│   ├── EncountersList.tsx
│   ├── EncountersPreview.tsx
│   └── ui/                               # shadcn-generated primitives
├── scripts/
│   └── register-client.ts                # one-shot OAuth2 client registration
├── tests/
│   ├── unit/
│   ├── integration/                      # MSW-mocked component tests
│   └── e2e/                              # Playwright
├── openemr-patches/
│   └── patient-summary-bridge-link.patch # tracks the PHP edit
├── .env.example
├── CLAUDE.md
├── README.md
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Working agreements

- **Phased delivery.** Complete each phase end-to-end (code, types, tests,
  manual smoke check) before starting the next.
- **Commits.** Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`). One logical change per commit. Never commit `.env` or anything
  in `.next/`.
- **Branches.** `main` for the trunk, feature branches per phase
  (`phase-1-auth`, `phase-2-fhir`, etc.).
- **Tests.** Every phase ships tests. No phase is "done" without them.
- **Type safety.** `strict: true`, `noUncheckedIndexedAccess: true`. No
  `any`. Validate FHIR responses with Zod before passing to typed code.
- **Error handling.** Every FHIR call has explicit handling for 401
  (refresh, retry once), 403 (surface "insufficient scope"), 404 (empty
  card with message), 5xx (error boundary with retry). Never crash the
  dashboard because one card 500'd.
- **Loading states.** Use Next.js `loading.tsx` for route segments and
  Suspense boundaries per card so cards stream in independently.
- **Accessibility.** All cards have semantic landmarks
  (`<section aria-labelledby>`). Skeletons have `aria-busy="true"`. Color
  contrast WCAG AA. Keyboard-only navigation reaches every interactive
  element.
- **Don't guess at OpenEMR behavior.** When in doubt about an API response,
  ask the user to run the call against the dev instance and paste the
  response. This is a real EHR — assumptions are expensive.
- **Don't expand scope.** If the user asks for write operations, more cards,
  or other PHP-page ports mid-implementation, push back. Finish the current
  phase first.

---

## 4. Reference: the existing PHP dashboard

Before writing code, read these files in the OpenEMR repo to understand
current behavior and field semantics. **Reading, not modifying** (except
the left-nav file in Phase 6).

| Section | PHP file | What to extract |
|---|---|---|
| Patient header | `interface/patient_file/summary/demographics.php` | Field labels, MRN format, active semantics |
| Clinical summary shell | `interface/patient_file/summary/stats_full.php` | Card ordering, empty-state copy |
| Allergies | `interface/patient_file/summary/stats.php` (allergies block) | Severity, reaction, status filter |
| Problem List | `interface/patient_file/summary/stats.php` (problems block) | Active vs resolved filter, ICD code display |
| Medications | `interface/patient_file/summary/stats.php` (meds block) | Dose/route/frequency formatting |
| Prescriptions | `interface/patient_file/erx.php`, `controllers/C_Prescription.class.php` | How prescriptions differ from medications |
| Care Team | `interface/patient_file/summary/care_team.php` | Role labels, primary indicator |
| Encounters | `interface/patient_file/encounter/encounters.php` | Sort order, columns shown |
| Left nav (where bridge link goes) | `interface/main/left_nav.php` | Locate where to insert the new-dashboard link |

You don't replicate the markup. You do replicate which fields are shown and
what the column semantics are.

### Note on Medications vs Prescriptions

In OpenEMR these are distinct concepts:

- **Medications** — what the patient is currently taking (medication list).
  In FHIR this maps to `MedicationStatement` (preferred) or filtered
  `MedicationRequest` with `intent=plan` and `status=active`.
- **Prescriptions** — what's been ordered/prescribed via the eRx workflow.
  In FHIR this is `MedicationRequest` with `intent=order`.

**Verify against the running dev instance** which resources OpenEMR's FHIR
server actually exposes. If `MedicationStatement` is not available in your
OpenEMR version, distinguish the two cards by filtering `MedicationRequest`
on `intent` and `status`. Document the choice in code comments.

---

## 5. Reference: OpenEMR API surface

Assume an OpenEMR dev instance running at `https://localhost:9300` with site
`default`. The dev instance must have API enabled (Administration → Globals
→ Connectors → "Enable OpenEMR Standard REST API" and "Enable OpenEMR FHIR
REST API").

### Base URLs

```
OAuth2:    https://localhost:9300/oauth2/default/
REST API:  https://localhost:9300/apis/default/api/
FHIR API:  https://localhost:9300/apis/default/fhir/
SMART:     https://localhost:9300/apis/default/fhir/.well-known/smart-configuration
OIDC:      https://localhost:9300/oauth2/default/.well-known/openid-configuration
```

Discover endpoints from the OIDC discovery document at runtime — don't
hardcode paths beyond the discovery URL.

### OAuth2 / OIDC endpoints (illustrative; discover at runtime)

```
Authorization:        /oauth2/default/authorize
Token:                /oauth2/default/token
Registration:         /oauth2/default/registration   (RFC 7591)
Introspection:        /oauth2/default/introspect
JWKS:                 /oauth2/default/jwk
End session (logout): /oauth2/default/logout         (verify path on your version)
```

### Scopes we need

```
openid fhirUser offline_access
user/Patient.read
user/AllergyIntolerance.read
user/Condition.read
user/MedicationRequest.read
user/MedicationStatement.read     (request; degrade gracefully if not granted)
user/CareTeam.read
user/Encounter.read
```

### FHIR resource → card mapping

| Card | FHIR query | Notes |
|---|---|---|
| Patient header | `GET /Patient/{id}` | Single resource |
| Allergies | `GET /AllergyIntolerance?patient={id}` | Filter `clinical-status=active` client-side; show resolved muted if expanded |
| Problem List | `GET /Condition?patient={id}&category=problem-list-item` | Sort by `recordedDate` desc |
| Medications | `GET /MedicationStatement?patient={id}&status=active` (preferred) **or** `GET /MedicationRequest?patient={id}&intent=plan&status=active` | See §4 note |
| Prescriptions | `GET /MedicationRequest?patient={id}&intent=order` | Sort by `authoredOn` desc, show status badge |
| Care Team | `GET /CareTeam?patient={id}&status=active` | Group participants by role |
| Encounters | `GET /Encounter?patient={id}&_sort=-date&_count=20` | Show class, type, period, participant |

### Headers

```
Authorization: Bearer <access_token>
Accept: application/fhir+json
```

---

## 6. Implementation plan

Each phase has explicit acceptance criteria. Do not start phase N+1 until
phase N's criteria are all checked.

### Phase 0 — Setup and OpenEMR prerequisites (target: < 2 hours)

**OpenEMR-side prerequisites (manual, user does these once):**

1. Confirm the OpenEMR dev instance is running at `https://localhost:9300`.
2. Enable Standard REST API and FHIR API in Administration → Globals →
   Connectors.
3. Verify `https://localhost:9300/apis/default/fhir/metadata` returns a FHIR
   CapabilityStatement.
4. Note a test patient's FHIR id. Record as `TEST_PATIENT_ID` and note the
   corresponding OpenEMR internal pid (for the Phase 6 bridge link).

**Next.js app setup:**

1. `pnpm create next-app openemr-dashboard --ts --tailwind --app --eslint`
2. Install runtime: `oauth4webapi`, `iron-session`, `@tanstack/react-query`,
   `@types/fhir`, `pino`, `pino-pretty`, `zod`, `react-hook-form`,
   `@hookform/resolvers`.
3. Install dev: `vitest`, `@vitest/ui`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@playwright/test`, `msw`, `tsx`.
4. Init shadcn/ui: `pnpm dlx shadcn@latest init`.
5. Add shadcn primitives: `card`, `badge`, `skeleton`, `alert`, `separator`,
   `avatar`, `tabs`, `table`.
6. Create `.env.example`:
   ```
   OPENEMR_BASE_URL=https://localhost:9300
   OPENEMR_SITE=default
   OAUTH_CLIENT_ID=
   OAUTH_CLIENT_SECRET=
   OAUTH_REDIRECT_URI=http://localhost:3000/callback
   SESSION_SECRET=                        # 32+ byte random string
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   TEST_PATIENT_ID=                       # FHIR id for dev
   TEST_PATIENT_PID=                      # OpenEMR internal pid for dev
   ```
7. Configure TypeScript strict mode and `noUncheckedIndexedAccess`.
8. Configure `next.config.ts` security headers (CSP, HSTS, X-Frame-Options,
   X-Content-Type-Options, Referrer-Policy).

**Acceptance:**
- [ ] `pnpm dev` shows the Next.js welcome page on `localhost:3000`.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.
- [ ] OpenEMR FHIR metadata endpoint returns 200.
- [ ] `TEST_PATIENT_ID` and `TEST_PATIENT_PID` are recorded in `.env.local`.

### Phase 1 — Authentication (target: 1–2 days)

1. Build `scripts/register-client.ts` — a one-shot Node script that POSTs to
   `/oauth2/default/registration` (RFC 7591) with the redirect URI, scopes,
   and `token_endpoint_auth_method: "client_secret_post"`. Prints
   `client_id` and `client_secret` to stdout. The user pastes these into
   `.env.local`. Note in README: this can also be done through OpenEMR's
   admin UI for teams that prefer it.
2. Build `lib/auth/pkce.ts` — `generateVerifier()`,
   `generateChallenge(verifier)`.
3. Build `lib/auth/oauth.ts` — discover OIDC config, build authorize URL,
   exchange code for tokens, refresh tokens, end-session URL builder. Use
   `oauth4webapi`.
4. Build `lib/auth/session.ts` — `iron-session` wrapper. Session shape:
   ```ts
   type Session = {
     accessToken: string;
     refreshToken: string;
     idToken: string;
     expiresAt: number;
     userId: string;            // sub from id_token
     fhirUser?: string;
     state?: string;            // OAuth state during redirect
     codeVerifier?: string;     // PKCE verifier during redirect
   };
   ```
5. Implement routes:
   - `app/(auth)/login/route.ts` — GET. Generates state and PKCE, stashes
     them in session, redirects to OpenEMR authorize URL.
   - `app/(auth)/callback/route.ts` — GET. Validates state, exchanges code
     for tokens, persists session, redirects to
     `/patient/{TEST_PATIENT_ID}`.
   - `app/(auth)/logout/route.ts` — GET. Destroys session, redirects to
     OpenEMR end-session endpoint with `id_token_hint`. OpenEMR clears its
     session and redirects back to `/`.
6. Build `lib/auth/refresh.ts` — given an expired access token, use the
   refresh token to get a new one. Update the session.
7. Build `middleware.ts` — for any path under `(dashboard)`, check session;
   if missing or expired (and refresh fails), redirect to `/login`. (Reverse
   proxy fallback comes in Phase 2.)

**Acceptance:**
- [ ] `pnpm tsx scripts/register-client.ts` registers a client and prints
      credentials.
- [ ] Visiting `/login` redirects to OpenEMR's authorize endpoint.
- [ ] After logging in via OpenEMR's PHP login screen, callback succeeds,
      session is set, browser is redirected to
      `/patient/{TEST_PATIENT_ID}` showing a placeholder "logged in as
      {fhirUser}".
- [ ] **Silent re-auth check:** Log into OpenEMR's PHP UI in one tab. Open
      `/patient/{TEST_PATIENT_ID}` in another. The dashboard loads without a
      second login prompt.
- [ ] Tokens are not visible in browser devtools (Network requests to
      OpenEMR show no Authorization header from the browser; Application
      tab shows no tokens in storage).
- [ ] `/logout` clears the Next.js session, redirects through OpenEMR's
      end-session endpoint, and the PHP UI is also logged out (verify by
      opening an OpenEMR PHP page and confirming redirect to login).
- [ ] Unit tests: PKCE generation, session round-trip, refresh on expiry.
- [ ] Manual: stop and restart the server, hit `/patient/{id}` — middleware
      redirects to `/login`.

### Phase 2 — Reverse proxy + FHIR client (target: 1 day)

**Reverse proxy in middleware:**

1. Extend `middleware.ts` so that for any request **not** matched by a
   Next.js route (and not `/oauth2/*`, `/apis/*`, `/_next/*`, or static
   assets), the request is proxied to the OpenEMR Apache backend
   (`OPENEMR_BASE_URL`).
2. Preserve cookies, headers, request body, and method. Stream responses
   back. Do not buffer.
3. Pass the OpenEMR PHP session cookie through unchanged so the shared
   session works.
4. Document in README: phase one uses Next.js as the proxy; for production
   replace with nginx or Caddy in front (out of scope here, document the
   future config).

**FHIR client:**

1. Build `lib/fhir/client.ts`:
   - `fhirGet<T>(path, searchParams)` returns parsed JSON typed as the FHIR
     resource. Adds Authorization header from session.
   - On 401: call refresh, retry once. Second 401 → throw
     `AuthExpiredError`.
   - On 5xx: retry once with backoff. Then throw `FhirServerError`.
   - On network error: throw `FhirNetworkError`.
   - Logs every call (user, patient, resource, status, duration). No
     bodies, no tokens.
2. Build `lib/fhir/schemas.ts` — Zod schemas for each resource and Bundle
   we consume. Validate at the boundary in `fhirGet`. Schema validation
   failure is a logged warning, not a hard error — render best effort and
   surface "data quality issue" in the UI footer.
3. Build `lib/fhir/queries.ts` — typed query functions:
   ```ts
   getPatient(id: string): Promise<fhir4.Patient>
   getAllergies(patientId: string): Promise<fhir4.Bundle>
   getProblems(patientId: string): Promise<fhir4.Bundle>
   getMedications(patientId: string): Promise<fhir4.Bundle>
   getPrescriptions(patientId: string): Promise<fhir4.Bundle>
   getCareTeam(patientId: string): Promise<fhir4.Bundle>
   getEncounters(patientId: string, count?: number): Promise<fhir4.Bundle>
   ```
4. Build `lib/fhir/extract.ts` — pure helpers: `formatPatientName(patient)`,
   `formatCodeableConcept(cc)`, `formatPeriod(period)`,
   `extractMRN(patient)`, etc. Heavily reused.

**Acceptance:**
- [ ] Hitting any unmatched route (e.g.,
      `/interface/main/main_screen.php`) while logged in proxies through to
      OpenEMR's Apache and renders the PHP page successfully.
- [ ] OAuth2 endpoints (`/oauth2/*`) and API endpoints (`/apis/*`) proxy
      correctly.
- [ ] Each FHIR query function works against the live OpenEMR dev instance
      for the test patient.
- [ ] Unit tests with mocked fetch: success, 401-then-refresh-then-success,
      404, malformed Bundle, schema validation failure.
- [ ] All queries are typed end-to-end (no `any`).

### Phase 3 — App shell + Patient header (target: half a day)

1. `app/(dashboard)/layout.tsx` — server component. Fetches the patient by
   the `[id]` route param and renders the persistent header above
   `{children}`.
2. `components/PatientHeader.tsx`:
   - Name (formatted from `Patient.name`, prefer `use=official`)
   - DOB + computed age
   - Sex (`Patient.gender`)
   - MRN (`Patient.identifier` where `type.coding[0].code === 'MR'`)
   - Active status badge (`Patient.active`) — green "Active" / gray
     "Inactive"
3. Loading state via `loading.tsx` showing a skeleton header.
4. Error boundary via `error.tsx` showing a recoverable error UI.

**Acceptance:**
- [ ] Header renders for the test patient with all five fields populated.
- [ ] Header persists when navigating between dashboard sub-routes.
- [ ] Skeleton appears during initial load.
- [ ] Component test with mocked Patient resource covering: missing name
      parts, missing MRN identifier, `active=false`.
- [ ] Keyboard-only navigation reaches every interactive element.

### Phase 4 — Clinical cards (target: 2–3 days)

Build all five cards. Each is a Server Component for initial fetch, wrapped
in a Suspense boundary so cards stream independently. Each card:

- Has its own loading skeleton.
- Has its own error boundary that shows a small "Couldn't load Allergies —
  retry" state without taking down the dashboard.
- Shows an empty state with copy from the PHP equivalent.
- Has a component test (Vitest + Testing Library + MSW) covering empty,
  single-item, many-items, and malformed-item cases.

#### Card data points

| Card | Required fields | Sort | Empty state |
|---|---|---|---|
| Allergies | Substance, Reaction, Severity, Status | Status (active first) | "No known allergies" |
| Problems | Description, ICD code, Onset date, Status | Recorded date desc | "No active problems" |
| Medications | Name, Dose, Route, Frequency, Status | Status, then name | "No active medications" |
| Prescriptions | Medication, Dose instruction, Status, Authored date | Authored date desc | "No prescriptions on file" |
| Care Team | Member name, Role, Primary indicator | Primary first, then name | "No care team assigned" |

Layout: 12-column responsive grid. On `lg`+: 2 columns of cards. On `md`:
single column. Header always full width.

**Acceptance:**
- [ ] All five cards render real data for the test patient.
- [ ] Cards stream in independently — slow card doesn't block fast cards.
- [ ] Each card has a component test (4 cases each).
- [ ] One card failing (mock a 500) does not break the others.
- [ ] All cards have proper landmark roles and labelled headings.

### Phase 5 — Encounters section (target: half a day)

1. `components/EncountersPreview.tsx` — preview card on the dashboard
   showing the latest 3 encounters with a "View all" link.
2. `app/(dashboard)/patient/[id]/encounters/page.tsx` — full list, up to 20
   most recent.
3. `components/EncountersList.tsx` — table with columns: Date, Class, Type,
   Provider, Status.

**Acceptance:**
- [ ] Dashboard shows "Recent encounters" preview with up to 3 entries.
- [ ] `/patient/{id}/encounters` shows up to 20 with same columns.
- [ ] Empty state copy if none.
- [ ] Component test for both views.

### Phase 6 — PHP bridge link + polish (target: 1 day)

**PHP edit (small, tracked separately):**

1. In a fork or branch of `openemr/openemr`, edit
   `interface/main/left_nav.php` (or the most appropriate left-nav include)
   to add a "New Dashboard" link that opens `/patient/{pid}` in the same
   window. The `pid` here is OpenEMR's internal patient id; the FHIR id may
   differ. The new dashboard accepts the OpenEMR pid in the URL and
   resolves to the FHIR Patient resource server-side (in
   `app/(dashboard)/layout.tsx` or a route handler), looking up by
   identifier.
2. Save the diff as
   `openemr-patches/patient-summary-bridge-link.patch` in this repo.
   Document the apply procedure in the README.

**Polish:**

1. Playwright e2e: full login → dashboard render → all cards visible →
   click "View all encounters" → encounter list → logout. Use a seeded
   test patient.
2. README: setup steps, env var docs, how to run against a dev OpenEMR
   instance, how to apply the PHP patch, how to run tests.
3. `CLAUDE.md` committed at repo root (see §8).
4. Lighthouse audit on dashboard route — Performance ≥ 90, Accessibility ≥
   95, Best Practices ≥ 95.
5. Verify CSP headers in production build (`pnpm build && pnpm start`).

**Acceptance:**
- [ ] PHP bridge link appears in OpenEMR's left nav and navigates to the
      new dashboard for the current patient.
- [ ] All Playwright e2e tests pass.
- [ ] README walks a new dev from clone → running dashboard in < 15
      minutes.
- [ ] Lighthouse targets met.
- [ ] No `any` types remain.

---

## 7. Out of scope — say no to scope creep

If the user asks for any of these mid-implementation, push back and finish
the current phase first:

- Editing or writing any clinical data
- Patient search / picker UI in the new app
- Print views or PDF generation
- Multi-language / i18n
- Real-time updates / SSE / websockets
- Replacing other PHP pages (encounters editor, billing, scheduling,
  charting)
- Production-grade reverse proxy (nginx/Caddy)
- SMART on FHIR EHR Launch
- Mobile native app

These are all real and valuable. They are phase two or later.

---

## 8. CLAUDE.md (commit this to the new repo)

Save the following at the repo root as `CLAUDE.md`:

```md
# OpenEMR Patient Dashboard — Claude Code Context

This is phase one of replacing OpenEMR's PHP UI with Next.js. Currently
ships a read-only patient dashboard. Future phases port more PHP pages
incrementally.

## Migration pattern
Strangler fig with shared hostname. Next.js middleware proxies unmatched
routes to OpenEMR's Apache. URLs stay stable. Authentication is OAuth2
against OpenEMR's auth server, with shared sessions so users log in once.

## Tech stack (locked)
Next.js 15+ · App Router · TypeScript strict · Tailwind · shadcn/ui ·
TanStack Query · oauth4webapi · iron-session · Zod · React Hook Form ·
pino · Vitest · Playwright · MSW

## Security non-negotiables
- Tokens never reach the browser. Server-side encrypted session only.
- All FHIR calls happen server-side.
- No `any`, no `dangerouslySetInnerHTML`, no inline scripts.
- Validate FHIR responses with Zod at the boundary.
- Logout coordinates with OpenEMR via OIDC end-session.

## Working agreements
- Conventional commits.
- Phased delivery — finish a phase before starting the next.
- Every phase ships tests.
- When unsure about OpenEMR API behavior, ask the user to run the call
  against their dev instance and paste the response. Don't guess.

## Where things live
- `lib/auth/` — OAuth2 + session
- `lib/fhir/` — typed FHIR client, queries, Zod schemas
- `middleware.ts` — auth check + reverse proxy fallback
- `components/cards/` — clinical cards
- `app/(dashboard)/` — authed routes
- `app/(auth)/` — login / callback / logout

## Common commands
- `pnpm dev` — dev server (also acts as reverse proxy for OpenEMR)
- `pnpm test` — Vitest unit + integration
- `pnpm test:e2e` — Playwright
- `pnpm typecheck` — tsc --noEmit
- `pnpm lint` — eslint

## Out of scope — refuse and refer to PROMPT.md §7
Editing data · patient search · billing · scheduling · charting · other
PHP-page ports · production-grade proxy · SMART EHR Launch.
```

---

## 9. Kickoff prompt (paste into Claude Code at session start)

> I'm porting OpenEMR's patient dashboard to Next.js as phase one of a
> larger migration that will eventually replace OpenEMR's PHP frontend.
> The migration uses the strangler fig pattern with a shared hostname.
> Read `PROMPT.md` in this directory before doing anything else — it locks
> the architecture, security posture, file layout, and phased plan. Then
> read `CLAUDE.md` if it exists.
>
> Start with **Phase 0 — Setup and OpenEMR prerequisites** from §6. Stop
> when Phase 0's acceptance criteria are all green. Show me the output,
> then wait for me to confirm before starting Phase 1.
>
> Three things I need from you up front, before any code:
>
> 1. Confirm you've read `PROMPT.md` by summarizing the migration pattern
>    (Pattern A) and the security non-negotiables in your own words.
> 2. List the env vars you'll need me to fill in before Phase 1 can run.
> 3. Confirm the OpenEMR-side prerequisites in §6 Phase 0 (API enabled,
>    FHIR metadata reachable, test patient ids) — flag anything I need to
>    verify on the OpenEMR instance.
>
> No code yet. Just the confirmation, env list, and prerequisite checklist.
