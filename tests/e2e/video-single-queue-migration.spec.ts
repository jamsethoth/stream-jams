import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createPreMigrationDatabase } from "../../apps/server/src/test-support/pre-migration-database.js";
import { createProviderSecurityRuntimeFixture, createProviderSocket } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("old test requests migrate held, retired callers cannot mutate, and explicit ordinary Play releases review", async ({ page }) => {
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    using old = createPreMigrationDatabase("046-single-video-queue");
    const retiredKey = "ovl_disposable_pre046_video_test_key";
    old.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,created_at,revoked_at,target_profile_id) VALUES ('retired-video','default','videos','test','module',?,'2026-10-11T00:00:00.000Z',NULL,NULL)")
      .run(`sha256:${createHash("sha256").update(retiredKey).digest("hex")}`);
    const bytes = await readFile("apps/web/public/storybook-assets/tiny-video.mp4");
    old.connection.prepare("INSERT INTO asset_metadata (id,original_file_name,media_type,mime_type,size_bytes,checksum,storage_path,duration_ms) VALUES ('tiny-existing','tiny-video.mp4','video','video/mp4',?,?, 'video/tiny-video.mp4',1000)")
      .run(bytes.length, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    const assetDirectory = join(fixture.homeDirectory, ".stream-jams", "assets", "video"); await mkdir(assetDirectory, { recursive: true });
    await writeFile(join(assetDirectory, "tiny-video.mp4"), bytes);
    old.connection.prepare(`INSERT INTO video_requests (id,purpose,source_json,title,submitted_via,duration_ms,status,hold_reason,limit_overridden,autoplay,position,created_at,updated_at)
      VALUES ('migrated-review','test',?,'Migrated review','management',30000,'queued',NULL,0,1,0,'2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z')`)
      .run(JSON.stringify({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }));
    const directory = join(fixture.homeDirectory, ".stream-jams", "data"); await mkdir(directory, { recursive: true });
    old.connection.prepare("VACUUM INTO ?").run(join(directory, "stream-jams.sqlite"));
    await fixture.start();
    expect((await fixture.request("/overlay-modules/videos/enabled", "PATCH", { enabled: true })).status).toBe(200);
    const db = fixture.runtime.composition.database.connection;
    const retiredOutput = `/overlay/modules/videos/test/${retiredKey}`;
    for (const suffix of ["", "/composition", "/assets/tiny-existing"]) {
      const response = await fetch(`${fixture.runtime.url}${retiredOutput}${suffix}`, { headers: { range: "bytes=0-15" } });
      expect(response.status).toBe(401); expect(await response.text()).not.toContain(retiredKey);
    }
    const socketUrl = new URL(`/overlay/ws/modules/videos/test/${retiredKey}`, fixture.runtime.url); socketUrl.protocol = "ws:";
    const socket = createProviderSocket(socketUrl.href); const messages: unknown[] = [];
    const closeCode = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error("Retired socket did not close")); }, 5000);
      socket.on("message", data => messages.push(JSON.parse(String(data))));
      socket.once("error", error => { clearTimeout(timeout); reject(error); });
      socket.once("close", code => { clearTimeout(timeout); resolve(code); });
    });
    expect(closeCode).toBe(1008); expect(messages).toEqual([{ type: "overlay.error", code: "OVERLAY_ROUTE_KEY_UNAUTHORIZED", message: "Overlay route key is not authorized for this output" }]);
    const retiredRequest = { overlayId: "default", moduleId: "videos", purpose: "test", scope: "module", targetProfileId: null };
    expect((await fixture.request("/management/overlay-outputs/keys/regenerate", "POST", retiredRequest)).status).toBe(404);
    const ordinary = await (await fixture.request("/management/overlay-outputs/keys", "POST", { ...retiredRequest, purpose: "live" })).json() as { url: string };
    const readable = await fetch(`${ordinary.url}/assets/tiny-existing`, { headers: { range: "bytes=0-15" } });
    expect(readable.status).toBe(206); expect((await readable.arrayBuffer()).byteLength).toBe(16);
    const before = db.prepare("SELECT * FROM video_requests").all();
    const journalBefore = db.prepare("SELECT COUNT(*) n FROM event_bus_journal").get()?.n;
    for (const [path, body] of [["/videos/test/requests", { link: "https://youtu.be/dQw4w9WgXcQ" }], ["/videos/live/requests", { link: "https://youtu.be/dQw4w9WgXcQ", purpose: "test" }]] as const) {
      const result = await fixture.request(path, "POST", body); expect(result.status).toBe(410);
      expect(await result.json()).toMatchObject({ error: { code: "VIDEO_TEST_RETIRED" } });
    }
    expect(db.prepare("SELECT * FROM video_requests").all()).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) n FROM event_bus_journal").get()?.n).toBe(journalBefore);
    const outputs = await (await fixture.request("/management/overlay-outputs")).json() as { moduleId: string | null; purpose: string }[];
    expect(outputs.filter(output => output.moduleId === "videos").map(output => output.purpose)).toEqual(["live"]);
    await page.setViewportSize({ width: 1400, height: 1000 }); await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
    const row = page.getByRole("article", { name: "Migrated review", exact: true });
    await expect(row.getByText("Migrated test request: review before Play")).toBeVisible();
    await expect(page.getByRole("button", { name: "Test queue" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play all now", exact: true })).toBeDisabled();
    await row.getByRole("button", { name: "Play reviewed video: Migrated review", exact: true }).click();
    await expect(page.getByRole("article", { name: "Now playing", exact: true })).toContainText("Migrated review");
    expect(db.prepare("SELECT review_required,status FROM video_requests WHERE id='migrated-review'").get()).toEqual({ review_required: 0, status: "playing" });
  } finally { await fixture.close(); }
});
