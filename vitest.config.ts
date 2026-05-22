import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [["apps/web/**/*.test.tsx", "jsdom"]],
    setupFiles: ["apps/web/src/test-setup.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
