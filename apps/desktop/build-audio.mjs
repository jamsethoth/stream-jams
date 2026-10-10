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
