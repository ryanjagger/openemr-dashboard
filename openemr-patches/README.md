# OpenEMR PHP patches

Patches against the upstream OpenEMR PHP source that the new dashboard
relies on. Apply on a fork/branch of [openemr/openemr](https://github.com/openemr/openemr),
not in this repo.

## Index

| File | What it does |
|---|---|
| [`patient-summary-bridge-link.patch`](./patient-summary-bridge-link.patch) | Adds a "New Dashboard" link to OpenEMR's patient left-nav. Opens the new Next.js dashboard for the patient currently in context. |

## Why these aren't strict `git apply`-able diffs

OpenEMR's `interface/main/left_nav.php` (and the theme-specific
includes that render the patient nav block) drift between versions.
Rather than ship a unified diff that will fail on any release except
the one it was authored against, each patch in this directory is a
**snippet + apply guide** — you locate the right file/insertion point
in your build and apply by hand or with `git apply --reject`.

## How to apply (general flow)

```bash
# In your OpenEMR checkout (NOT this dashboard repo):
cd path/to/openemr
git checkout -b new-dashboard-bridge

# Read the .patch file in this directory — it contains the exact
# PHP snippet to add and notes on where to put it.
$EDITOR path/to/openemr-dashboard/openemr-patches/patient-summary-bridge-link.patch

# Make the edit, then commit on your fork.
git add interface/main/left_nav.php
git commit -m "feat(nav): bridge link to new Next.js dashboard"
```

## Configuration

The bridge link reads its target URL from OpenEMR's globals at
`new_dashboard_url`. Set it in **Administration → Globals → System**
(or wherever your build exposes the globals UI), defaulting to
`http://localhost:3000` for local dev.
