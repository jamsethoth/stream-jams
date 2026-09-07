import { build } from "vite";
import { resolve } from "node:path";

// Sandboxed Electron preloads cannot require local modules. Bundle the same
// boundary schemas into the preload and renderer, leaving only Electron external.
for (const [entry, format, fileName] of [
  ["audio-preload.cts", "cjs", "audio-preload.cjs"],
  ["player.ts", "es", "player.js"]
]) {
  await build({ configFile: false, publicDir: false, build: {
    outDir: "dist/audio", emptyOutDir: false, minify: false,
    lib: { entry: resolve("src/audio", entry), formats: [format], fileName: () => fileName },
    rolldownOptions: { external: ["electron"] }
  } });
}
