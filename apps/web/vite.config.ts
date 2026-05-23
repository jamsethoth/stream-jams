import react from "@vitejs/plugin-react";
import { defineConfig, type ViteUserConfig } from "vitest/config";

// Vitest 2 resolves Vite 5 types while the app runs Vite 6.
const plugins = [react()] as unknown as NonNullable<ViteUserConfig["plugins"]>;

export default defineConfig({
  plugins,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"]
  }
});
