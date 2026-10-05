import { expect, test } from "@playwright/test";
import { startMusicTestRuntime } from "./music-test-runtime.js";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import type { DesktopOverlayTransport, MusicModuleConfig } from "../../packages/core/dist/index.js";

const song = { videoId: "music-fixture-1", title: "Disposable Pear Track", artist: "Fixture Artist", album: "Fixture Album", songDuration: 180, elapsedSeconds: 12, isPaused: false };
type Key = { keyId: string; url: string };
const output = (purpose: "live" | "test", scope: "module" | "unified" = "module", targetProfileId: "landscape" | "vertical" | null = "landscape") =>
  ({ overlayId: "default", scope, moduleId: scope === "module" ? "music" : null, purpose, targetProfileId: scope === "module" ? targetProfileId : null });

test("built Music Sources page pairs, tests and saves against disposable Pear", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    await page.goto(`${fixture.url}/manage/music-sources`);
    await expect(page.getByText("No Music sources registered.")).toBeVisible();
    await expect(page.getByText("Music module: Disabled")).toBeVisible();
    await page.getByRole("button", { name: "Add Pear Desktop" }).click();
    await page.getByLabel("Connection name").fill("Fixture Pear");
    await page.getByLabel("Pear address").fill(fixture.pear.baseUrl);
    await page.getByLabel("Transport").selectOption("poll");
    await page.getByRole("button", { name: "Pair Pear Desktop" }).click();
    await expect(page.getByText("Pear approval: approved")).toBeVisible();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Connection test passed. Save to use this source.")).toBeVisible();
    await page.getByRole("button", { name: "Save source" }).click();
    await expect(page.getByRole("button", { name: "Fixture Pear" })).toBeVisible();
    expect(fixture.pear.requests.some(request => request.path.startsWith("/auth/") && request.authorization === undefined)).toBe(true);
    expect(fixture.pear.requests.some(request => request.path === "/api/v1/song" && request.authorization === "Bearer throwaway-token")).toBe(true);
    await page.getByRole("button", { name: "Enable Music" }).click();
    await expect(page.getByRole("button", { name: "Disable Music" })).toBeVisible();
    await expect.poll(() => fixture.runtime.composition.musicRuntimeCoordinator.getProjection("landscape")?.snapshot.track?.title).toBe(song.title);
  } finally { await fixture.close(); }
});

test("live, test and unified outputs follow Pear state, restart and route revocation", async ({ page, context }) => {
  test.setTimeout(120_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    const providerId = await fixture.register();
    expect(providerId).toBeTruthy();
    expect(fixture.runtime.composition.musicRuntimeCoordinator.getProjection("landscape")).toBeNull();
    const saved = await fixture.request<{ config: unknown }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    await expect.poll(() => fixture.runtime.composition.musicRuntimeCoordinator.getProjection("landscape")?.snapshot.track?.title).toBe(song.title);
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    const testKey = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("test"));
    const unified = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live", "unified"));
    const vertical = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live", "module", "vertical"));
    await page.goto(live.url);
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toContainText(song.title);
    const another = await context.newPage(); await another.goto(live.url);
    await expect(another.getByTestId("music-widget").locator(".sj-title")).toContainText(song.title);
    const testPage = await context.newPage(); await testPage.goto(testKey.url);
    await expect(testPage.getByTestId("music-widget")).toBeVisible();
    await expect(testPage.getByTestId("music-widget").locator(".sj-title")).not.toContainText(song.title);
    const unifiedPage = await context.newPage(); await unifiedPage.goto(unified.url);
    await expect(unifiedPage.getByTestId("music-widget").locator(".sj-title")).toContainText(song.title);
    const verticalPage = await context.newPage(); await verticalPage.goto(vertical.url);
    await expect(verticalPage.getByTestId("music-widget").locator(".sj-title")).toContainText(song.title);
    fixture.pear.setSong({ status: 204 });
    await expect(page.getByTestId("music-widget")).toHaveCount(0, { timeout: 10_000 });
    await expect(testPage.getByTestId("music-widget")).toBeVisible();
    fixture.pear.setSong({ status: 200, body: { ...song, title: "Recovered Track", elapsedSeconds: 24, isPaused: true } });
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toContainText("Recovered Track", { timeout: 10_000 });
    await expect(page.getByTestId("music-widget").locator(".sj-content")).toHaveAttribute("data-playback-state", "paused");
    await fixture.restart();
    await page.reload();
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toContainText("Recovered Track", { timeout: 10_000 });
    await fixture.request(`/management/overlay-outputs/keys/${live.keyId}`, "DELETE");
    const revoked = await page.request.get(live.url);
    expect([401, 403, 404]).toContain(revoked.status());
    await another.close(); await testPage.close(); await unifiedPage.close(); await verticalPage.close();
  } finally { await fixture.close(); }
});

