import { createRedactor } from "../../apps/server/src/modules/security/redactor.js";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, createDefaultTextWarp, overlayCompositionSchema, type EventBusActivityView, type MusicModuleConfig, type TimersOverlayModuleConfig, type VideosModuleConfig, type OverlayClientView } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";
import { createPreMigrationDatabase } from "../../apps/server/src/test-support/pre-migration-database.js";
import { startPearProtocolFixture, type PearProtocolFixture } from "../../packages/test-support/src/pear-protocol-fixture.js";

type ObsSource = { id: string; moduleId: string; profile: string; url: string; width: number; height: number };
type ObsReceipt = { sourceId: string; moduleId: string; profile: string; nativeWidth: number; nativeHeight: number; settingsWidth: number; settingsHeight: number; muted: boolean; monitoring: number; shutdown: boolean; rerouteAudio: boolean; path?: string };
type Dimensions = { width: number; height: number };

test.use({ trace: "off", screenshot: "off", video: "off" });
test("actual portable OBS keeps ordinary module geometry local, retired sources transparent, and scoped warped fonts secure", async ({ page }) => {
  const renderer = process.env.STREAM_JAMS_TEST_OBS_RENDERER;
  if (renderer !== undefined && renderer !== "d3d11-ci") throw new Error("STREAM_JAMS_TEST_OBS_RENDERER must be unset or d3d11-ci.");
  if (renderer === "d3d11-ci" && process.env.GITHUB_ACTIONS !== "true") throw new Error("d3d11-ci is restricted to GITHUB_ACTIONS=true and the Microsoft Basic Render Driver.");
  const rendererArguments = renderer === "d3d11-ci" ? ["--enable-gpu", "--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"] : [];
  await test.info().attach("controlled-renderer-mode", { body: JSON.stringify({ mode: renderer ?? "default", arguments: rendererArguments, scope: "owned synthetic loopback OBS only; GPU compatibility override, not a cybersecurity policy override; no guaranteed WARP support", sources: ["https://raw.githubusercontent.com/chromium/chromium/127.0.6533.120/gpu/config/software_rendering_list.json", "https://github.com/obsproject/obs-browser/blob/3f0a2cdf378939ebe3c6f9ab36d4ea100c25aac2/browser-app.cpp#L61-L68", "https://raw.githubusercontent.com/chromium/chromium/127.0.6533.120/ui/gl/gl_display.cc", "https://raw.githubusercontent.com/google/angle/e323abb5b08e13ebb3f0d1c59a680f60ecdfcfea/src/libANGLE/renderer/d3d/d3d11/Renderer11.cpp"] }, null, 2), contentType: "application/json" });
  const installed = process.env.STREAM_JAMS_TEST_OBS_DIR;
  if (installed === undefined) throw new Error("Set STREAM_JAMS_TEST_OBS_DIR to an installed OBS 32.2.2 directory; this acceptance requires real OBS with browser and Lua scripting");
  await access(join(installed, "bin/64bit/obs64.exe"));
  const root = await mkdtemp(join(tmpdir(), "stream-jams-obs-security-"));
  const portable = join(root, "obs");
  const coord = join(root, "coord");
  const runtime = await createProviderSecurityRuntimeFixture();
  let child: ChildProcess | undefined;
  let lastSyntheticScreenshot: Uint8Array | undefined;
  let playbackTriggered = false;
  let pear: PearProtocolFixture | undefined;
  let removeRequestObserver: (() => void) | undefined;
  const geometryEvidence: unknown[] = [];
  let failureSnapshot: unknown;
  const failures: unknown[] = [];
  try {
    await Promise.all([mkdir(coord, { recursive: true }), cp(join(installed, "bin"), join(portable, "bin"), { recursive: true }), cp(join(installed, "data/obs-studio"), join(portable, "data/obs-studio"), { recursive: true }), cp(join(installed, "data/libobs"), join(portable, "data/libobs"), { recursive: true }), cp(join(installed, "data/obs-scripting"), join(portable, "data/obs-scripting"), { recursive: true })]);
    const plugins = ["frontend-tools", "obs-browser", "image-source", "obs-transitions", "obs-outputs", "obs-x264", "obs-ffmpeg", "rtmp-services"];
    const dependencies = ["obs-browser-page.exe", "chrome_100_percent.pak", "chrome_200_percent.pak", "chrome_elf.dll", "icudtl.dat", "libcef.dll", "libEGL.dll", "libGLESv2.dll", "resources.pak", "v8_context_snapshot.bin"];
    await mkdir(join(portable, "obs-plugins/64bit"), { recursive: true });
    for (const file of [...plugins.map(name => `${name}.dll`), ...dependencies]) await cp(join(installed, "obs-plugins/64bit", file), join(portable, "obs-plugins/64bit", file));
    await cp(join(installed, "obs-plugins/64bit/locales"), join(portable, "obs-plugins/64bit/locales"), { recursive: true });
    for (const plugin of plugins) await cp(join(installed, "data/obs-plugins", plugin), join(portable, "data/obs-plugins", plugin), { recursive: true });
    await writeFile(join(portable, "portable_mode.txt"), "");
    const config = join(portable, "config/obs-studio");
    await mkdir(join(config, "basic/profiles/SecurityTest"), { recursive: true });
    await mkdir(join(config, "basic/scenes"), { recursive: true });
    const screenshots = join(root, "screenshots"); await mkdir(screenshots);
    await writeFile(join(config, "user.ini"), "[General]\nFirstRun=true\n[Basic]\nProfile=SecurityTest\nProfileDir=SecurityTest\nSceneCollection=SecurityTest\nSceneCollectionFile=SecurityTest\n");
    await writeFile(join(config, "basic/profiles/SecurityTest/basic.ini"), `[General]\nName=SecurityTest\n[Output]\nMode=Simple\n[SimpleOutput]\nFilePath=${screenshots.replaceAll("\\", "/")}\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSType=0\nFPSCommon=30\nColorFormat=NV12\nColorSpace=709\nColorRange=Partial\n`);
    await writeFile(join(config, "basic/scenes/SecurityTest.json"), JSON.stringify({ name: "SecurityTest", current_scene: "Scene", current_program_scene: "Scene", scene_order: [{ name: "Scene" }], sources: [{ name: "Scene", id: "scene", settings: { items: [] } }], modules: { "scripts-tool": [{ path: resolve("tests/desktop/fixtures/obs-browser-security.lua").replaceAll("\\", "/"), settings: { coord: coord.replaceAll("\\", "/") } }] } }));
    // Actual historical keys are retired by production startup migrations in the disposable DB.
    const retired = [
      { id: "retired-music", moduleId: "music", purpose: "test", scope: "module", profile: "landscape" },
      { id: "retired-timers", moduleId: "timers", purpose: "test", scope: "module", profile: "landscape" },
      { id: "retired-videos", moduleId: "videos", purpose: "test", scope: "module", profile: null },
      { id: "retired-unified-live", moduleId: null, purpose: "live", scope: "unified", profile: null },
      { id: "retired-unified-test", moduleId: null, purpose: "test", scope: "unified", profile: null }
    ] as const;
    using old = createPreMigrationDatabase("046-single-video-queue");
    for (const output of retired) {
      old.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,created_at,target_profile_id) VALUES (?,?,?,?,?,?,?,?)")
        .run(output.id, "default", output.moduleId, output.purpose, output.scope,
          `sha256:${createHash("sha256").update(`ovl_owned_${output.id}`).digest("hex")}`, "2026-10-11T00:00:00Z", output.profile);
    }
    const databaseDirectory = join(runtime.homeDirectory, ".stream-jams", "data");
    await mkdir(databaseDirectory, { recursive: true });
    old.connection.prepare("VACUUM INTO ?").run(join(databaseDirectory, "stream-jams.sqlite"));
    await runtime.start();
    expect(runtime.runtime.composition.database.connection.prepare("SELECT COUNT(*) count FROM overlay_keys WHERE id LIKE 'retired-%' AND revoked_at IS NULL").get()?.count).toBe(0);
    const api = async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
      const result = await runtime.request(path, method, body);
      expect(result.ok, `${method} ${path}: HTTP ${result.status}`).toBe(true);
      return result.status === 204 ? undefined : result.json();
    };
    const set = await api("/management/alert-sets", "POST", { name: "OBS fixture" }) as { id: string };
    const alert = await api(`/management/alert-sets/${set.id}/alerts`, "POST", { name: "OBS text", eventType: "follow" }) as { id: string };
    const original = alertEditorDocumentSchema.parse(await api(`/management/alerts/${alert.id}/editor`));
    let alertDocument = alertEditorDocumentSchema.parse({ ...original, enabled: true, durationMs: 30000, layers: [{ id: "text", name: "Message", type: "text", visible: true, order: 0, template: "OBS {actor.displayName}", textStyle: { ...compatibilityAlertTextStyle, fontSizePx: 96, color: "#FF00FFFF", warp: { ...createDefaultTextWarp(), points: createDefaultTextWarp().points.map((point, index) => index === 4 ? { ...point, x: .65 } : point) } }, boxStyle: compatibilityAlertTextBoxStyle, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 300, delayMs: 0, easing: "ease-out" } }], targetProfiles: [{ id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [{ layerId: "text", x: 100, y: 200, width: 1200, height: 300, zIndex: 0 }] }, { id: "vertical", enabled: false, reviewState: "ready", layerLayouts: [] }] });
    await api(`/management/alerts/${alert.id}/editor`, "PUT", { document: alertDocument });
    await page.goto(`${runtime.runtime.url}/manage/modules/alerts/editor/${alert.id}?profile=landscape`);
    await page.getByRole("button", { name: "Message Text", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Typography" }).click();
    const fontImported = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/assets/import"));
    await page.getByLabel("Upload reusable font", { exact: true }).setInputFiles(resolve("apps/web/node_modules/storybook/assets/browser/nunito-sans-regular.woff2"));
    const importedFont = await fontImported;
    expect(importedFont.status()).toBe(201);
    const font = await importedFont.json() as { id: string };
    await expect(page.getByLabel("Uploaded font", { exact: true })).not.toHaveValue("");
    await expect(page.getByLabel("Uploaded font", { exact: true })).toHaveValue(font.id);
    const editorSaved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/management/alerts/${alert.id}/editor`));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await editorSaved).status()).toBe(200);
    alertDocument = alertEditorDocumentSchema.parse(await api(`/management/alerts/${alert.id}/editor`));
    expect(alertDocument.layers[0]).toMatchObject({ type: "text", textStyle: { fontAssetId: font.id } });
    const key = await api("/management/overlay-outputs/keys", "POST", { scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }) as { url: string };
    const overlayResponse = await fetch(key.url); expect(overlayResponse.headers.get("x-frame-options")).toBeNull();
    expect((await fetch(`${runtime.runtime.url}/manage`)).headers.get("x-frame-options")).toBe("DENY");
    const runtimeOrigin = new URL(runtime.runtime.url);
    const overlayUrl = new URL(key.url);
    if (runtimeOrigin.protocol !== "http:" || runtimeOrigin.hostname !== "127.0.0.1" || overlayUrl.origin !== runtimeOrigin.origin) throw new Error("Owned OBS acceptance requires its fixed loopback runtime origin.");
    let music = (await api("/overlay-modules/music/config") as { config: MusicModuleConfig }).config;
    music = { ...music, profiles: { ...music.profiles, landscape: { ...music.profiles.landscape, initialView: "full", idleMode: "none", backgroundOpacity: 100,
      views: { full: { ...music.profiles.landscape.views.full, shadow: { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: "#00000000" } },
        compact: { ...music.profiles.landscape.views.compact, shadow: { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: "#00000000" } } } } } };
    music = { ...music, profiles: { ...music.profiles, vertical: { ...music.profiles.landscape } } };
    let timers = (await api("/overlay-modules/timers/config") as { config: TimersOverlayModuleConfig }).config;
    timers = { ...timers, profiles: { ...timers.profiles, landscape: { ...timers.profiles.landscape,
      appearance: { ...timers.profiles.landscape.appearance, cardWidthPx: 320, cardHeightPx: 80, maxVisible: 1, orientation: "vertical", stackGapPx: 0 },
      desktopPlacement: { x: 64, y: 500, scale: 1, zIndex: 0 } } } };
    timers = { ...timers, profiles: { ...timers.profiles, vertical: { ...timers.profiles.landscape, desktopPlacement: { x: 48, y: 900, scale: 1, zIndex: 0 } } } };
    let videos = (await api("/overlay-modules/videos/config") as { config: VideosModuleConfig }).config;
    videos = { ...videos, layout: { schemaVersion: 2, content: { width: 640, height: 460 }, desktopPlacement: { x: 269, y: 140, scale: 1 } } };
    await api("/overlay-modules/music/config", "PUT", { enabled: true, config: music });
    await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: timers });
    await api("/overlay-modules/videos/config", "PUT", { enabled: true, config: videos });
    const ordinary = async (moduleId: string, targetProfileId: "landscape" | "vertical" | null, dimensions: Dimensions): Promise<ObsSource> => {
      const result = await api("/management/overlay-outputs/keys", "POST", { scope: "module", moduleId, purpose: "live", targetProfileId }) as { url: string };
      expect(new URL(result.url).origin).toBe(runtimeOrigin.origin);
      return { id: targetProfileId === null ? moduleId : `${moduleId}-${targetProfileId}`, moduleId, profile: targetProfileId ?? "", url: result.url, ...dimensions };
    };
    // Independently specified dimensions: Music max saved view; Timer slots/badge + shadow reserve; Video saved box.
    const sources: ObsSource[] = [
      { id: "alerts", moduleId: "alerts", profile: "landscape", url: key.url, width: 1920, height: 1080 },
      await ordinary("music", "landscape", { width: 640, height: 178 }),
      await ordinary("music", "vertical", { width: 640, height: 178 }),
      await ordinary("timers", "landscape", { width: 416, height: 213 }),
      await ordinary("timers", "vertical", { width: 416, height: 213 }),
      await ordinary("videos", null, { width: 640, height: 460 }),
      ...retired.map(output => ({ id: output.id, moduleId: output.moduleId ?? "unified", profile: output.profile ?? "", width: 640, height: 460,
        url: `${runtime.runtime.url}/overlay/${output.scope === "unified" ? "unified" : `modules/${output.moduleId}`}/${output.purpose}/ovl_owned_${output.id}${output.profile === null ? "" : `?profile=${output.profile}`}` }))
    ];
    const composition = async (source: ObsSource) => {
      const url = new URL(source.url); url.pathname += "/composition";
      const response = await fetch(url); expect(response.status, "Owned ordinary composition is authorized").toBe(200);
      return overlayCompositionSchema.parse(await response.json());
    };
    const contentSources = sources.slice(1, 6);
    for (const source of contentSources) expect((await composition(source)).canvas).toMatchObject({ kind: "content", width: source.width, height: source.height, origin: { x: 0, y: 0 } });
    // Raw URLs are private owned coordination input; never promote this manifest as evidence.
    await writeFile(join(coord, "sources.json"), JSON.stringify({ sources }));
    const deniedRequests = new Map<string, number>();
    // Observe the existing owned service; no proxy, alternate shell, or authorization stub.
    const observeDenied = (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? "/", runtimeOrigin.origin);
      const source = sources.find(source => source.id.startsWith("retired-") && new URL(source.url).pathname === url.pathname);
      if (source === undefined) return;
      response.once("finish", () => {
        if (response.statusCode === 401 && response.getHeader("location") === undefined) deniedRequests.set(source.id, (deniedRequests.get(source.id) ?? 0) + 1);
      });
    };
    runtime.runtime.composition.app.server.on("request", observeDenied);
    removeRequestObserver = () => runtime.runtime.composition.app.server.off("request", observeDenied);
    const executable = join(portable, "bin/64bit/obs64.exe");
    child = spawn(executable, [...rendererArguments, "--portable", "--multi", "--minimize-to-tray", "--disable-updater", "--only-bundled-plugins", "--disable-missing-files-check", "--profile", "SecurityTest", "--collection", "SecurityTest"], { cwd: dirname(executable), windowsHide: true, stdio: "ignore" });
    await expect.poll(async () => {
      const error = await readFile(join(coord, "error.txt"), "utf8").catch(() => null); if (error !== null) throw new Error(error);
      if (child!.exitCode !== null) throw new Error(`Owned OBS exited ${child!.exitCode} before browser readiness`);
      return access(join(coord, "ready.json")).then(() => true, () => false);
    }, { timeout: 30000 }).toBe(true);
    if (renderer === "d3d11-ci") {
      const startupLogs = await readdir(join(config, "logs"));
      const startupLog = await readFile(join(config, "logs", startupLogs.sort().at(-1)!), "utf8");
      if (!/Loading up D3D11 on adapter Microsoft Basic Render Driver\b/iu.test(startupLog)) throw new Error("d3d11-ci requires OBS startup confirmation of Microsoft Basic Render Driver before synthetic playback.");
      await test.info().attach("verified-ci-software-adapter", { body: "Microsoft Basic Render Driver confirmed in owned OBS startup log before synthetic playback.", contentType: "text/plain" });
    }
    await expect.poll(async () => (await api("/management/overlay-clients") as unknown[]).length, { timeout: 30000 }).toBeGreaterThan(0);
    let selected = sources[0]!;
    let viewport: Dimensions = { width: selected.width, height: selected.height };
    let sequence = 0;
    const request = async (op: "select" | "resize" | "reconnect" | "capture", phase: string, matte?: "black" | "white") => {
      const id = `${phase}-${++sequence}`;
      await writeFile(join(coord, "request.tmp"), JSON.stringify({ id, op, sourceId: selected.id, matte, ...viewport }));
      // Windows may deny replacement while Lua briefly holds the previous file.
      // Retry only atomic publication of this same ID, never the native command.
      for (let attempt = 0; ; attempt++) {
        try { await rename(join(coord, "request.tmp"), join(coord, "request.json")); break; }
        catch (error) {
          if (attempt >= 20 || !(error instanceof Error) || !("code" in error) || !["EPERM", "EACCES"].includes(String(error.code))) throw error;
          await delay(50);
        }
      }
      return id;
    };
    const command = async (op: "select" | "resize" | "reconnect", phase: string, size: Dimensions = selected) => {
      viewport = { width: size.width, height: size.height };
      const id = await request(op, phase);
      await expect.poll(async () => {
        const error = await readFile(join(coord, "error.txt"), "utf8").catch(() => null);
        if (error !== null) throw new Error(error);
        return access(join(coord, `command-${id}.json`)).then(() => true, () => false);
      }, { timeout: 15000, intervals: [100] }).toBe(true);
    };
    const capture = async (phase: string) => {
      const images: string[] = [];
      const receipts: ObsReceipt[] = [];
      // OBS frontend PNGs are RGB. Observe the actual browser over black and white
      // native color sources; do not infer transparency from decoded PNG alpha.
      for (const matte of ["black", "white"] as const) {
        const id = await request("capture", `${phase}-${matte}`, matte);
        // Lua answers within a few 100 ms ticks; the default poll backoff would add up to a second per matte.
        await expect.poll(() => access(join(coord, `capture-${id}.json`)).then(() => true, () => false), { timeout: 15000, intervals: [100] }).toBe(true);
        const receipt = JSON.parse(await readFile(join(coord, `capture-${id}.json`), "utf8")) as ObsReceipt;
        expect(receipt).toMatchObject({ sourceId: selected.id, moduleId: selected.moduleId, profile: selected.profile,
          nativeWidth: viewport.width, nativeHeight: viewport.height, settingsWidth: viewport.width, settingsHeight: viewport.height,
          muted: true, monitoring: 0, shutdown: false, rerouteAudio: true });
        expect(receipt.path).toBeDefined();
        expect(resolve(receipt.path!).startsWith(resolve(root) + sep), "OBS screenshots must stay in the owned portable profile").toBe(true);
        const image = await readFile(receipt.path!);
        lastSyntheticScreenshot = image;
        images.push(image.toString("base64")); receipts.push(receipt);
      }
      const pixels = await page.evaluate(async ({ images, width, height, viewport, moduleId }) => {
        const mattes: Uint8ClampedArray[] = [];
        for (const base64 of images) {
          const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
          if (image.width !== 1920 || image.height !== 1080) throw new Error("Owned OBS native scene screenshot dimensions changed.");
          const canvas = document.createElement("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
          const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
          mattes.push(context.getImageData(0, 0, canvas.width, canvas.height).data);
        }
        const black = mattes[0]!; const white = mattes[1]!;
        let pink = 0; let coveredPixels = 0; let outsidePixels = 0;
        let left = viewport.width; let top = viewport.height; let right = -1; let bottom = -1;
        const covered = (i: number) => black[i] !== 0 || black[i + 1] !== 0 || black[i + 2] !== 0 || white[i] !== 255 || white[i + 1] !== 255 || white[i + 2] !== 255;
        for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) {
          const i = (y * viewport.width + x) * 4;
          if (!covered(i)) continue;
          coveredPixels++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
          if (x >= width || y >= height) outsidePixels++;
          if (black[i]! > 180 && black[i + 1]! < 100 && black[i + 2]! > 180) pink++;
        }
        const hash = async (w: number, h: number) => {
          const cropWidth = Math.min(w, viewport.width); const cropHeight = Math.min(h, viewport.height);
          const data = new Uint8Array(cropWidth * cropHeight * 8);
          for (let y = 0; y < cropHeight; y++) for (let x = 0; x < cropWidth; x++) {
            const i = (y * viewport.width + x) * 4; const target = (y * cropWidth + x) * 8;
            data.set(black.subarray(i, i + 4), target); data.set(white.subarray(i, i + 4), target + 4);
          }
          const digest = await crypto.subtle.digest("SHA-256", data);
          return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        };
        const probe = moduleId === "timers" ? { x: 68, y: 60 } : moduleId === "videos" ? { x: Math.floor(width / 2), y: height - 12 } : { x: 20, y: 20 };
        return { ...viewport, pink, coveredPixels, outsidePixels,
          bounds: coveredPixels === 0 ? null : { left, top, right, bottom },
          anchorCovered: probe.x < viewport.width && probe.y < viewport.height && covered((probe.y * viewport.width + probe.x) * 4),
          contentHash: await hash(width, height), prefixHash: await hash(width - 64, height - 32) };
      }, { images, width: selected.width, height: selected.height, viewport, moduleId: selected.moduleId });
      expect(pixels).toMatchObject({ width: viewport.width, height: viewport.height });
      const native = receipts.map(receipt => ({ ...receipt, path: undefined }));
      geometryEvidence.push({ phase, native, pixels });
      return pixels;
    };
    expect((await capture("baseline")).pink).toBe(0);
    await api(`/management/alerts/${alert.id}/editor/test`, "POST", { document: alertDocument, targetProfileId: "landscape", samplePayload: { actor: { displayName: "Pink fixture" } }, includeAudio: false, includeTts: false });
    playbackTriggered = true;
    await expect.poll(async () => (await capture("render")).pink, { timeout: 20000 }).toBeGreaterThan(100);

    const connectedIds = async (source: ObsSource) => (await api("/management/overlay-clients") as OverlayClientView[])
      .filter(client => client.connectionState === "connected" && client.scope === "module" && client.purpose === "live" && client.moduleId === source.moduleId && (client.targetProfileId ?? "") === source.profile)
      .map(client => client.id);
    const waitConnected = async (source: ObsSource) => {
      await expect.poll(async () => (await connectedIds(source)).length, { timeout: 20000 }).toBe(1);
      return (await connectedIds(source))[0]!;
    };
    // Idle is observed before registering a track or starting a Timer. Browser sources retain recommended sizes.
    for (const source of contentSources) {
      selected = source; await command("select", `${source.id}-idle`); await waitConnected(source);
      expect((await capture(`${source.id}-idle`)).coveredPixels).toBe(0);
    }
    pear = await startPearProtocolFixture();
    pear.setSong({ status: 200, body: { videoId: "obs-static-track", title: "Owned OBS track", artist: "Fixture", album: "Local", songDuration: 180, elapsedSeconds: 12, isPaused: true } });
    const configuration = { baseUrl: pear.baseUrl, transport: "poll" };
    const attempt = await api("/management/music/pairing", "POST", configuration) as { attemptId: string };
    await expect.poll(async () => (await api(`/management/music/pairing/${attempt.attemptId}`) as { status: string }).status, { timeout: 10000 }).toBe("approved");
    const setup = { kind: "pear-desktop", name: "Owned OBS Pear", configuration, pairingAttemptId: attempt.attemptId };
    expect(await api("/management/providers/validate", "POST", setup)).toMatchObject({ valid: true });
    expect(await api("/management/providers", "POST", setup)).toMatchObject({ status: "registered" });
    const timer = await api("/timers", "POST", { label: "Owned paused Timer", durationMs: 120000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } }) as { id: string };
    await api(`/timers/${timer.id}/start`, "POST"); await api(`/timers/${timer.id}/pause`, "POST");
    const pausedBefore = await api("/timers/state");
    // The production no-clip notice lasts five seconds, shorter than a delivery plus two native OBS captures on the
    // CI software renderer. Keep it continuously current while a Video source is measured: reissue it every two
    // seconds, so each capture sees the same visible notice whatever the bus latency, then prove every reissued
    // journal row was admitted by the Videos consumer (never no-match or failed).
    const noticePayload = { action: { kind: "simulate-external", identity: { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" }, payload: { source: "StreamJams", type: "VideoRequest", action: "no-clip", displayName: "Owned OBS fixture" } } };
    let noticeError: unknown; let noticesIssued = 0;
    const issueNotice = async () => {
      const receipt = await api("/management/events/manual", "POST", noticePayload) as { busId: string; consumers: Array<{ consumerId: string; outcome: string }> };
      expect(["admitted", "pending"], `Videos consumer outcome for fresh no-clip ${receipt.busId}`).toContain(receipt.consumers.find(consumer => consumer.consumerId === "videos")?.outcome);
      noticesIssued++;
    };
    const startNotices = async () => {
      let active = true;
      await issueNotice();
      await expect.poll(async () => (await composition(selected)).modules[0]?.presentation, { timeout: 15000 }).toMatchObject({ kind: "videos", videos: { status: "notice" } });
      const loop = (async () => { while (active) { await delay(2000); if (active) await issueNotice(); } })().catch((error: unknown) => { noticeError = error; });
      return () => { active = false; return loop; };
    };
    const snapshot = async (phase: string) => { if (noticeError !== undefined) throw noticeError; return capture(phase); };
    const stable = async (phase: string) => {
      let previous = await snapshot(phase);
      await expect.poll(async () => {
        const next = await snapshot(phase);
        const settled = next.coveredPixels > 100 && next.contentHash === previous.contentHash;
        previous = next; return settled;
      }, { timeout: 15000 }).toBe(true);
      return previous;
    };
    const savePlacement = async (source: ObsSource) => {
      if (source.moduleId === "music") {
        const offset = source.profile === "vertical" ? 40 : 0;
        music = { ...music, desktopPlacement: { full: { x: 120 + offset, y: 220 + offset }, compact: { x: 140 + offset, y: 240 + offset } }, desktopScale: { full: .75, compact: .6 } };
        await api("/overlay-modules/music/config", "PUT", { enabled: true, config: music });
      } else if (source.moduleId === "timers") {
        const profile = source.profile as "landscape" | "vertical";
        timers = { ...timers, profiles: { ...timers.profiles, [profile]: { ...timers.profiles[profile], desktopPlacement: { x: 400, y: 200, scale: .75, zIndex: 9 } } } };
        await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: timers });
      } else {
        videos = { ...videos, layout: { ...videos.layout, desktopPlacement: { x: 1200, y: 700, scale: .5 } } };
        await api("/overlay-modules/videos/config", "PUT", { enabled: true, config: videos });
      }
    };
    const saveContentSize = async (source: ObsSource): Promise<Dimensions> => {
      if (source.moduleId === "music") {
        const profile = source.profile as "landscape" | "vertical";
        music = { ...music, profiles: { ...music.profiles, [profile]: { ...music.profiles[profile],
          views: { ...music.profiles[profile].views, full: { ...music.profiles[profile].views.full, widthPx: 560 } } } } };
        await api("/overlay-modules/music/config", "PUT", { enabled: true, config: music });
        return { width: 560, height: 178 };
      }
      if (source.moduleId === "timers") {
        const profile = source.profile as "landscape" | "vertical";
        timers = { ...timers, profiles: { ...timers.profiles, [profile]: { ...timers.profiles[profile],
          appearance: { ...timers.profiles[profile].appearance, cardWidthPx: 360 } } } };
        await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: timers });
        return { width: 456, height: 213 };
      }
      videos = { ...videos, layout: { ...videos.layout, content: { width: 480, height: 320 } } };
      await api("/overlay-modules/videos/config", "PUT", { enabled: true, config: videos });
      return { width: 480, height: 320 };
    };
    for (const source of contentSources) {
      selected = source; await command("select", `${source.id}-active`); await waitConnected(source);
      const stopNotices = source.moduleId === "videos" ? await startNotices() : undefined;
      const baseline = await stable(`${source.id}-active`);
      expect(baseline.anchorCovered, "Content renders at its browser-local anchor").toBe(true);
      expect(baseline.outsidePixels).toBe(0);
      expect(baseline.bounds!.right).toBeLessThan(source.width); expect(baseline.bounds!.bottom).toBeLessThan(source.height);
      if (source.moduleId === "music") expect(baseline.bounds).toEqual({ left: 0, top: 0, right: 639, bottom: 177 });
      if (source.moduleId === "videos") expect(baseline.bounds!.bottom).toBe(459);
      const before = await composition(source); const clientBefore = await waitConnected(source);
      await savePlacement(source);
      const after = await composition(source);
      expect(after.canvas).toEqual({ ...before.canvas, configRevision: after.canvas.configRevision });
      expect(after.canvas.configRevision).toBeGreaterThan(before.canvas.configRevision);
      const presentation = after.modules[0]?.presentation;
      if (source.moduleId === "music") {
        expect(presentation).toMatchObject({ kind: "music-widget", widget: { layout: { x: 0, y: 0 } } });
        if (presentation?.kind === "music-widget") expect(presentation.widget.renderScale ?? 1).toBe(1);
      }
      else if (source.moduleId === "timers") expect(presentation).toMatchObject({ kind: "timer-stack", stack: { region: { layout: { x: 48, y: 40 } } } });
      else expect(presentation).toMatchObject({ kind: "videos", videos: { layout: { desktopPlacement: { x: 0, y: 0, scale: 1 } } } });
      expect((await stable(`${source.id}-desktop-save`)).contentHash).toBe(baseline.contentHash);
      expect(await connectedIds(source), "Saving desktop placement keeps the existing ordinary recipient").toEqual([clientBefore]);
      await command("resize", `${source.id}-extra`, { width: source.width + 80, height: source.height + 60 });
      const extra = await stable(`${source.id}-extra`);
      expect(extra.outsidePixels, "Extra OBS viewport remains transparent").toBe(0); expect(extra.contentHash).toBe(baseline.contentHash);
      await command("resize", `${source.id}-clipped`, { width: source.width - 64, height: source.height - 32 });
      await expect.poll(async () => (await snapshot(`${source.id}-clipped`)).contentHash,
        { timeout: 15000, message: "Smaller OBS viewport clips the original pixels without fit-to-viewport scaling" }).toBe(baseline.prefixHash);
      await command("resize", `${source.id}-recommended`); await waitConnected(source);
      const originalSourceSize = { width: viewport.width, height: viewport.height };
      const resized = await saveContentSize(source);
      source.width = resized.width; source.height = resized.height;
      const updated = await composition(source);
      expect(updated.canvas).toMatchObject({ width: resized.width, height: resized.height, origin: { x: 0, y: 0 } });
      expect(updated.canvas.configRevision).toBeGreaterThan(after.canvas.configRevision);
      const savedAtOldViewport = await stable(`${source.id}-saved-size-old-obs-viewport`);
      expect(savedAtOldViewport).toMatchObject(originalSourceSize); // App saves do not automatically resize OBS.
      expect(savedAtOldViewport.outsidePixels).toBe(0);
      await command("resize", `${source.id}-apply-recommended-size`);
      const resizedPixels = await stable(`${source.id}-new-recommended-size`);
      const priorConnection = await waitConnected(source);
      await command("reconnect", `${source.id}-reconnect`);
      await expect.poll(async () => { const ids = await connectedIds(source); return ids.length === 1 && ids[0] !== priorConnection; }, { timeout: 20000 }).toBe(true);
      expect((await stable(`${source.id}-reconnect`)).contentHash).toBe(resizedPixels.contentHash);
      if (stopNotices !== undefined) {
        await stopNotices(); if (noticeError !== undefined) throw noticeError;
        await expect.poll(async () => {
          const notices = (await api("/management/diagnostics/event-bus") as EventBusActivityView).events.filter(event => event.kind === "manual" && event.eventType === "simulate-external");
          return { count: notices.length, videos: [...new Set(notices.map(event => event.consumers.find(consumer => consumer.consumerId === "videos")?.outcome))] };
        }, { timeout: 10000, message: "Every reissued no-clip journal row is admitted by the Videos consumer" }).toEqual({ count: noticesIssued, videos: ["admitted"] });
      }
      const config = source.moduleId === "music" ? music : source.moduleId === "timers" ? timers : videos;
      await api(`/overlay-modules/${source.moduleId}/config`, "PUT", { enabled: false, config });
      await expect.poll(async () => (await capture(`${source.id}-disabled`)).coveredPixels, { timeout: 15000 }).toBe(0);
      await command("reconnect", `${source.id}-disabled-reconnect`); await waitConnected(source);
      expect((await capture(`${source.id}-disabled-reconnect`)).coveredPixels).toBe(0);
      expect((await composition(source)).canvas).toMatchObject({ width: source.width, height: source.height, origin: { x: 0, y: 0 } });
      await api(`/overlay-modules/${source.moduleId}/config`, "PUT", { enabled: true, config });
    }
    expect(await api("/timers/state"), "Paused Timer generation and remaining time survive browser geometry/source lifecycle").toEqual(pausedBefore);
    expect(await api("/videos/live")).toMatchObject({ items: [], current: null });

    // These are known pre-upgrade credentials, not fabricated ordinary URLs or a management fallback.
    for (const source of sources.filter(source => source.id.startsWith("retired-"))) {
      selected = source;
      const response = await fetch(source.url, { redirect: "manual" });
      expect(response.status, "Retired shell denies access without redirect").toBe(401); expect(response.headers.get("location")).toBeNull();
      const html = await response.text(); expect(html).not.toMatch(/<script|<iframe|<video|<audio|<img|\/manage|Stream Jams/iu);
      expect(html).not.toContain(`ovl_owned_${source.id}`);
      const deniedBefore = deniedRequests.get(source.id) ?? 0;
      await command("select", `${source.id}-blank`);
      await expect.poll(() => deniedRequests.get(source.id) ?? 0, { timeout: 15000 }).toBeGreaterThan(deniedBefore);
      // Capture after the actual OBS HTTP denial has finished, then sample again across native frames.
      for (let sample = 0; sample < 3; sample++) expect((await capture(`${source.id}-blank`)).coveredPixels).toBe(0);
      const deniedBeforeReconnect = deniedRequests.get(source.id) ?? 0;
      await command("reconnect", `${source.id}-reconnect`);
      await expect.poll(() => deniedRequests.get(source.id) ?? 0, { timeout: 15000 }).toBeGreaterThan(deniedBeforeReconnect);
      expect((await capture(`${source.id}-reconnect`)).coveredPixels).toBe(0);
      const denied = new URL(source.url); denied.pathname += "/composition";
      expect((await fetch(denied)).status).toBe(401);
      await expect.poll(async () => (await api("/management/overlay-clients") as OverlayClientView[]).filter(client => client.connectionState === "connected").length, { timeout: 10000 }).toBe(0);
      geometryEvidence.push({ phase: `${source.id}-authority`, shellStatus: 401, redirected: false, completedObsDenials: (deniedRequests.get(source.id) ?? 0) - deniedBefore });
    }
    await test.info().attach("ordinary-source-geometry", { body: JSON.stringify({ observations: geometryEvidence,
      scope: "Owned portable OBS native black/white matte composites detect visible coverage without claiming numeric alpha; actual browser source dimensions and native settings; Video uses bounded no-clip notice, not provider picture; no CPU/GPU/encoder/cadence/audio/input measurement" }, null, 2), contentType: "application/json" });
    const logs = await readdir(join(config, "logs"));
    const log = await readFile(join(config, "logs", logs.sort().at(-1)!), "utf8");
    expect(log).toMatch(/Portable mode:\s*true/iu);
    expect(log).not.toMatch(/obs-websocket|aitum-stream-suite|obs_google_caption/iu);
    expect(log).not.toMatch(/Error loading script|Failed to load.*frontend-tools/iu);
    const listeners = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$obsOwnedIds=[System.Collections.Generic.HashSet[int]]::new(); $null=$obsOwnedIds.Add(${child.pid}); $obsProcesses=Get-CimInstance Win32_Process; for($i=0;$i -lt 10;$i++){foreach($p in $obsProcesses){if($obsOwnedIds.Contains([int]$p.ParentProcessId)){$null=$obsOwnedIds.Add([int]$p.ProcessId)}}}; ConvertTo-Json -Compress -InputObject @(Get-NetTCPConnection -State Listen | Where-Object {$obsOwnedIds.Contains([int]$_.OwningProcess)} | Select-Object LocalAddress,LocalPort)`], { windowsHide: true, timeout: 10000 });
    expect(listeners.stdout.trim()).toBe("[]");
  } catch (error) {
    failures.push(error);
    try {
      const clients = await runtime.request("/management/overlay-clients");
      const diagnostics = await runtime.request("/diagnostics?limit=100");
      failureSnapshot = { playbackTriggered, geometryEvidence, clientsStatus: clients.status, clients: await clients.json(), diagnosticsStatus: diagnostics.status, diagnostics: await diagnostics.json() };
    } catch (snapshotError) { failures.push(snapshotError); }
  } finally {
    try {
    if (child?.pid !== undefined && child.exitCode === null) {
      await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$obsTestProcess=Get-Process -Id ${child.pid}; $null=$obsTestProcess.CloseMainWindow(); if(-not $obsTestProcess.WaitForExit(5000)){ $obsOwned=Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}'; if(-not $obsOwned.ExecutablePath.StartsWith('${portable.replaceAll("'", "''")}')){throw 'Owned OBS executable path mismatch'}; taskkill.exe /PID ${child.pid} /T /F | Out-Null; if(-not $obsTestProcess.WaitForExit(5000)){throw 'Owned OBS did not exit'} }`], { windowsHide: true, timeout: 20000 });
      await expect.poll(() => child!.exitCode !== null, { timeout: 5000 }).toBe(true);
    }
    } catch (error) { failures.push(error); }
    try {
    if (failures.length) {
      const redactor = createRedactor();
      if (lastSyntheticScreenshot !== undefined) await writeFile(test.info().outputPath("last-synthetic-source.png"), lastSyntheticScreenshot);
      if (failureSnapshot !== undefined) await writeFile(test.info().outputPath("runtime-status.json"), redactor.redactText(JSON.stringify(failureSnapshot, null, 2)));
      const safeLogs = test.info().outputPath("obs-logs"); await mkdir(safeLogs, { recursive: true });
      for (const file of await readdir(join(portable, "config/obs-studio/logs")).catch(() => [] as string[])) {
        await writeFile(join(safeLogs, file), redactor.redactText(await readFile(join(portable, "config/obs-studio/logs", file), "utf8")));
      }
      const safeCoord = test.info().outputPath("coord"); await mkdir(safeCoord, { recursive: true });
      for (const file of await readdir(coord)) if (/^(?:ready\.json|command-[A-Za-z0-9-]+\.json|capture-[A-Za-z0-9-]+\.json|error\.txt)$/u.test(file)) {
        await writeFile(join(safeCoord, file), redactor.redactText(await readFile(join(coord, file), "utf8")));
      }
    }
    } catch (error) { failures.push(error); }
    try {
      removeRequestObserver?.();
      await runtime.stop();
      if (failures.length) await writeFile(test.info().outputPath("runtime-logs.txt"), createRedactor().redactText(await runtime.readLogs()));
    } catch (error) { failures.push(error); }
    finally { try { await runtime.close(); } finally { await pear?.close(); } }
    if (child === undefined || child.exitCode !== null) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  if (failures.length) throw new AggregateError(failures, `OBS acceptance failed; owned evidence retained if process exit unconfirmed: ${root}`);
});
