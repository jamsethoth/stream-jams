import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { routeModuleManifestPlugin } from "./vite-route-module-manifest.js";

export default defineConfig({
  build: {
    manifest: true,
    rolldownOptions: {
      // @stream-jams/core has no import-for-side-effect modules; its top-level zod schemas are pure.
      // Treating its dist as side-effect free lets each route drop core modules it never uses.
      treeshake: {
        moduleSideEffects: (id: string) => !/[\\/]packages[\\/]core[\\/]dist[\\/]/u.test(id)
      }
    }
  },
  plugins: [react(), routeModuleManifestPlugin()]
});
