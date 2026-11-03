/* global process, fetch */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

/*
 * Builds and refreshes the portable dev OBS from the production OBS, without anything that can
 * reach the live setup (BL-077). Production OBS files are only read.
 *
 *   node scripts/dev-obs.mjs setup     copy OBS, plugins, layout and every scene collection, then set the
 *                                      Stream Jams browser sources to dev URLs (when the dev runtime is up)
 *   node scripts/dev-obs.mjs sources   only refresh the Stream Jams browser-source URLs
 *
 * Options: --dev-root <dir> (C:\StreamJamsDev\obs), --obs-install <dir> (C:\Program Files\obs-studio),
 * --obs-config <dir> (%APPDATA%\obs-studio), --port <n> (4456), --stream-jams <url> (http://127.0.0.1:39287)
 */

export const devProfileName = "StreamJamsDev";
export const productionObsPort = 4455;
export const productionStreamJamsPort = "39187";
export const placeholderKey = "REPLACE_WITH_DEV_KEY";
const disabledKinds = new Set(["dshow_input", "droidcam_obs", "game_capture", "wasapi_input_capture", "wasapi_output_capture", "wasapi_process_output_capture"]);
const droppedModules = new Set(["output-timer", "auto-scene-switcher", "advanced-scene-switcher", "scripts-tool", "captions", "cloud_closed_caption_rat"]);
const secretKey = /stream_?key|stream_server|token|password|secret/iu;

export function parseIni(text) {
  const sections = {};
  let section = null;
  for (const line of text.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const header = /^\[(.+)\]$/u.exec(line);
    if (header) { section = header[1]; sections[section] ??= {}; continue; }
    const pair = /^([^=]+)=(.*)$/u.exec(line);
    if (pair && section !== null) sections[section][pair[1]] = pair[2];
  }
  return sections;
}

export function formatIni(sections) {
  return Object.entries(sections).map(([name, values]) => `[${name}]\n${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`).join("\n");
}

const pick = (values = {}, keys) => Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]]));

/** App-level settings: no update checks and no [Locations] (production's would point at its own config). */
export function devGlobalIni(production) {
  return {
    General: { ...pick(production.General, ["MaxLogs", "InfoIncrement", "ProcessPriority", "BrowserHWAccel", "LastVersion", "Pre33.0Migrated"]), EnableAutoUpdates: "false" },
    Video: pick(production.Video, ["Renderer"]),
    Audio: pick(production.Audio, ["DisableAudioDucking"]),
    Appearance: pick(production.Appearance, ["Theme"])
  };
}

/** User settings and window/dock layout; the dev profile and collection are always selected. */
export function devUserIni(production, streamJamsOrigin) {
  const { ExtraBrowserDocks: docks = "[]", ...window } = production.BasicWindow ?? {};
  return {
    ...production,
    BasicWindow: { ...window, ExtraBrowserDocks: repointDocks(docks, streamJamsOrigin), SysTrayWhenStarted: "false" },
    Basic: { ...production.Basic, Profile: devProfileName, ProfileDir: devProfileName, SceneCollection: devProfileName, SceneCollectionFile: `${devProfileName}.json` }
  };
}

function repointDocks(docks, streamJamsOrigin) {
  let parsed;
  try { parsed = JSON.parse(docks); } catch { return "[]"; }
  if (!Array.isArray(parsed)) return "[]";
  return JSON.stringify(parsed.map(dock => ({ ...dock, url: repointProductionUrl(String(dock.url ?? ""), streamJamsOrigin) })));
}

function repointProductionUrl(value, streamJamsOrigin) {
  try {
    const url = new URL(value);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== productionStreamJamsPort) return value;
    const dev = new URL(streamJamsOrigin);
    url.host = dev.host;
    return url.toString();
  } catch { return value; }
}

/** Profile settings from production, minus hotkeys, the browser cookie store, credentials and its recording folders. */
export function devBasicIni(production, recordingsDirectory) {
  const out = {};
  for (const [section, values] of Object.entries(production)) {
    if (section === "Hotkeys" || section === "Panels") continue;
    out[section] = Object.fromEntries(Object.entries(values).filter(([key]) => !secretKey.test(key) && !/^key$/iu.test(key))
      .map(([key, value]) => [key, /FilePath$/u.test(key) ? recordingsDirectory.replaceAll("\\", "/") : value]));
  }
  out.General = { ...out.General, Name: devProfileName };
  return out;
}

