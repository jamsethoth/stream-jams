import { defineConfig, devices } from "@playwright/test";

const defaultWebServerHost = "127.0.0.1";
const requestedWebServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? defaultWebServerHost;
const allowedWebServerHosts = new Set(["127.0.0.1", "0.0.0.0"]);

if (!allowedWebServerHosts.has(requestedWebServerHost)) {
  throw new Error("PLAYWRIGHT_WEB_SERVER_HOST must be either 127.0.0.1 or 0.0.0.0.");
}

const webServerHost = requestedWebServerHost;
const defaultWebServerUrl = "http://127.0.0.1:4173";
const webServerUrl = process.env.PLAYWRIGHT_WEB_SERVER_URL ?? defaultWebServerUrl;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? webServerUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `pnpm --filter @stream-jams/web exec vite --host ${webServerHost} --port 4173`,
    reuseExistingServer: !process.env.CI,
    url: webServerUrl
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
