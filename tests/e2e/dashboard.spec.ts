import { expect, test } from "@playwright/test";

/**
 * End-to-end smoke per PROMPT.md §6 Phase 6:
 *   login → dashboard render → all cards visible → click "View all
 *   encounters" → encounter list.
 *
 * Driven by env vars so the test is portable across OpenEMR dev
 * instances and skipped on machines that don't have the right setup.
 *
 *   E2E_USERNAME       OpenEMR login (e.g. admin)
 *   E2E_PASSWORD       OpenEMR password
 *   TEST_PATIENT_ID    FHIR Patient.id of the seeded test patient
 *   TEST_PATIENT_NAME  Substring expected in the patient header
 *                       (e.g. "Hoppe518" for the OpenEMR seed). Optional.
 */
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
const patientId = process.env.TEST_PATIENT_ID;
const patientName = process.env.TEST_PATIENT_NAME;

test.describe("dashboard smoke", () => {
  test.skip(
    !username || !password || !patientId,
    "E2E_USERNAME / E2E_PASSWORD / TEST_PATIENT_ID not set — skipping smoke",
  );

  test("login → dashboard → encounters", async ({ page }) => {
    // ── Login ─────────────────────────────────────────────────────────
    // Navigate to the dashboard directly. The middleware's auth gate
    // bounces us through /login with returnTo set, and the callback
    // sends us back here after OAuth completes.
    await page.goto(`/patient/${patientId}`);

    // OpenEMR's PHP login form. Field names are stable across 8.1.x:
    // #authUser and #clearPass on /oauth2/default/provider/login.
    await page.locator("#authUser").fill(username!);
    await page.locator("#clearPass").fill(password!);
    await page.getByRole("button", { name: /log in|sign in|login/i }).click();

    // OpenEMR scope-authorize-confirm screen, if shown. Click Authorize.
    const authorizeBtn = page.getByRole("button", {
      name: /authorize|allow|continue/i,
    });
    if (await authorizeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await authorizeBtn.click();
    }

    // ── Dashboard render ──────────────────────────────────────────────
    await page.waitForURL(new RegExp(`/patient/${patientId}`), {
      timeout: 30_000,
    });

    // Optional: patient name shows up in the header.
    if (patientName) {
      await expect(
        page.getByTestId("patient-name"),
      ).toContainText(patientName);
    }

    // All five clinical cards + the encounters preview render.
    for (const title of [
      "Allergies",
      "Problem List",
      "Medications",
      "Prescriptions",
      "Care Team",
      "Recent Encounters",
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }

    // ── Encounters ────────────────────────────────────────────────────
    // "View all" only renders when the patient has any encounters; if
    // present, follow it to the full list.
    const viewAll = page.getByRole("link", { name: /view all/i });
    if (await viewAll.isVisible().catch(() => false)) {
      await viewAll.click();
      await page.waitForURL(/\/encounters$/, { timeout: 10_000 });
      await expect(
        page.getByRole("heading", { name: /encounters/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /back to dashboard/i }),
      ).toBeVisible();
    }

  });
});
