import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
  const manifest = JSON.parse(await readFile(join(webBuildDirectory, ".vite", "manifest.json"), "utf8")) as Record<
    string,
    { readonly file: string; readonly css?: readonly string[] }
  >;
  const bootstrap = manifest["index.html"];
  const management = manifest["src/App.tsx"];
  if (bootstrap === undefined || management === undefined) {
    throw new Error("Production web manifest is missing the bootstrap or management route entry.");
  }
  const expectedAssets = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])])
    .map((file) => `/${file}`));
  const managementCss = management.css ?? [];

  expect(resources.some((path) => path.endsWith(".js"))).toBe(true);
  expect(resources.some((path) => path.endsWith(".css"))).toBe(true);
  expect(resources.every((path) => path.startsWith("/assets/"))).toBe(true);
  expect(resources.every((path) => expectedAssets.has(path))).toBe(true);
  expect(resources.some((path) => path.startsWith("/src/"))).toBe(false);
  expect(resources).toContain(`/${bootstrap.file}`);
  expect(resources).toContain(`/${management.file}`);
  expect(managementCss.length).toBeGreaterThan(0);
  for (const cssFile of managementCss) expect(resources).toContain(`/${cssFile}`);
  for (const asset of [`/${bootstrap.file}`, `/${management.file}`, ...managementCss.map((file) => `/${file}`)]) {
    expect(asset).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{8}\.(?:css|js)$/u);
  }
  expect(browserErrors).toEqual([]);
});
