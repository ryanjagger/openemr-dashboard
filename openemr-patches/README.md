# OpenEMR PHP patches

Patches against the upstream OpenEMR PHP source that the new dashboard
relies on. Apply on a fork/branch of [openemr/openemr](https://github.com/openemr/openemr),
not in this repo.

## Index

| File | What it does |
|---|---|
| [`patient-summary-bridge-link.patch`](./patient-summary-bridge-link.patch) | Wires OpenEMR patient menu "New Dashboard" to launch-aware embedded dashboard tabs and adds a friendly tab-title fallback. |

## Why these aren't strict `git apply`-able diffs

OpenEMR source locations and surrounding blocks can drift between versions.
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

# Make the edits, then commit on your fork.
git add src/Menu/PatientMenuRole.php interface/main/tabs/js/custom_bindings.js
git commit -m "feat(nav): launch-aware embedded new dashboard tab bridge"
```

## Configuration

The bridge link reads its target URL from OpenEMR's globals at
`new_dashboard_url`. Set it in **Administration → Globals → System**
(or wherever your build exposes the globals UI), defaulting to
`http://localhost:3000` for local dev.