test("automatic transport falls back only on unavailability and WS-only refuses it", async () => {
  test.setTimeout(80_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    fixture.pear.setWsStatus(503);
    const auto = await fixture.register("Automatic fixture", "auto");
    expect(auto).toBeTruthy();
    expect(fixture.pear.requests.some(request => request.path === "/api/v1/song" && request.authorization === "Bearer throwaway-token")).toBe(true);
    const claim = await fixture.pair("ws");
    const refused = await fixture.request<{ valid: boolean }>("/management/providers/validate", "POST", { kind: "pear-desktop", name: "WS only", ...claim });
    expect(refused.valid).toBe(false);
    fixture.pear.setWsStatus(403);
    const deniedClaim = await fixture.pair("auto");
    const denied = await fixture.request<{ valid: boolean }>("/management/providers/validate", "POST", { kind: "pear-desktop", name: "Revoked", ...deniedClaim });
    expect(denied.valid).toBe(false);
  } finally { await fixture.close(); }
});

test("source selection, seek, idle timeout and revoked Pear authorization clear live Music", async ({ page }) => {
  test.setTimeout(100_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    const first = await fixture.register("First Pear");
    const second = await fixture.register("Second Pear");
    const saved = await fixture.request<{ config: { profiles: Record<string, Record<string, unknown>> } }>("/overlay-modules/music/config");
    const profiles = structuredClone(saved.config.profiles);
    profiles.landscape = { ...profiles.landscape, idleMode: "hide", idleAfterSeconds: 1 };
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: { ...saved.config, profiles } });
    await fixture.request(`/management/providers/${first}/activate`, "POST", {});
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    await page.goto(live.url);
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toContainText(song.title);
    const firstGeneration = fixture.runtime.composition.musicRuntimeCoordinator.generation;
    await expect(page.getByTestId("music-widget")).toHaveCount(0, { timeout: 6_000 });
    expect(fixture.pear.requests.filter(request => request.path === "/api/v1/song").length).toBeGreaterThan(1);
    await fixture.request(`/management/providers/${second}/activate`, "POST", {});
    await expect.poll(() => fixture.runtime.composition.musicRuntimeCoordinator.generation).not.toBe(firstGeneration);
    await expect(page.getByTestId("music-widget")).toBeVisible();
    fixture.pear.setSong({ status: 200, body: { ...song, videoId: "second-song", title: "Seeked Track", elapsedSeconds: 95, isPaused: true } });
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toContainText("Seeked Track", { timeout: 10_000 });
    await expect(page.getByTestId("music-widget").locator(".sj-time")).toContainText("1:35");
    fixture.pear.setSong({ status: 401 });
    await expect.poll(() => fixture.runtime.composition.musicRuntimeCoordinator.getStatus().state, { timeout: 10_000 }).toBe("auth-required");
    await expect(page.getByTestId("music-widget")).toHaveCount(0);
    const status = await fixture.request<{ status: { state: string } }>("/management/music/status");
    expect(status.status.state).toBe("auth-required");
  } finally { await fixture.close(); }
});

