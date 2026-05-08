# Session history
> claude --resume 77c3038d-2b8c-454b-b19d-9538096d832a

## 2026-05-08 — Phase 0–6 build-out

Phase one of the OpenEMR PHP→Next.js migration shipped end-to-end in
one session against an OpenEMR 8.1.1 dev instance at
`https://localhost:9300`.

### Outcome

All six phases on `main`, six `--no-ff` merges preserving the phase
boundary in the history:

```
99f706e Merge phase 6: PHP bridge link + polish
86fc728 Merge phase 5: Encounters preview + full Encounters page
1ab8015 Merge phase 4: five clinical cards streaming via Suspense
75e20a6 Merge phase 3: app shell + persistent patient header
1ac8642 Merge phase 2: reverse proxy + FHIR client
e3e5868 Merge phase 1: OAuth2 + iron-session + middleware auth gate
3bc51e0 chore: phase 0 — scaffold Next.js app and tooling
```

102 unit tests + 1 Playwright e2e (env-gated). `tsc --noEmit` clean,
`eslint` clean, no `any` in app code.

### What was built (per phase)

**Phase 0 — Setup** (Node 22 LTS via nvm, pnpm 11 via corepack,
Next.js 16.2.5, Tailwind 4, shadcn/ui base-nova, vitest + Playwright +
MSW, Zod-validated env at `lib/env.ts`, scoped CSP/HSTS/etc. in
`next.config.ts`).

**Phase 1 — Auth** (OAuth2 Auth Code + PKCE via `oauth4webapi`;
`iron-session` cookie holding only a session id + transient PKCE
state; tokens in an in-memory `globalThis`-pinned `Map` so they
never reach the browser; middleware gating `/patient/*`; OIDC
end-session logout).

**Phase 2 — Proxy + FHIR** (reverse-proxy in `middleware.ts` →
`lib/proxy.ts` for unmatched routes, with multi-hop redirect
Location rewriting; typed FHIR client at `lib/fhir/client.ts` with
audit logging, refresh-on-401, retry-on-5xx, Zod boundary validation
that fails-soft to best-effort render; 7 query functions; pure
extract helpers).

**Phase 3 — Shell** (`PatientHeader` with name/DOB+age/sex/MRN-or-
External-ID/active badge; route-segment loading skeleton, error
boundary with AuthExpiredError branch, not-found).

**Phase 4 — Cards** (Allergies, Problem List, Medications,
Prescriptions, Care Team — each a Server Component fetching FHIR,
each wrapped in a `CardShell` providing per-card Suspense + a
class-based error boundary; pure `{Card}View` exports for testing
in isolation).

**Phase 5 — Encounters** (preview card on dashboard with 3 latest
+ "View all" link; full `/patient/[id]/encounters` page with up to
20; shared `EncountersList` shadcn-Table renderer).

**Phase 6 — Polish** (README onboarding walkthrough, CLAUDE.md from
PROMPT.md §8, OpenEMR PHP bridge link as a snippet+apply-guide,
Playwright e2e smoke, production CSP verified strict, debug scaffolds
removed).

### OpenEMR 8.1.x quirks discovered (saved to project memory)

| Finding | Workaround | Memory file |
|---|---|---|
| `MedicationStatement` not exposed by FHIR server | Medications card uses `MedicationRequest?intent=plan&status=active` | `project_openemr_api_surface.md` |
| `Condition.category` not in resource searchParams (only present in scope grammar) | Send `category=` as a hint, then unconditionally re-filter client-side | `project_openemr_api_surface.md` |
| `token_endpoint_auth_method`: OIDC says `client_secret_post` only; SMART says `client_secret_basic` + `private_key_jwt` | Used `client_secret_post` per OIDC discovery — works | `project_openemr_api_surface.md` |
| OAuth2-login → PHP-session is **not** automatic (one-way SSO) | PHP→OAuth2 silent works (Phase 1 acceptance); reverse direction needs a separate PHP login or a Phase-2 bridge | `project_openemr_sso_directionality.md` |
| FHIR `Patient.identifier` only exposes pubpid (PT type), not internal pid | Phase 6 bridge link uses pubpid for now; production should resolve pid via OpenEMR REST API | `project_openemr_api_surface.md` |

