# OpenEMR Patient Dashboard — Claude Code Context

This is phase one of replacing OpenEMR's PHP UI with Next.js. Currently
ships a read-only patient dashboard. Future phases port more PHP pages
incrementally.

## Migration pattern
Strangler fig with shared hostname. Next.js middleware proxies unmatched
routes to OpenEMR's Apache. URLs stay stable. Authentication is OAuth2
against OpenEMR's auth server, with shared sessions so users log in once.

## Tech stack (locked)
Next.js 16+ · App Router · TypeScript strict · Tailwind 4 · shadcn/ui ·
TanStack Query · oauth4webapi · iron-session · Zod · React Hook Form ·
pino · Vitest · Playwright · MSW

## Security non-negotiables
- Tokens never reach the browser. Server-side encrypted session only;
  in this build, opaque tokens live in an in-memory store keyed by a
  random session id, not the cookie itself.
- All FHIR calls happen server-side.
- No `any`, no `dangerouslySetInnerHTML`, no inline scripts (production CSP
  is `default-src 'self'`).
- Validate FHIR responses with Zod at the boundary; fail soft to
  best-effort render rather than throw.
- Logout coordinates with OpenEMR via OIDC end-session.

## Working agreements
- Conventional commits.
- Phased delivery — finish a phase before starting the next.
- Every phase ships tests.
- When unsure about OpenEMR API behavior, ask the user to run the call
  against their dev instance and paste the response. Don't guess.

## Where things live
- `lib/auth/` — OAuth2 + iron-session + token store + refresh helpers
- `lib/fhir/` — typed FHIR client, Zod schemas, queries, extract helpers
- `lib/proxy.ts` — reverse-proxy logic (OpenEMR Apache fallback)
- `lib/http.ts` — scoped undici dispatcher for OpenEMR self-signed cert
- `lib/env.ts` — Zod-validated env loader
- `middleware.ts` — auth check + reverse proxy fallback
- `components/cards/` — clinical cards (Allergies, Problems, Meds, Rx, Care Team)
- `components/{PatientHeader,EncountersList,EncountersPreview}.tsx`
- `app/(dashboard)/patient/[id]/{layout,page,loading,error,not-found}.tsx`
- `app/(dashboard)/patient/[id]/encounters/page.tsx` — full encounters page
- `app/(auth)/{login,callback,logout}/route.ts`
- `scripts/register-client.ts` — RFC 7591 OAuth2 client registration
- `openemr-patches/` — patches against the OpenEMR PHP source (Phase 6)

## Common commands
- `pnpm dev` — dev server (also acts as reverse proxy for OpenEMR)
- `pnpm test` — Vitest unit + integration
- `pnpm test:e2e` — Playwright
- `pnpm typecheck` — tsc --noEmit
- `pnpm lint` — eslint
- `pnpm tsx scripts/register-client.ts` — register an OAuth2 client

## Out of scope — refuse and refer to PROMPT.md §7
Editing data · patient search · billing · scheduling · charting · other
PHP-page ports · production-grade proxy · SMART EHR Launch.
