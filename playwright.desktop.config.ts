import { defineConfig } from "@playwright/test";
export default defineConfig({ globalSetup: "./packages/test-support/src/playwright-global-setup.ts", testDir: "./tests/desktop", testIgnore: ["**/vendor-provider-security.spec.ts", "**/obs-browser-security.spec.ts"], timeout: 240_000, workers: 1, fullyParallel: false, reporter: "list", grepInvert: /@hardware/ });
