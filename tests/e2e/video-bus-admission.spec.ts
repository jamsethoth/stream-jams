import { expect, test } from "@playwright/test";
import { createProviderSecurityRuntimeFixture } from "../../apps/server/src/test-support/provider-security-runtime-fixture.js";

test("video manual submission journals once, confirms pending through an authorized receipt and preserves guarded commands", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await createProviderSecurityRuntimeFixture();
  try {
    await fixture.start();
    const database = fixture.runtime.composition.database.connection;
    const count = (table: "event_bus_journal" | "video_requests" | "video_bus_admissions") => Number(database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()!.total);
    expect((await fixture.request("/overlay-modules/videos/enabled", "PATCH", { enabled: true })).status).toBe(200);
    const before = count("event_bus_journal");
    const forged = await fixture.request("/videos/live/requests", "POST", { link: "https://youtu.be/dQw4w9WgXcQ", sourceRegistrationId: "forged", purpose: "test" });
    expect(forged.status).toBe(410);
    expect(count("event_bus_journal")).toBe(before);
    let busId = "";
    let requests = 0;
    // Exercise the explicit pending wire contract with a real committed service outcome.
    // The slow real-consumer case is covered in the persistent admission unit fixture.
    await page.route("**/videos/live/requests?from=management", async route => {
      requests++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const result = await response.json() as { busId: string; eventId: string };
      busId = result.busId;
      await route.fulfill({ status: 202, json: { status: "pending", busId, eventId: result.eventId } });
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`${fixture.runtime.url}/manage/modules/videos`);
    await page.getByLabel("Video link", { exact: true }).fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Title (optional)", { exact: true }).fill("S04 sample");
    await page.getByRole("button", { name: "Add video", exact: true }).click();
    await expect(page.getByText(/Admission pending/u)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add video", exact: true })).toBeDisabled();
    expect(count("event_bus_journal")).toBe(before + 1);
    expect(count("video_requests")).toBe(1);
    expect(count("video_bus_admissions")).toBe(1);
    const row = database.prepare("SELECT source_kind, source_registration_id, correlation_key, payload_json FROM event_bus_journal WHERE bus_id = ?").get(busId)!;
    expect(row.source_kind).toBe("manual");
    expect(row.source_registration_id).toBeNull(); expect(row.correlation_key).toBeNull();
    expect(JSON.parse(String(row.payload_json))).toMatchObject({ action: { kind: "video-request" }, submission: { channel: "management" } });
    const unauthorized = await fetch(`${fixture.runtime.url}/videos/live/submissions/${encodeURIComponent(busId)}`);
    expect(unauthorized.status).toBe(401);
    await page.getByRole("button", { name: "Check submission outcome", exact: true }).click();
    await expect(page.getByText("Video added to the queue.", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "S04 sample", exact: true })).toBeVisible();
    expect(requests).toBe(1);
    const outcome = await fixture.request(`/videos/live/submissions/${encodeURIComponent(busId)}`);
    expect(outcome.status).toBe(200);
    expect(await outcome.json()).toMatchObject({ busId, item: { title: "S04 sample", submittedVia: "management", status: "queued" } });
    const conflict = await fixture.request("/videos/live/commands", "POST", { expectedRevision: 0, command: { kind: "clear" } });
    expect(conflict.status).toBe(409);
    expect(count("video_requests")).toBe(1);
  } finally { await fixture.close(); }
});
