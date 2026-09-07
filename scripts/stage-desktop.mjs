import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktop = join(root, "apps/desktop");
const stage = join(desktop, ".stage");
if (relative(root, stage) !== join("apps", "desktop", ".stage")) throw new Error("Unexpected desktop staging directory");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const desktopManifest = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
await writeFile(join(stage, "package.json"), JSON.stringify({
  ...desktopManifest,
  name: "stream-jams-desktop",
  config: { forge: "./forge.config.js" },
  scripts: {},
  devDependencies: { electron: desktopManifest.devDependencies.electron }
}, null, 2));
await cp(join(desktop, "dist"), join(stage, "dist"), { recursive: true });
await cp(join(desktop, "src/audio/player.html"), join(stage, "dist/audio/player.html"));
await cp(join(root, "apps/web/dist"), join(stage, "web"), { recursive: true });
await cp(join(desktop, "forge.config.js"), join(stage, "forge.config.js"));
let copiedPackages = 0;

async function resolvePackage(name, from) {
  const require = createRequire(join(from, "package.json"));
  // A dependency can share a builtin's name (e.g. string_decoder). Asking for
  // its manifest yields package search paths instead of the builtin sentinel.
  for (const directory of require.resolve.paths(`${name}/package.json`) ?? []) {
    const candidate = join(directory, name);
    try { await stat(join(candidate, "package.json")); return await realpath(candidate); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error(`Missing runtime dependency ${name}`);
}

async function copyDependency(name, from, targetParent, ancestors) {
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error("Invalid dependency name");
  const source = await resolvePackage(name, from);
  if (ancestors.has(source)) return; // Node resolves this dependency from its ancestor.
  if (++copiedPackages > 1000) throw new Error("Unexpected runtime dependency closure size");
  const target = join(targetParent, "node_modules", name);
  if (!target.startsWith(stage + sep)) throw new Error("Dependency escaped the staging directory");
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const nextAncestors = new Set([...ancestors, source]);
  await mkdir(target, { recursive: true });
  if (name.startsWith("@stream-jams/")) {
    await cp(join(source, "dist"), join(target, "dist"), { recursive: true });
    await writeFile(join(target, "package.json"), JSON.stringify(manifest, null, 2));
  } else {
    await cp(source, target, { recursive: true, dereference: true, filter: (path) => !relative(source, path).split(sep).includes("node_modules") });
  }
  for (const dependency of Object.keys(manifest.dependencies ?? {})) await copyDependency(dependency, source, target, nextAncestors);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try { await resolvePackage(dependency, source); }
    catch { continue; } // Only optional binaries installed for this OS/architecture belong in the package.
    await copyDependency(dependency, source, target, nextAncestors);
  }
}
for (const name of Object.keys(desktopManifest.dependencies)) await copyDependency(name, desktop, stage, new Set());

// Compile the checked-in 16px glyph into a Windows ICO (32-bit BGRA DIB).
const glyph = JSON.parse(await readFile(join(desktop, "assets/tray-icon.json"), "utf8"));
if (glyph.length !== 16 || glyph.some((row) => !/^[.#]{16}$/.test(row))) throw new Error("Invalid tray glyph");
const bitmap = Buffer.alloc(40 + 16 * 16 * 4 + 16 * 4);
bitmap.writeUInt32LE(40, 0); bitmap.writeInt32LE(16, 4); bitmap.writeInt32LE(32, 8);
bitmap.writeUInt16LE(1, 12); bitmap.writeUInt16LE(32, 14);
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  const offset = 40 + ((15 - y) * 16 + x) * 4;
  const filled = glyph[y][x] === "#";
  bitmap.set(filled ? [0x6a, 0x7a, 0x08, 0xff] : [0xff, 0xff, 0xff, 0xff], offset);
}
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 16; header[7] = 16;
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(bitmap.length, 14); header.writeUInt32LE(22, 18);
await mkdir(join(stage, "assets"), { recursive: true });
await writeFile(join(stage, "assets/tray.ico"), Buffer.concat([header, bitmap]));

async function assertSelfContained(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Staged package contains a link: ${relative(stage, path)}`);
    if (entry.isDirectory()) await assertSelfContained(path);
  }
}
await assertSelfContained(stage);
console.log(`Staged ${copiedPackages} runtime packages with no source-tree links.`);
