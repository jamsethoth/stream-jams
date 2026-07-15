import { expect, test } from "@playwright/test";
import { mockManagementShell } from "./e2e-helpers.js";

test("settings persists server port changes and rejects invalid ports", async ({ page }) => {
  await mockManagementShell(page);

  let serverConfig = { host: "127.0.0.1", port: 39187 };
  const updates: unknown[] = [];
  await page.route("**/config/server", async (route) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer mgmt_e2e");
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { readonly host: string; readonly port: number };
      updates.push(body);
      serverConfig = body;
      await route.fulfill({ contentType: "application/json", json: serverConfig });
      return;
    }

    await route.fulfill({ contentType: "application/json", json: serverConfig });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Settings" }).click();

  const portInput = page.getByLabel("Port");
  await expect(page.getByText("127.0.0.1:39187")).toBeVisible();
  await portInput.fill("40123");
  await page.getByRole("button", { name: "Save server settings" }).click();

  await expect(page.getByText("Server settings saved.")).toBeVisible();
  await expect(page.getByText("127.0.0.1:40123")).toBeVisible();
  expect(updates).toEqual([{ host: "127.0.0.1", port: 40123 }]);

  await portInput.fill("70000");
  await page.getByRole("button", { name: "Save server settings" }).click();

  expect(await portInput.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  expect(updates).toEqual([{ host: "127.0.0.1", port: 40123 }]);
  await expect(page.getByText("127.0.0.1:40123")).toBeVisible();
});

test("settings warns before discarding dirty changes during local navigation", async ({ page }) => {
  await mockManagementShell(page);
  await page.route("**/config/server", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { host: "127.0.0.1", port: 39187 } });
  });
  await page.route("**/assets", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [] });
  });

  await page.goto("/manage");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Host").fill("localhost");
  await page.getByRole("link", { name: "Assets" }).click();

  await expect(page.getByRole("dialog", { name: "Leave with unsaved changes?" })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/u);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/settings$/u);

  await page.getByRole("link", { name: "Assets" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/assets$/u);
  await expect(page.getByText("No assets imported yet.")).toBeVisible();
});
