import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts"],
          environment: "node",
          testTimeout: 10_000
        }
      },
      {
        extends: "./apps/web/vite.config.ts",
        test: {
          name: "web",
          include: ["apps/web/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["apps/web/src/test-setup.ts"]
        }
      }
    ],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
