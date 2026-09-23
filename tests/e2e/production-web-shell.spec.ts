import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBaseServerApp } from "../../apps/server/src/app.js";
import { registerWebShellRoutes } from "../../apps/server/src/http/routes/web-shell.js";

const webBuildDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/web/dist");
const app = createBaseServerApp({ metadata: { appName: "stream-jams", version: "e2e" } });
registerWebShellRoutes(app, { webBuildDirectory });
let productionUrl = "";

test.beforeAll(async () => {
  productionUrl = await app.listen({ host: "127.0.0.1", port: 0 });
});

test.afterAll(async () => {
  await app.close();
});

test("production Fastify shell loads hashed management route assets", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/auth/management/sessions", (route) => route.fulfill({ json: { id: "mgmt_production_shell" } }));
  await page.route("**/management/overlay-clients", (route) => route.fulfill({ json: [] }));
  await page.route("**/management/home", (route) => route.fulfill({ json: {
    readiness: [],
    activeAlertSet: null,
    alertConfiguration: { state: "no-active-set", enabledAlertCount: 0, items: [] },
    actionableProblems: []
  } }));

  const response = await page.goto(`${productionUrl}/manage`);

  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.locator("main.management-main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => path.endsWith(".js") || path.endsWith(".css")));
  expect(resources.length).toBeGreaterThan(1);
  expect(resources.every((path) => path.startsWith("/assets/"))).toBe(true);
  expect(resources.some((path) => path.startsWith("/src/"))).toBe(false);
  expect(browserErrors).toEqual([]);
});