### Real bugs hit + fixed during the build

1. **`/callback` 502 "Invalid URL"** — passing `req.nextUrl` (a
   Next.js `NextURL`) to `oauth4webapi.validateAuthResponse` fails
   the lib's `instanceof URL` check. Fix: re-wrap as `new URL(req.url)`.
2. **`/callback` 500 "Cookie length too big (4802 bytes)"** —
   OpenEMR's encrypted opaque tokens combined exceed the 4 KB cookie
   limit. Fix: server-side in-memory token store keyed by sid;
   cookie carries only `{ sid, state, codeVerifier, nonce, returnTo }`.
3. **Middleware doesn't see tokens after `/callback` succeeds** —
   Next.js loads middleware and route handlers as separate module
   instances under Turbopack, so a plain `const store = new Map()`
   becomes two unconnected Maps. Fix: pin the Map on `globalThis`.
4. **All cards crash with "Functions cannot be passed directly to
   Client Components"** — `CardShell` (Server Component) was passing
   an arrow function as `fallback` to `CardErrorBoundary` (Client
   Component); React 19 won't serialize functions across the
   server→client boundary. Fix: bake the error UI into
   `CardErrorBoundary` itself, take `title` as a plain string prop.
5. **Reverse-proxy `Invalid URL` on PHP redirects** — Next.js
   `Response` rejects relative `Location` headers as malformed.
   OpenEMR's PHP sends them constantly. Fix: in proxy header copy,
   resolve relative Locations against `req.url` (yields absolute on
   our `:3000` origin) and rewrite OpenEMR-host absolute Locations
   to our origin so the browser stays in the proxy.

### Architecture decisions worth remembering

- **Next 16 over 15.** PROMPT.md said "Next.js 15+" — `create-next-app@latest`
  defaulted to 16.2.5. Cosmetic `middleware` → `proxy` rename will
  be needed eventually (Next 16 deprecation warning), but the
  middleware API still works.
- **In-memory token store, not cookie chunking.** Strictly stronger
  security (tokens never serialize to a cookie at all) and dev
  ergonomics are fine; production swap for Redis is documented.
- **`oauth4webapi` over Auth.js.** Smaller surface, no framework
  lock-in, spec-compliant.
- **Zod fails soft, not loud.** Schema validation at the FHIR
  boundary logs a warning and returns the raw payload — "data quality
  issue" surfaces in the UI footer (Phase 4 polish).
- **Per-card Suspense + class error boundary.** Cards stream
  independently; one card's failure doesn't take down the dashboard.
- **Scoped TLS dispatcher.** Disable cert verification *only* for
  `OPENEMR_BASE_URL` in non-prod (via `undici.Agent` per-fetch),
  not the global `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **Security headers scoped to app routes only.** Strict CSP would
  break OpenEMR's PHP UI inline scripts when proxied. Production
  hardening: ports the PHP UI away, then unify CSP across the host.

### Test patient

OpenEMR seed `Hoppe518, Dirk334` (DOB 1983-12-06):
- FHIR `Patient.id`: `a1b77856-fda0-4c4b-a5b8-6333a329585c` →
  `TEST_PATIENT_ID`
- pubpid: `66` → `TEST_PATIENT_PID` (placeholder until pid resolved
  in Phase 6+ via REST API)
- Counts: 0 allergies, 25 problems (problem-list-item), 2 active
  medications, 6 prescriptions, 0 care team, 20 encounters.

### Phase-two-and-beyond TODO list

1. Swap the in-memory token store for Redis.
2. Replace Next.js-middleware proxy with nginx/Caddy.
3. Investigate full bidirectional SSO so OAuth2-login also seeds
   the PHP session.
4. Resolve true OpenEMR `pid` (not just `pubpid`) for the Phase 6
   bridge link.
5. Lighthouse audit on the dashboard (target ≥ 90 / ≥ 95 / ≥ 95).
6. Migrate `middleware.ts` → `proxy.ts` per Next 16 deprecation.
7. Port more PHP pages (encounter editor, billing, scheduling,
   charting) — incremental strangler-fig continues.
