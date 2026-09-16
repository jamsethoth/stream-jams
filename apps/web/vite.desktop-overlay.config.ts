import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./", publicDir: false, plugins: [react()],
  build: {
    outDir: "dist-desktop-overlay", cssCodeSplit: false,
    rolldownOptions: { input: "desktop-overlay.html", output: { entryFileNames: "overlay.js", codeSplitting: false, assetFileNames: "overlay.[ext]" } }
  }
});