/** Aitum layout and canvases only: no outputs, stream keys, servers or start/stop-all hotkeys. */
export function sanitizeAitum(aitum) {
  const strip = value => {
    if (Array.isArray(value)) return value.map(strip);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key)).map(([key, child]) => [key, strip(child)]));
  };
  return strip({ ...aitum, outputs: [], start_all_outputs_hotkey: [], stop_all_outputs_hotkey: [] });
}

/** Same plugins as production, except the Stream Deck plugin, which would compete for the Stream Deck. */
export function devPluginModules(modules) {
  return modules.map(module => module.module_name === "StreamDeckPlugin" ? { ...module, enabled: false } : module);
}

/** Module, profile and purpose of a Stream Jams module browser-source URL on either the production or dev port. */
export function parseStreamJamsOverlayUrl(value, devOrigin) {
  let url;
  try { url = new URL(value); } catch { return null; }
  const devPort = new URL(devOrigin).port;
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || ![productionStreamJamsPort, devPort].includes(url.port)) return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "overlay") return null;
  if (parts[1] === "modules" && parts.length >= 5) {
    const profile = url.searchParams.get("profile");
    return { scope: "module", moduleId: parts[2], purpose: parts[3], targetProfileId: profile === "landscape" || profile === "vertical" ? profile : null };
  }
  return { scope: parts[1] ?? "unknown", moduleId: null, purpose: parts[2] ?? null, targetProfileId: null };
}

export function devCollectionName(originalName, isActive) {
  return isActive ? devProfileName : `${devProfileName}-${String(originalName).replace(/[^A-Za-z0-9]+/gu, "")}`;
}

function placeholderUrl(target, devOrigin) {
  if (target?.scope !== "module" || target.moduleId === null) return `${devOrigin}/overlay/unmapped/${placeholderKey}`;
  const url = new URL(`/overlay/modules/${encodeURIComponent(target.moduleId)}/live/${placeholderKey}`, devOrigin);
  if (target.targetProfileId !== null) url.searchParams.set("profile", target.targetProfileId);
  return url.toString();
}

/**
 * Makes a scene collection safe to load beside production OBS. Stream Jams sources get a dev URL from
 * `devUrlFor(target)` when known, otherwise a placeholder without any production key.
 */
export function prepareCollection(original, { name, devOrigin, devUrlFor = () => null }) {
  const collection = JSON.parse(JSON.stringify(original));
  const report = { name, disabled: [], streamJamsSources: [], unmapped: [], removedAudioDevices: [], removedModules: [] };
  collection.name = name;
  for (const key of Object.keys(collection)) {
    if (/^(DesktopAudioDevice|AuxAudioDevice)\d$/u.test(key)) { delete collection[key]; report.removedAudioDevices.push(key); }
  }
  for (const source of [...(collection.sources ?? []), ...(collection.groups ?? [])]) {
    source.hotkeys = {};
    if (source.monitoring_type) source.monitoring_type = 0;
    for (const filter of source.filters ?? []) filter.hotkeys = {};
    if (disabledKinds.has(source.id) && source.enabled !== false) { source.enabled = false; report.disabled.push(`${source.id}: ${source.name}`); }
    if (source.id !== "browser_source" || source.settings === undefined) continue;
    source.settings.reroute_audio = true;
    const target = typeof source.settings.url === "string" ? parseStreamJamsOverlayUrl(source.settings.url, devOrigin) : null;
    if (target === null) continue;
    const devUrl = target.scope === "module" ? devUrlFor(target) : null;
    source.settings.url = devUrl ?? placeholderUrl(target, devOrigin);
    report.streamJamsSources.push({ source: source.name, moduleId: target.moduleId, targetProfileId: target.targetProfileId, resolved: devUrl !== null });
    if (devUrl === null) report.unmapped.push(source.name);
  }
  for (const key of Object.keys(collection.modules ?? {})) {
    if (droppedModules.has(key) || /hotkey$/iu.test(key)) { delete collection.modules[key]; report.removedModules.push(key); }
  }
  return { collection, report };
}

export function streamJamsTargets(collections, devOrigin) {
  const targets = new Map();
  for (const collection of collections) {
    for (const source of collection.sources ?? []) {
      if (source.id !== "browser_source" || typeof source.settings?.url !== "string") continue;
      const target = parseStreamJamsOverlayUrl(source.settings.url, devOrigin);
      if (target?.scope === "module") targets.set(targetKey(target), target);
    }
  }
  return [...targets.values()];
}