test("transient pause, mute, skip, replay and DND do not command the Pear player", async ({ page }) => {
  test.setTimeout(70_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    await fixture.register();
    const saved = await fixture.request<{ config: unknown }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    await page.goto(live.url);
    const title = page.getByTestId("music-widget").locator(".sj-title");
    await expect(title).toContainText(song.title);
    for (const [route, body] of [["/playback/pause", undefined], ["/playback/mute", undefined], ["/playback/skip", undefined], ["/playback/do-not-disturb", { enabled: true }]] as const) {
      await fixture.request(route, "POST", body);
      await expect(title).toContainText(song.title);
    }
    const replay = await page.request.post(`${fixture.url}/playback/replay`, { headers: fixture.headers, data: { itemId: "missing" } });
    expect(replay.status()).toBeGreaterThanOrEqual(400);
    await expect(title).toContainText(song.title);
    expect(fixture.pear.requests.every(request => request.path.startsWith("/auth/") || request.path === "/api/v1/song")).toBe(true);
  } finally { await fixture.close(); }
});

test("provider artwork crosses the actual adapter, raster cache and authorized browser image route", async ({ page, context }) => {
  test.setTimeout(90_000);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  const fetches: string[] = [];
  const fixture = await startMusicTestRuntime({
    resolveAddresses: async () => ["8.8.8.8"],
    fetchBytes: async (url, address) => { fetches.push(`${url.hostname}:${address}`); return png; }
  });
  try {
    fixture.pear.setSong({ status: 200, body: { ...song, imageSrc: "https://i.ytimg.com/vi/fixture/default.jpg" } });
    await fixture.register();
    const saved = await fixture.request<{ config: unknown }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    await page.goto(live.url);
    const image = page.getByTestId("music-widget").locator(".sj-artwork img");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    expect(fetches).toEqual(["i.ytimg.com:8.8.8.8"]);
    expect(fixture.runtime.composition.musicArtworkService.counts.entries).toBe(1);
    const imageUrl = await image.getAttribute("src");
    expect(imageUrl).toMatch(/\/overlay\/modules\/music\/live\/.*\/artwork\/art_/u);
    const direct = await context.request.get(`${fixture.url}${imageUrl}`);
    expect(direct.status()).toBe(200);
    expect(direct.headers()["content-type"]).toContain("image/png");
    expect(JSON.stringify(await fixture.request("/management/music/status"))).not.toContain("ytimg");
    const replacementSource = await fixture.register("Second artwork source");
    await fixture.request(`/management/providers/${replacementSource}/activate`, "POST", {});
    await expect.poll(() => image.getAttribute("src")).not.toBe(imageUrl);
    const newImageUrl = await image.getAttribute("src");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    expect((await context.request.get(`${fixture.url}${imageUrl}`)).status()).toBeGreaterThanOrEqual(400);
    fixture.pear.setSong({ status: 204 });
    await expect(page.getByTestId("music-widget")).toHaveCount(0);
    const obsolete = await context.request.get(`${fixture.url}${newImageUrl}`);
    expect(obsolete.status()).toBeGreaterThanOrEqual(400);
  } finally { await fixture.close(); }
});

