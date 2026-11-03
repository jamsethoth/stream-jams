import { defineConfig } from "@playwright/test";

export default defineConfig({ globalSetup: "./packages/test-support/src/playwright-global-setup.ts", testDir: "./tests/desktop", timeout: 240_000, workers: 1, fullyParallel: false, reporter: "list", grep: /@hardware/ });