const targetKey = target => `${target.moduleId}:${target.targetProfileId ?? ""}`;

/** Refuses anything but a loopback dev runtime; production Stream Jams is never contacted. */
export function assertDevStreamJamsOrigin(origin) {
  const url = new URL(origin);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`The dev Stream Jams must be on loopback, not ${url.hostname}.`);
  if (url.port === productionStreamJamsPort || url.port === "") throw new Error(`Refusing ${origin}: ${productionStreamJamsPort} is the production Stream Jams port.`);
  return url.origin;
}

/** Reuses each dev output's URL, creating or regenerating its key only when the dev runtime has none. */
export async function resolveDevUrls(origin, targets, request = fetch) {
  const base = assertDevStreamJamsOrigin(origin);
  const sessionResponse = await request(`${base}/auth/management/sessions`, { method: "POST" });
  if (sessionResponse.status !== 201) throw new Error(`The dev Stream Jams refused a management session (HTTP ${sessionResponse.status}).`);
  const session = await sessionResponse.json();
  const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, origin: base, "content-type": "application/json" };
  const api = async (path, method = "GET", body) => {
    const response = await request(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}.`);
    return response.json();
  };
  const outputs = await api("/management/overlay-outputs");
  const urls = new Map();
  const missing = [];
  for (const target of targets) {
    const output = outputs.find(item => item.moduleId === target.moduleId && (item.targetProfileId ?? null) === target.targetProfileId);
    if (output === undefined) { missing.push(targetKey(target)); continue; }
    if (typeof output.url === "string") { urls.set(targetKey(target), output.url); continue; }
    const input = { scope: "module", moduleId: target.moduleId, purpose: "live", targetProfileId: target.targetProfileId };
    const created = await api(output.copyableUrlStatus === "regenerate-required" ? "/management/overlay-outputs/keys/regenerate" : "/management/overlay-outputs/keys", "POST", input);
    urls.set(targetKey(target), created.url);
  }
  for (const url of urls.values()) assertDevStreamJamsOrigin(new URL(url).origin);
  return { urlFor: target => urls.get(targetKey(target)) ?? null, missing };
}

// ---------------------------------------------------------------------------------------------
// Command line

function options(argv) {
  const value = flag => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  return {
    command: argv[0],
    devRoot: resolve(value("--dev-root") ?? "C:\\StreamJamsDev\\obs"),
    install: resolve(value("--obs-install") ?? "C:\\Program Files\\obs-studio"),
    productionConfig: resolve(value("--obs-config") ?? join(process.env.APPDATA ?? "", "obs-studio")),
    port: Number(value("--port") ?? 4456),
    streamJams: value("--stream-jams") ?? "http://127.0.0.1:39287"
  };
}

const inside = (child, parent) => { const offset = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase()); return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset)); };

function assertSafeTargets(opts) {
  if (!Number.isInteger(opts.port) || opts.port === productionObsPort || opts.port < 1024 || opts.port > 65535) throw new Error(`Refusing obs-websocket port ${opts.port}.`);
  for (const protectedDirectory of [opts.install, opts.productionConfig]) {
    if (inside(opts.devRoot, protectedDirectory) || inside(protectedDirectory, opts.devRoot)) throw new Error(`The dev root ${opts.devRoot} overlaps ${protectedDirectory}.`);
  }
  if (existsSync(opts.devRoot) && readdirSync(opts.devRoot).length > 0 && !existsSync(join(opts.devRoot, "stream-jams-dev-obs.json"))) {
    throw new Error(`${opts.devRoot} is not empty and is not a Stream Jams dev OBS (no stream-jams-dev-obs.json).`);
  }
  const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `@(Get-Process obs64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${opts.devRoot.replaceAll("'", "''")}', [StringComparison]::OrdinalIgnoreCase) }).Count`], { encoding: "utf8" }).trim();
  if (running !== "0") throw new Error("Close the dev OBS first: it rewrites its scene collections when it exits.");
}

const readJson = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/u, ""));
const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

