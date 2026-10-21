import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

const run = promisify(execFile);
type PageState = { href: string; text: string; refresh: string | null };

test.use({ trace: "off", screenshot: "off", video: "off" });
test("actual OBS sources loaded during a Stream Jams outage recover without operator action", async () => {
  test.setTimeout(240_000);
  const installed = process.env.STREAM_JAMS_TEST_OBS_DIR;
  if (installed === undefined) throw new Error("Set STREAM_JAMS_TEST_OBS_DIR to an installed OBS 32.2.2 directory; this acceptance requires real OBS with browser and websocket plugins");
  await access(join(installed, "bin/64bit/obs64.exe"));
  const root = await mkdtemp(join(tmpdir(), "stream-jams-obs-offline-"));
  const runtime = await createProviderSecurityRuntimeFixture();
  const [cdpPort, websocketPort] = [await unusedPort(), await unusedPort()];
  let obs: ChildProcess | undefined;
  let control: WebSocket | undefined;
  try {
    await runtime.start();
    const checked = async <T>(response: Response) => { expect(response.ok, await response.clone().text()).toBe(true); return await response.json() as T; };
    await checked(await runtime.request("/overlay-modules/timers/enabled", "PATCH", { enabled: true }));
    const timer = await checked<{ id: string }>(await runtime.request("/timers", "POST", { label: "OBS offline timer", durationMs: 600_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] } }));
    await checked(await runtime.request(`/timers/${timer.id}/start`, "POST"));
    const key = (targetProfileId: string) => runtime.request("/management/overlay-outputs/keys", "POST", { overlayId: "default", moduleId: "timers", purpose: "live", scope: "module", targetProfileId }).then(response => checked<{ url: string }>(response));
    const ordinary = (await key("landscape")).url;
    const hidden = (await key("vertical")).url;

    const portable = join(root, "obs");
    await Promise.all(["bin", "data/obs-studio", "data/libobs"].map(path => cp(join(installed, path), join(portable, path), { recursive: true })));
    const plugins = ["frontend-tools", "obs-browser", "obs-websocket", "image-source", "obs-transitions", "obs-outputs", "obs-x264", "obs-ffmpeg", "rtmp-services"];
    const dependencies = ["obs-browser-page.exe", "chrome_100_percent.pak", "chrome_200_percent.pak", "chrome_elf.dll", "icudtl.dat", "libcef.dll", "libEGL.dll", "libGLESv2.dll", "resources.pak", "v8_context_snapshot.bin"];
    await mkdir(join(portable, "obs-plugins/64bit"), { recursive: true });
    for (const file of [...plugins.map(name => `${name}.dll`), ...dependencies]) await cp(join(installed, "obs-plugins/64bit", file), join(portable, "obs-plugins/64bit", file));
    await cp(join(installed, "obs-plugins/64bit/locales"), join(portable, "obs-plugins/64bit/locales"), { recursive: true });
    for (const plugin of plugins) await cp(join(installed, "data/obs-plugins", plugin), join(portable, "data/obs-plugins", plugin), { recursive: true });
    await writeFile(join(portable, "portable_mode.txt"), "");
    const config = join(portable, "config/obs-studio");
    await Promise.all(["basic/profiles/Offline", "basic/scenes", "plugin_config/obs-websocket"].map(path => mkdir(join(config, path), { recursive: true })));
    // Owned loopback OBS only: the disposable websocket server has no password and a random port.
    await writeFile(join(config, "plugin_config/obs-websocket/config.json"), JSON.stringify({ alerts_enabled: false, auth_required: false, first_load: false, server_enabled: true, server_password: "", server_port: websocketPort }));
    await writeFile(join(config, "user.ini"), "[General]\nFirstRun=true\n[Basic]\nProfile=Offline\nProfileDir=Offline\nSceneCollection=Offline\nSceneCollectionFile=Offline\n");
    await writeFile(join(config, "basic/profiles/Offline/basic.ini"), "[General]\nName=Offline\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSType=0\nFPSCommon=30\n");
    await writeFile(join(config, "basic/scenes/Offline.json"), JSON.stringify({
      name: "Offline", current_scene: "Scene", current_program_scene: "Scene", scene_order: [{ name: "Scene" }],
      sources: [
        { name: "Scene", id: "scene", versioned_id: "scene", settings: { items: [{ name: "Ordinary", visible: true, id: 1 }, { name: "Shutdown when hidden", visible: true, id: 2 }], id_counter: 2 } },
        { name: "Ordinary", id: "browser_source", versioned_id: "browser_source", settings: { url: ordinary, width: 960, height: 540 } },
        { name: "Shutdown when hidden", id: "browser_source", versioned_id: "browser_source", settings: { url: hidden, width: 540, height: 960, shutdown: true } }
      ]
    }));
    const executable = join(portable, "bin/64bit/obs64.exe");
    const startObs = async () => {
      obs = spawn(executable, ["--portable", "--multi", "--minimize-to-tray", "--disable-updater", "--only-bundled-plugins", "--disable-missing-files-check", "--disable-shutdown-check", "--profile", "Offline", "--collection", "Offline", `--remote-debugging-port=${cdpPort}`], { cwd: dirname(executable), windowsHide: true, stdio: "ignore" });
      await expect.poll(async () => (await fetch(`http://127.0.0.1:${cdpPort}/json/version`).catch(() => null))?.ok ?? false, { timeout: 60_000 }).toBe(true);
      control = await connectObsWebSocket(websocketPort);
    };
    const stopObs = async () => {
      control?.close(); control = undefined;
      const child = obs; obs = undefined;
      if (child?.pid === undefined || child.exitCode !== null) return;
      const exited = new Promise(resolve => child.once("exit", resolve));
      // A graceful close lets CEF flush the service-worker registration to the profile.
      await run("taskkill", ["/PID", String(child.pid)]).catch(() => undefined);
      if (await Promise.race([exited.then(() => true), delay(15_000).then(() => false)]) === false) {
        await run("taskkill", ["/F", "/T", "/PID", String(child.pid)]).catch(() => undefined);
        await exited;
      }
    };
    const state = (url: string) => evaluateInSource<PageState>(cdpPort, url,
      `({ href: location.href, text: document.body ? document.body.innerText : "", refresh: document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content") ?? null })`);
    const showsTimer = async (url: string) => (await state(url))?.text.includes("OBS offline timer") ?? false;
    const showsFallback = async (url: string) => { const current = await state(url); return current?.href === url && current.text === "" && current.refresh === "2"; };
    const request = (requestType: string, requestData: object) => obsRequest(control!, requestType, requestData);

    await startObs();
    for (const url of [ordinary, hidden]) {
      await expect.poll(() => showsTimer(url), { timeout: 30_000 }).toBe(true);
      await expect.poll(() => evaluateInSource(cdpPort, url, "navigator.serviceWorker.ready.then(ready => new URL(ready.active.scriptURL).pathname)"), { timeout: 15_000 }).toBe("/overlay/offline-worker.js");
    }
    await stopObs();

    // OBS starts while Stream Jams is down: both sources load the transparent fallback instead of a browser error.
    await runtime.stop();
    await startObs();
    for (const url of [ordinary, hidden]) await expect.poll(() => showsFallback(url), { timeout: 30_000 }).toBe(true);

    // A shutdown-when-hidden source recreated during the outage gets the fallback too.
    const itemId = (await request("GetSceneItemId", { sceneName: "Scene", sourceName: "Shutdown when hidden" })).sceneItemId as number;
    await request("SetSceneItemEnabled", { sceneName: "Scene", sceneItemId: itemId, sceneItemEnabled: false });
    await delay(1_500);
    await request("SetSceneItemEnabled", { sceneName: "Scene", sceneItemId: itemId, sceneItemEnabled: true });
    await expect.poll(() => showsFallback(hidden), { timeout: 30_000 }).toBe(true);

    // Documented limit: OBS's Refresh reloads while ignoring the cache, which bypasses the worker.
    await request("PressInputPropertiesButton", { inputName: "Ordinary", propertyName: "refreshnocache" });
    await expect.poll(async () => (await state(ordinary))?.href, { timeout: 15_000 }).toBe("chrome-error://chromewebdata/");

    await runtime.start();
    await expect.poll(() => showsTimer(hidden), { timeout: 20_000 }).toBe(true);
    // The bypassed source stays on the error page until it is refreshed again with Stream Jams listening.
    expect((await state(ordinary))?.href).toBe("chrome-error://chromewebdata/");
    await request("PressInputPropertiesButton", { inputName: "Ordinary", propertyName: "refreshnocache" });
    await expect.poll(() => showsTimer(ordinary), { timeout: 20_000 }).toBe(true);
  } finally {
    control?.close();
    if (obs?.pid !== undefined && obs.exitCode === null) await run("taskkill", ["/F", "/T", "/PID", String(obs.pid)]).catch(() => undefined);
    await runtime.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});

