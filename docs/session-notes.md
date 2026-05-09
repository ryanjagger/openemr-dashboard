## 2026-05-09 OpenEMR <-> Dashboard embedded auth hardening

Goal: stabilize SSO/session behavior between OpenEMR PHP tabs and `openemr-dashboard` when rendering the Next.js patient route inside OpenEMR tab controls.

### What we implemented

- Added/validated launch handoff path in dashboard auth flow:
  - `/launch` -> `/login` -> OpenEMR `/oauth2/default/authorize`
  - launch context propagated (`launch`, `iss`, `aud`) with `autosubmit=1`
  - launch scope appended when launch param exists
- OpenEMR New Dashboard patient menu now builds launch-aware URLs to embedded route:
  - `/launch?patient=<uuid>&returnTo=/embed/patient/<uuid>&launch=...&iss=...&aud=...`
  - uses `top.navigateTab(..., 'ndb', ...)` with fallback to full navigation
- Added dedicated embed route in dashboard:
  - `app/(dashboard)/embed/patient/[id]/layout.tsx`
  - `app/(dashboard)/embed/patient/[id]/page.tsx` reuses main patient page
- Fixed Next.js runtime export issue on embed page:
  - cannot re-export `runtime`; now exports local `runtime = "nodejs"`
- Updated security headers for embed/auth bridge routes in `next.config.ts`:
  - `/embed/:path*`, `/launch`, `/login`, `/callback` allow framing from OpenEMR origins
  - removed `X-Frame-Options` on those routes (kept strict framing on non-embed routes)
- Fixed iframe auth state continuity in dashboard session cookies:
  - cross-origin embed mode uses `SameSite=None` + secure cookie behavior
  - keeps regular `SameSite=Lax` behavior when not cross-origin
- Removed temporary debug instrumentation after verification:
  - OpenEMR `AuthorizationController` and `PatientMenuRole` debug probes
  - dashboard request-level launch/login debug traces
- UX tweaks:
  - OpenEMR tab fallback title now labels dashboard tab as `New Dashboard` instead of `Unknown` for cross-origin iframe cases
  - removed dashboard header links: `Back to OpenEMR` and `Sign out`
  - removed `BackToOpenEMRButton.tsx`, updated unit/e2e tests accordingly

### Root cause found during debugging

- Launch flow was initially correct, but callback sometimes fell back to plain `/login` due to missing PKCE/state in iframe context.
- Also hit framing blocks because `/login`/`/callback` were still strict-framed while embed route was relaxed.
- Combined fix required:
  1) embed-friendly headers on auth bridge routes, and
  2) cross-site cookie settings for embedded auth roundtrip.

### Current status

- Embedded New Dashboard tab launches and authenticates successfully from OpenEMR.
- Dashboard tab title is readable (`New Dashboard`).
- Header no longer shows Back/Sign-out links.
