import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@stream-jams/core/music-style-policy": fileURLToPath(new URL("./packages/core/src/music/style-policy.ts", import.meta.url)),
      "@stream-jams/core/video-shoutout": fileURLToPath(new URL("./packages/core/src/video-shoutout/contract.ts", import.meta.url)),
      "@stream-jams/core/event-bus": fileURLToPath(new URL("./packages/core/src/event-bus/schemas.ts", import.meta.url)),
      "@stream-jams/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url))
    }
  },
  test: {
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts", "apps/desktop/src/**/*.test.ts"],
          environment: "node",
          testTimeout: 10_000
        }
      },
      {
        extends: "./apps/web/vite.config.ts",
        test: {
          name: "web",
          include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
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