/** Evaluates in the OBS browser source whose target URL is `url`, or its error page, through CEF remote debugging. */
async function evaluateInSource<T>(cdpPort: number, url: string, expression: string): Promise<T | undefined> {
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json() as Array<{ url: string; webSocketDebuggerUrl: string }>;
  const target = targets.find(candidate => candidate.url === url);
  if (target === undefined) return undefined;
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    return await new Promise<T | undefined>(resolve => {
      socket.addEventListener("message", event => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: T } } };
        if (message.id === 1) resolve(message.result?.result?.value);
      });
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    });
  } finally { socket.close(); }
}

async function connectObsWebSocket(port: number): Promise<WebSocket> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const identified = await new Promise<boolean>(resolve => {
      socket.addEventListener("error", () => resolve(false), { once: true });
      socket.addEventListener("message", event => {
        const message = JSON.parse(String(event.data)) as { op: number };
        if (message.op === 0) socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0 } }));
        if (message.op === 2) resolve(true);
      });
    });
    if (identified) return socket;
    if (Date.now() > deadline) throw new Error("The owned OBS websocket server did not accept a connection");
    await delay(1_000);
  }
}

let nextRequestId = 0;
async function obsRequest(socket: WebSocket, requestType: string, requestData: object): Promise<Record<string, unknown>> {
  const requestId = String(++nextRequestId);
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as { op: number; d: { requestId?: string; requestStatus?: { result: boolean; comment?: string }; responseData?: Record<string, unknown> } };
      if (message.op !== 7 || message.d.requestId !== requestId) return;
      socket.removeEventListener("message", onMessage);
      if (message.d.requestStatus?.result === true) resolve(message.d.responseData ?? {});
      else reject(new Error(`${requestType} failed: ${message.d.requestStatus?.comment ?? "unknown"}`));
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("Could not reserve a loopback port");
  return address.port;
}
