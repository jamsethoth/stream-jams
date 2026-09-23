import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { routeModuleManifestPlugin } from "./vite-route-module-manifest.js";

export default defineConfig({
  build: {
    manifest: true
  },
  plugins: [react(), routeModuleManifestPlugin()]
});
