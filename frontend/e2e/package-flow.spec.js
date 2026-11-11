import { expect, test } from "@playwright/test";

// The full Phase B flow: build a 2-night package, see the live backend quote,
// save it to the server, open the itinerary studio for the saved package, and
// confirm the A4 print preview shows no controls and no supplier costs.
// Requires the backend on :8000 (started by CI before this job).

const trip = {
  title: "A quiet corner of Kyoto",
  destination: "kyoto-japan",
};

test("build, quote, save, open studio, print preview", async ({ page }) => {
  await page.goto("/app/packages");
  await expect(page.getByRole("heading", { name: /package builder/i })).toBeVisible();

  // Step 1 — Trip
  await page.getByLabel("Package name").fill(trip.title);
  await page.getByLabel("Destination").selectOption(trip.destination);
  await page.getByLabel("Departure date").fill("2026-12-10");
  await page.getByLabel("Number of nights").fill("2");
  await page.getByLabel("Travellers").fill("2");
  await page.getByRole("button", { name: /^continue/i }).click();

  // Step 2 — Stay: pick the first listed stay for the destination
  await page.getByRole("button", { name: /^0?2\s*stay$/i }).click();
  const stayAdd = page.getByRole("button", { name: /^add /i }).first();
  await expect(stayAdd).toBeVisible({ timeout: 30_000 }); // inventory may still be loading
  await stayAdd.click();

  // Step 5 — Review: the live quote (never invented) must appear
  await page.getByRole("button", { name: /review$/i }).click();
  await expect(page.getByText(/per traveller/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/net/i)).toBeVisible(); // net cost is private but present in the agent view

  // Save to the server
  await page.getByRole("button", { name: /save package/i }).click();
  await expect(page.getByText(/saved to the server/i)).toBeVisible({ timeout: 30_000 });

  // Open the itinerary studio for the saved package
  await page.getByRole("button", { name: /open itinerary preview/i }).click();
  await expect(page).toHaveURL(/itinerary-studio\?package=PKG-/);
  await expect(page.getByRole("heading", { name: new RegExp(trip.title, "i") })).toBeVisible();

  // Customer view: selling price only, never net cost or margin
  await expect(page.getByText(/price per traveller/i)).toBeVisible();
  await expect(page.getByText(/^net$/i)).toHaveCount(0);
  await expect(page.getByText(/^margin$/i)).toHaveCount(0);

  // A4 print preview: chrome hides, the paper fills the page
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".itinerary-brand-editor")).toBeHidden();
  await expect(page.locator(".itinerary-paper")).toBeVisible();
});
