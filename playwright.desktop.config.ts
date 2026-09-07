import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/desktop", timeout: 240_000, workers: 1, fullyParallel: false, reporter: "list" });