async function devUrlResolver(opts, collections) {
  const targets = streamJamsTargets(collections, opts.streamJams);
  if (targets.length === 0) return { urlFor: () => null, status: "no Stream Jams browser sources" };
  try {
    const health = await fetch(`${assertDevStreamJamsOrigin(opts.streamJams)}/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
  } catch (error) {
    return { urlFor: () => null, status: `dev Stream Jams not reachable at ${opts.streamJams} (${error.message}); left placeholders. Start it and run: node scripts/dev-obs.mjs sources` };
  }
  const resolved = await resolveDevUrls(opts.streamJams, targets);
  return { urlFor: resolved.urlFor, status: resolved.missing.length ? `no dev output for ${resolved.missing.join(", ")}` : `resolved ${targets.length} dev output(s)` };
}

async function setup(opts, repositoryRoot) {
  const config = join(opts.devRoot, "config", "obs-studio");
  const recordings = join(dirname(opts.devRoot), "obs-recordings");
  mkdirSync(opts.devRoot, { recursive: true });
  try { execFileSync("robocopy.exe", [opts.install, opts.devRoot, "/E", "/MT:8", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/XD", join(opts.install, "config")], { stdio: "ignore" }); }
  catch (error) { if (typeof error.status !== "number" || error.status >= 8) throw error; }
  writeText(join(opts.devRoot, "portable_mode.txt"), "");

  const productionUser = parseIni(readFileSync(join(opts.productionConfig, "user.ini"), "utf8"));
  writeText(join(config, "global.ini"), formatIni(devGlobalIni(parseIni(readFileSync(join(opts.productionConfig, "global.ini"), "utf8")))));
  writeText(join(config, "user.ini"), formatIni(devUserIni(productionUser, opts.streamJams)));

  const productionProfile = join(opts.productionConfig, "basic", "profiles", productionUser.Basic?.ProfileDir ?? "Untitled");
  const devProfile = join(config, "basic", "profiles", devProfileName);
  mkdirSync(recordings, { recursive: true });
  writeText(join(devProfile, "basic.ini"), formatIni(devBasicIni(parseIni(readFileSync(join(productionProfile, "basic.ini"), "utf8")), recordings)));
  if (existsSync(join(productionProfile, "aitum.json"))) writeJson(join(devProfile, "aitum.json"), sanitizeAitum(readJson(join(productionProfile, "aitum.json"))));
  for (const encoder of ["streamEncoder.json", "recordEncoder.json"]) if (existsSync(join(productionProfile, encoder))) writeJson(join(devProfile, encoder), readJson(join(productionProfile, encoder)));
  if (existsSync(join(opts.productionConfig, "plugin_manager", "modules.json"))) {
    writeJson(join(config, "plugin_manager", "modules.json"), devPluginModules(readJson(join(opts.productionConfig, "plugin_manager", "modules.json"))));
  }

  const scenesDirectory = join(opts.productionConfig, "basic", "scenes");
  const activeFile = productionUser.Basic?.SceneCollectionFile?.replace(/\.json$/u, "") ?? "";
  const originals = readdirSync(scenesDirectory).filter(file => file.endsWith(".json")).map(file => ({ file, active: file.replace(/\.json$/u, "") === activeFile, collection: readJson(join(scenesDirectory, file)) }));
  const resolver = await devUrlResolver(opts, originals.map(original => original.collection));
  const reports = [];
  for (const original of originals) {
    const name = devCollectionName(original.collection.name ?? basename(original.file, ".json"), original.active);
    const { collection, report } = prepareCollection(original.collection, { name, devOrigin: opts.streamJams, devUrlFor: resolver.urlFor });
    writeJson(join(config, "basic", "scenes", `${name}.json`), collection);
    reports.push({ from: original.file, ...report });
  }

  // obs-websocket on the dev port; identity (password and instance marker) survives re-runs.
  const websocketPath = join(config, "plugin_config", "obs-websocket", "config.json");
  const password = existsSync(websocketPath) ? readJson(websocketPath).server_password : randomBytes(18).toString("base64url");
  writeJson(websocketPath, { alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: password, server_port: opts.port });
  const { Entry } = createRequire(join(repositoryRoot, "apps", "server", "package.json"))("@napi-rs/keyring");
  new Entry("stream-jams-dev:obs:websocket", opts.port === 4456 ? "dev-obs" : `dev-obs-${opts.port}`).setPassword(password);
  const markerPath = join(opts.devRoot, "stream-jams-dev-obs.json");
  const instanceId = existsSync(markerPath) ? readJson(markerPath).instanceId : randomBytes(16).toString("hex");
  writeJson(markerPath, { instanceId, port: opts.port, profile: devProfileName, updatedAt: new Date().toISOString() });
  const persistentPath = join(devProfile, "obsWebSocketPersistentData.json");
  writeJson(persistentPath, { ...(existsSync(persistentPath) ? readJson(persistentPath) : {}), StreamJamsDevInstance: instanceId });

  writeText(join(opts.devRoot, "Start Dev OBS.cmd"), ["@echo off", "rem Portable dev OBS for Stream Jams (scripts/dev-obs.mjs). Runs beside production OBS.",
    "cd /d \"%~dp0bin\\64bit\"", `start "" obs64.exe --portable --multi --disable-updater --profile ${devProfileName} --collection ${devProfileName}`, ""].join("\r\n"));
  writeText(join(opts.devRoot, "STREAM-JAMS-DEV-README.txt"), readme(opts, reports, resolver.status));
  return { devRoot: opts.devRoot, port: opts.port, streamJams: resolver.status, collections: reports };
}

async function sources(opts) {
  const scenes = join(opts.devRoot, "config", "obs-studio", "basic", "scenes");
  const files = readdirSync(scenes).filter(file => file.endsWith(".json"));
  const collections = files.map(file => ({ file, collection: readJson(join(scenes, file)) }));
  const resolver = await devUrlResolver(opts, collections.map(item => item.collection));
  const reports = [];
  for (const { file, collection } of collections) {
    const report = { file, updated: [], unmapped: [] };
    for (const source of collection.sources ?? []) {
      if (source.id !== "browser_source" || typeof source.settings?.url !== "string") continue;
      const target = parseStreamJamsOverlayUrl(source.settings.url, opts.streamJams);
      if (target === null) continue;
      const url = target.scope === "module" ? resolver.urlFor(target) : null;
      if (url === null) { report.unmapped.push(source.name); continue; }
      source.settings.url = url;
      report.updated.push(source.name);
    }
    writeJson(join(scenes, file), collection);
    reports.push(report);
  }
  return { streamJams: resolver.status, collections: reports };
}

function readme(opts, reports, streamJamsStatus) {
  return [
    "Stream Jams dev OBS (portable) - generated by scripts/dev-obs.mjs; re-run it to refresh from production.",
    "",
    `Start:      "Start Dev OBS.cmd" (portable, --multi, profile and collection ${devProfileName})`,
    `WebSocket:  127.0.0.1:${opts.port}; password in Credential Manager "stream-jams-dev:obs:websocket"`,
    "Marker:     stream-jams-dev-obs.json and profile persistent data StreamJamsDevInstance (checked by connectGuardedObs)",
    `Stream Jams browser sources: ${streamJamsStatus}`,
    "",
    "Copied from production: program files, Plugin Manager list (Stream Deck plugin disabled), window/dock layout,",
    "profile settings, Aitum layout and canvases, and every scene collection.",
    "Never copied: stream service and keys, Aitum outputs and keys, hotkeys, browser cookies, [Locations].",
    "In the copies: cameras, DroidCam and game capture disabled; Desktop Audio and Mic/Aux removed; browser-source",
    "audio routed into OBS with monitoring off; timer, scene-switcher, script and caption modules removed;",
    "Stream Jams browser sources pointed at the dev runtime.",
    "",
    "Collections:",
    ...reports.map(report => `- ${report.name} <- ${report.from}; disabled: ${report.disabled.join("; ") || "none"}; Stream Jams sources: ${report.streamJamsSources.length}${report.unmapped.length ? `, unmapped: ${report.unmapped.join("; ")}` : ""}`),
    ""
  ].join("\r\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = options(process.argv.slice(2));
  if (opts.command !== "setup" && opts.command !== "sources") {
    console.error("Usage: node scripts/dev-obs.mjs setup|sources [--dev-root dir] [--obs-install dir] [--obs-config dir] [--port n] [--stream-jams url]");
    process.exit(2);
  }
  try {
    assertDevStreamJamsOrigin(opts.streamJams);
    assertSafeTargets(opts);
    const result = opts.command === "setup" ? await setup(opts, resolve(dirname(fileURLToPath(import.meta.url)), "..")) : await sources(opts);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`dev-obs: ${error.message}`);
    process.exit(1);
  }
}
