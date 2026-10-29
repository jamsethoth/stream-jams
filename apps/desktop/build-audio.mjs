import { Buffer } from "node:buffer";
import { build } from "vite";
import { resolve } from "node:path";

// Sandboxed Electron preloads cannot require local modules. Bundle the same
// boundary schemas into the preload and renderer, leaving only Electron external.
for (const [directory, entry, format, fileName] of [
  ["audio", "audio-preload.cts", "cjs", "audio-preload.cjs"],
  ["audio", "player.ts", "es", "player.js"],
  ["overlay", "overlay-preload.cts", "cjs", "overlay-preload.cjs"],
  ["videos", "video-player-preload.cts", "cjs", "video-player-preload.cjs"],
  ["videos", "video-devices-preload.cts", "cjs", "video-devices-preload.cjs"],
  ["videos", "player-page.ts", "es", "player.js"],
  ["videos", "device-output-page.ts", "es", "video-devices.js"]
]) {
  await build({ configFile: false, publicDir: false, build: {
    outDir: `dist/${directory}`, emptyOutDir: false, minify: false,
    lib: { entry: resolve("src", directory, entry), formats: [format], fileName: () => fileName },
    rolldownOptions: { external: ["electron"] }
  } });
}

// Camera effects check pages (BL-068). PixiJS and MediaPipe are bundled in, one file per page,
// and MediaPipe's WASM runtime and the pinned models are served beside them; nothing loads from a CDN.
for (const page of ["control", "pipeline", "receiver", "barcode"]) {
  await build({ configFile: false, publicDir: false, logLevel: "warn", build: {
    outDir: "dist/camera-effects-check/app", emptyOutDir: false, minify: true, chunkSizeWarningLimit: 4096,
    lib: { entry: resolve("src/camera-effects-check", `${page}-page.ts`), formats: ["es"], fileName: () => `${page}.js` },
    rolldownOptions: { output: { codeSplitting: false } }
  } });
}
{
  const { copyFile, mkdir, readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { createRequire } = await import("node:module");
  const target = "dist/camera-effects-check/app/mediapipe";
  await mkdir(target, { recursive: true });
  const wasm = resolve(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision"), "../wasm");
  for (const name of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) await copyFile(resolve(wasm, name), `${target}/${name}`);
  // Models are committed; refuse to package one that does not match its pinned digest.
  const models = JSON.parse(await readFile("assets/camera-effects-check/models.json", "utf8"));
  for (const model of models) {
    const bytes = await readFile(`assets/camera-effects-check/${model.file}`);
    if (createHash("sha256").update(bytes).digest("hex") !== model.sha256) throw new Error(`${model.file} does not match its pinned SHA-256`);
    await copyFile(`assets/camera-effects-check/${model.file}`, `${target}/${model.file}`);
  }
}

// Fixed one-second routing fixture; never registered asset IPC.
const { writeFile } = await import("node:fs/promises");
const samples = 24000;
const tone = Buffer.alloc(44 + samples * 2);
tone.write("RIFF"); tone.writeUInt32LE(tone.length - 8, 4); tone.write("WAVEfmt ", 8);
tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
tone.writeUInt32LE(samples, 24); tone.writeUInt32LE(samples * 2, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
tone.write("data", 36); tone.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 660 * i / samples) * 16383 * Math.min(1, i / 240, (samples - i) / 240)), 44 + i * 2);
await writeFile("dist/audio/tone.wav", tone);
