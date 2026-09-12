import { build } from "vite";
import { resolve } from "node:path";

// Sandboxed Electron preloads cannot require local modules. Bundle the same
// boundary schemas into the preload and renderer, leaving only Electron external.
for (const [directory, entry, format, fileName] of [
  ["audio", "audio-preload.cts", "cjs", "audio-preload.cjs"],
  ["audio", "player.ts", "es", "player.js"],
  ["overlay", "overlay-preload.cts", "cjs", "overlay-preload.cjs"]
]) {
  await build({ configFile: false, publicDir: false, build: {
    outDir: `dist/${directory}`, emptyOutDir: false, minify: false,
    lib: { entry: resolve("src", directory, entry), formats: [format], fileName: () => fileName },
    rolldownOptions: { external: ["electron"] }
  } });
}
