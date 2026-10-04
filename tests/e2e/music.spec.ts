import { expect, test } from "@playwright/test";
import { startMusicTestRuntime } from "./music-test-runtime.js";

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
