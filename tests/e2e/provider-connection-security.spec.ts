import { expect, test } from "@playwright/test";

test("Streamer.bot setup requires authentication choice and rejects unsafe connection fields", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/auth/management/sessions", route => route.fulfill({ json: { id: "mgmt_provider_security", csrfToken: "csrf_provider_security" } }));
  await page.route("**/management/providers?*", route => route.fulfill({ json: [] }));
  await page.route("**/management/providers/validate", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { valid: true, connectionState: "connected", intakeState: "inactive", validatedAt: "2026-10-03T12:00:00.000Z", availableVoices: [], error: null } });
  });
  await page.goto("/manage/event-sources");
  await page.getByRole("button", { name: "Add event source" }).click();
  await page.getByLabel("Provider type").selectOption("streamerbot");
  await page.getByRole("button", { name: "Continue" }).click();
  const consent = page.getByRole("checkbox", { name: "Allow an unauthenticated local connection" });
  const testConnection = page.getByRole("button", { name: "Test connection" });
  await expect(consent).not.toBeChecked();
  await expect(testConnection).toBeDisabled();
  await expect(page.getByText(/Enable Authentication and Enforce/u)).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("temporary-test-password");
  await expect(testConnection).toBeEnabled();
  await page.getByLabel("Password", { exact: true }).fill("");
  await expect(testConnection).toBeDisabled();
  await consent.check();
  await page.getByLabel("Host", { exact: true }).fill("user:credential-sentinel@example.com");
  await testConnection.click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(requests).toEqual([]);
  await expect(page.getByRole("alert")).not.toContainText("credential-sentinel");
  await page.getByLabel("Host", { exact: true }).fill("127.0.0.1");
  await page.getByLabel("Endpoint", { exact: true }).fill("/?token=credential-sentinel");
  await testConnection.click();
  expect(requests).toEqual([]);
  await page.getByLabel("Endpoint", { exact: true }).fill("/");
  await testConnection.click();
  await expect(page.getByRole("heading", { name: "Review event source" })).toBeVisible();
  expect(requests).toEqual([{ name: "Streamer.bot", kind: "streamerbot", credential: null, configuration: { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/", allowUnauthenticatedLocalConnection: true, twitchBroadcasterId: null, externalSubscriptions: [], forwardTwitchEvents: true } }]);
});