test("restore refuses an admitted Pear keyring mutation, then removes its credential on successful retry", async ({ page }) => {
  test.setTimeout(90_000);
  const secrets = new InMemorySecretStore();
  const fixture = await startMusicTestRuntime(undefined, secrets);
  try {
    fixture.pear.setSong({ status: 200, body: song });
    await fixture.request("/management/alert-sets");
    const archive = await fixture.request<Record<string, unknown>>("/management/settings/backup");
    const preflight = await fixture.request<{ archiveId: string; state: string }>("/management/settings/backup/preflight", "POST", archive);
    expect(preflight.state).toBe("valid");
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalSet = secrets.setSecret.bind(secrets);
    secrets.setSecret = async (ref, value) => {
      if (ref.namespace === "music" && ref.name === "access-token") { entered(); await blocked; }
      await originalSet(ref, value);
    };
    const registration = fixture.register();
    await started;
    const request = { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true };
    try {
      const refused = await page.request.post(`${fixture.url}/management/settings/backup/restore`, { headers: fixture.headers, data: request });
      expect(refused.status()).toBe(409);
      expect(await refused.text()).not.toContain("throwaway-token");
    } finally { release(); }
    expect(await registration).toBeTruthy();
    expect([...secrets.values.keys()].some(key => key.includes(":access-token"))).toBe(true);
    await fixture.request("/management/settings/backup/restore", "POST", request);
    expect((await fixture.request<unknown[]>("/management/providers?capability=music-source"))).toHaveLength(0);
    expect([...secrets.values.keys()].some(key => key.includes(":access-token"))).toBe(false);
    expect(await fixture.register("Fresh pairing after restore")).toBeTruthy();
  } finally { await fixture.close(); }
});

test("failed restore excludes a concurrent credential replacement and retains the rollback credential", async ({ page }) => {
  test.setTimeout(90_000);
  const secrets = new InMemorySecretStore();
  const fixture = await startMusicTestRuntime(undefined, secrets);
  try {
    fixture.pear.setSong({ status: 200, body: song });
    const providerId = await fixture.register();
    await fixture.request("/management/alert-sets");
    const archive = await fixture.request<Record<string, unknown>>("/management/settings/backup");
    const preflight = await fixture.request<{ archiveId: string; state: string }>("/management/settings/backup/preflight", "POST", archive);
    expect(preflight.state).toBe("valid");
    const claim = await fixture.pair();
    const oldCredentialKeys = [...secrets.values.keys()].filter(key => key.includes(":access-token"));
    expect(oldCredentialKeys).toHaveLength(1);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalUpdate = fixture.configStore.updateConfig.bind(fixture.configStore);
    fixture.configStore.updateConfig = async () => { entered(); await blocked; throw new Error("planned restore failure"); };
    const restoring = page.request.post(`${fixture.url}/management/settings/backup/restore`, { headers: fixture.headers,
      data: { archive, archiveId: preflight.archiveId, confirmation: "RESTORE", regenerateRouteKeys: true } });
    await started;
    try {
      const replacement = await page.request.post(`${fixture.url}/management/music/providers/${providerId}/credential`, { headers: fixture.headers,
        data: { pairingAttemptId: claim.pairingAttemptId, configuration: claim.configuration } });
      expect(replacement.status()).toBe(409);
    } finally { release(); }
    const failed = await restoring;
    expect(failed.status()).toBeGreaterThanOrEqual(400);
    fixture.configStore.updateConfig = originalUpdate;
    expect([...secrets.values.keys()].filter(key => key.includes(":access-token"))).toEqual(oldCredentialKeys);
    expect((await fixture.request<Array<{ id: string }>>("/management/providers?capability=music-source"))).toHaveLength(1);
    expect((await fixture.request<{ valid: boolean }>("/management/providers/validate", "POST", { kind: "pear-desktop", name: "retry", ...claim })).valid).toBe(true);
  } finally { await fixture.close(); }
});

