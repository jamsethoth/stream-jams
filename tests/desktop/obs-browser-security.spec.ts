import { createRedactor } from "../../apps/server/src/modules/security/redactor.js";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { alertEditorDocumentSchema, compatibilityAlertTextStyle, compatibilityAlertTextBoxStyle, createDefaultTextWarp } from "@stream-jams/core";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });
test("actual portable OBS browser renders scoped warped font pixels without management framing", async ({ page }) => {
  const renderer = process.env.STREAM_JAMS_TEST_OBS_RENDERER;
  if (renderer !== undefined && renderer !== "d3d11") throw new Error("STREAM_JAMS_TEST_OBS_RENDERER must be unset or d3d11.");
  const rendererArguments = renderer === "d3d11" ? ["--enable-gpu", "--use-gl=angle", "--use-angle=d3d11"] : [];
  await test.info().attach("controlled-renderer-mode", { body: JSON.stringify({ mode: renderer ?? "default", arguments: rendererArguments, scope: "owned test OBS only; no GPU blocklist bypass or guaranteed WARP support", sources: ["https://github.com/obsproject/obs-browser/blob/3f0a2cdf378939ebe3c6f9ab36d4ea100c25aac2/browser-app.cpp#L61-L68", "https://raw.githubusercontent.com/chromium/chromium/127.0.6533.120/ui/gl/gl_display.cc", "https://raw.githubusercontent.com/google/angle/e323abb5b08e13ebb3f0d1c59a680f60ecdfcfea/src/libANGLE/renderer/d3d/d3d11/Renderer11.cpp"] }, null, 2), contentType: "application/json" });
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
    await runtime.start();
    const api = async (path: string, method = "GET", body?: unknown) => { const result = await runtime.request(path, method, body); expect(result.ok, `${path}: ${result.status} ${result.ok ? "" : await result.clone().text()}`).toBe(true); return result.json(); };
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
    await writeFile(join(coord, "url.txt"), key.url);
    const executable = join(portable, "bin/64bit/obs64.exe");
    child = spawn(executable, [...rendererArguments, "--portable", "--multi", "--minimize-to-tray", "--disable-updater", "--only-bundled-plugins", "--disable-missing-files-check", "--profile", "SecurityTest", "--collection", "SecurityTest"], { cwd: dirname(executable), windowsHide: true, stdio: "ignore" });
    await expect.poll(async () => {
      const error = await readFile(join(coord, "error.txt"), "utf8").catch(() => null); if (error !== null) throw new Error(error);
      if (child!.exitCode !== null) throw new Error(`Owned OBS exited ${child!.exitCode} before browser readiness`);
      return access(join(coord, "ready.json")).then(() => true, () => false);
    }, { timeout: 30000 }).toBe(true);
    await expect.poll(async () => (await api("/management/overlay-clients") as unknown[]).length, { timeout: 30000 }).toBeGreaterThan(0);
    const capture = async (id: string) => {
      await writeFile(join(coord, "request.txt"), id);
      await expect.poll(() => access(join(coord, `capture-${id}.json`)).then(() => true, () => false), { timeout: 15000 }).toBe(true);
      const result = JSON.parse(await readFile(join(coord, `capture-${id}.json`), "utf8")) as { path: string };
      expect(resolve(result.path).startsWith(resolve(root) + sep), "OBS screenshots must stay in the owned portable profile").toBe(true);
      const image = await readFile(result.path);
      lastSyntheticScreenshot = image;
      return page.evaluate(async base64 => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; let pink = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 180 && pixels[i + 1]! < 100 && pixels[i + 2]! > 180) pink++;
        return pink;
      }, image.toString("base64"));
    };
    expect(await capture("baseline")).toBe(0);
    await api(`/management/alerts/${alert.id}/editor/test`, "POST", { document: alertDocument, targetProfileId: "landscape", samplePayload: { actor: { displayName: "Pink fixture" } }, includeAudio: false, includeTts: false });
    playbackTriggered = true;
    await expect.poll(() => capture(`render-${Date.now()}`), { timeout: 20000 }).toBeGreaterThan(100);
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
      failureSnapshot = { playbackTriggered, clientsStatus: clients.status, clients: await clients.json(), diagnosticsStatus: diagnostics.status, diagnostics: await diagnostics.json() };
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
      for (const file of await readdir(coord)) if (file !== "url.txt") {
        await writeFile(join(safeCoord, file), redactor.redactText(await readFile(join(coord, file), "utf8")));
      }
    }
    } catch (error) { failures.push(error); }
    try {
      await runtime.stop();
      if (failures.length) await writeFile(test.info().outputPath("runtime-logs.txt"), createRedactor().redactText(await runtime.readLogs()));
    } catch (error) { failures.push(error); }
    finally { await runtime.close(); }
    if (child === undefined || child.exitCode !== null) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  if (failures.length) throw new AggregateError(failures, `OBS acceptance failed; owned evidence retained if process exit unconfirmed: ${root}`);
});