test("blocked production desktop sync coalesces revisions and retains a pending test-output config refresh", async ({ page }) => {
  test.setTimeout(90_000);
  let blocked = false;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let musicSyncs = 0;
  const transport: DesktopOverlayTransport = {
    configure: async () => {}, prepare: async () => "ready", start: async () => {}, stop: async () => {}, retry: async () => {}, close: async () => {},
    getStatus: async () => ({ available: true, state: "ready", message: null,
      displays: [{ id: "monitor", label: "Test monitor", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] }),
    syncModule: async sync => { if (sync.moduleId === "music" && blocked) { musicSyncs += 1; if (musicSyncs === 1) { entered(); await gate; } } }
  };
  const fixture = await startMusicTestRuntime(undefined, new InMemorySecretStore(), transport);
  try {
    fixture.pear.setSong({ status: 200, body: song });
    await fixture.register();
    const saved = await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const testKey = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("test"));
    await page.goto(testKey.url);
    await expect(page.getByTestId("music-widget")).toBeVisible();
    blocked = true;
    const first = fixture.runtime.composition.musicRuntimeCoordinator.reconcile();
    await started;
    const changed = structuredClone(saved.config);
    changed.profiles.landscape.views.full.colors.title = "#112233FF";
    const saving = fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: changed });
    await expect.poll(async () => (await fixture.request<{ config: MusicModuleConfig }>("/overlay-modules/music/config")).config.profiles.landscape.views.full.colors.title).toBe("#112233FF");
    const revisions = await Promise.all(Array.from({ length: 30 }, () => fixture.runtime.composition.musicRuntimeCoordinator.reconcile()));
    expect(revisions).toHaveLength(30);
    expect(musicSyncs).toBe(1);
    release();
    await Promise.all([first, saving]);
    await expect.poll(() => musicSyncs).toBe(2);
    await expect(page.getByTestId("music-widget").locator(".sj-title")).toHaveCSS("color", "rgb(17, 34, 51)");
  } finally { release(); await fixture.close(); }
});

test("normal three-second Pear observations keep the same scrolling DOM and animation clock", async ({ page }) => {
  test.setTimeout(50_000);
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: { ...song, title: "Long observation title ".repeat(20) } });
    await fixture.register();
    const saved = await fixture.request<{ config: unknown }>("/overlay-modules/music/config");
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    await page.goto(live.url);
    const title = page.getByTestId("music-widget").locator(".sj-title");
    await expect(title).toHaveAttribute("data-scroll", "true");
    const element = await title.elementHandle();
    const before = await title.locator(".sj-scroll-text").evaluate(node => Number(node.getAnimations()[0]?.currentTime ?? -1));
    const polls = fixture.pear.requests.filter(request => request.path === "/api/v1/song").length;
    await expect.poll(() => fixture.pear.requests.filter(request => request.path === "/api/v1/song").length, { timeout: 10_000 }).toBeGreaterThan(polls);
    const current = await title.elementHandle();
    expect(await element!.evaluate((node, comparison) => node === comparison, current)).toBe(true);
    const after = await title.locator(".sj-scroll-text").evaluate(node => Number(node.getAnimations()[0]?.currentTime ?? -1));
    expect(after).toBeGreaterThan(before + 1_000);
  } finally { await fixture.close(); }
});


test("hidden Music reappears for a fresh idle period on resume", async ({ page }) => {
  const fixture = await startMusicTestRuntime();
  try {
    fixture.pear.setSong({ status: 200, body: song });
    fixture.pear.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    await fixture.register("Resume fixture", "ws");
    const saved = await fixture.request<{ config: import("../../packages/core/dist/index.js").MusicModuleConfig }>("/overlay-modules/music/config");
    saved.config.profiles.landscape.idleMode = "hide"; saved.config.profiles.landscape.idleAfterSeconds = 1;
    await fixture.request("/overlay-modules/music/config", "PUT", { enabled: true, config: saved.config });
    const live = await fixture.request<Key>("/management/overlay-outputs/keys", "POST", output("live"));
    await page.goto(live.url);
    await expect(page.getByTestId("music-widget")).toBeVisible();
    await expect(page.getByTestId("music-widget")).toHaveCount(0);
    fixture.pear.send({ type: "PLAYER_STATE_CHANGED", isPlaying: false });
    fixture.pear.send({ type: "PLAYER_STATE_CHANGED", isPlaying: true });
    await expect(page.getByTestId("music-widget")).toBeVisible();
    await expect(page.getByTestId("music-widget")).toHaveCount(0);
  } finally { await fixture.close(); }
});
