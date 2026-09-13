import { expect, test } from "@playwright/test";

test("Operator targets independent Alert and Screen Effects queues", async ({ context, page }) => {
  let state = snapshot();
  const mutations: string[] = [];
  await context.route("**/auth/management/sessions", (route) => route.fulfill({
    contentType: "application/json",
    json: { id: "mgmt_multi_module", csrfToken: "csrf_multi_module" }
  }));
  await context.route(/^https?:\/\/[^/]+\/playback\/operations(?:\/.*)?$/u, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", json: state });
      return;
    }
    expect(request.headers().authorization).toBe("Bearer mgmt_multi_module");
    expect(request.headers()["x-stream-jams-csrf"]).toBe("csrf_multi_module");
    mutations.push(path);
    if (path.endsWith("/effect-current/skip")) {
      state = { ...state, revision: state.revision + 1, current: state.current.filter((item) => item.occurrenceId !== "effect-current") };
    } else if (path === "/playback/operations/screen-effects/pause") {
      const paused = (request.postDataJSON() as { paused: boolean }).paused;
      state = { ...state, revision: state.revision + 1, owners: state.owners.map((owner) => owner.moduleId === "screen-effects" ? { ...owner, paused } : owner) };
    } else if (path === "/playback/operations/screen-effects/clear") {
      const body = request.postDataJSON() as { expectedPendingCount: number; observedRevision: number };
      expect(body).toEqual({ expectedPendingCount: 1, observedRevision: state.revision });
      state = { ...state, revision: state.revision + 1, queued: state.queued.filter((item) => item.moduleId !== "screen-effects") };
    } else if (path.endsWith("/effect-recent/replay")) {
      state = {
        ...state,
        revision: state.revision + 1,
        queued: [...state.queued, row("screen-effects", "effect-replay", "Original effect snapshot", "queued", 1)]
      };
    }
    await route.fulfill({ contentType: "application/json", json: state });
  });
  await context.route(/^https?:\/\/[^/]+\/playback\/(?:pause|resume|mute|unmute|do-not-disturb)$/u, async (route) => {
    const path = new URL(route.request().url()).pathname;
    mutations.push(path);
    if (path === "/playback/pause") state = { ...state, revision: state.revision + 1, paused: true };
    if (path === "/playback/resume") state = { ...state, revision: state.revision + 1, paused: false };
    await route.fulfill({ contentType: "application/json", json: {} });
  });

  await page.goto("/operator");
  await expect(page.getByRole("heading", { name: "Now playing (2)" })).toBeVisible();
  await expect(page.getByText("Effect queued").locator("xpath=ancestor::article")).toContainText("#2");

  await page.getByRole("button", { name: "Skip Flash sweep in Screen Effects" }).click();
  await expect(page.getByRole("heading", { name: "Now playing (1)" })).toBeVisible();
  await expect(page.getByText("Alert current")).toBeVisible();

  await page.getByRole("button", { name: "Pause module" }).nth(1).click();
  await expect(page.getByText("Module paused")).toBeVisible();
  await page.getByRole("button", { name: "Pause all queues" }).click();
  await page.getByRole("button", { name: "Resume all queues" }).click();
  await expect(page.getByText("Module paused")).toBeVisible();

  await page.getByRole("button", { name: "Clear pending" }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Clear 1 pending Screen Effects item?");
  await dialog.getByRole("button", { name: "Clear pending" }).click();
  await expect(page.getByRole("heading", { name: "Pending (1)" })).toBeVisible();

  await page.getByRole("button", { name: "Replay Original effect snapshot in Screen Effects" }).click();
  await expect(page.getByText("Original effect snapshot").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending (2)" })).toBeVisible();

  expect(mutations).toEqual([
    "/playback/operations/screen-effects/effect-current/skip",
    "/playback/operations/screen-effects/pause",
    "/playback/pause",
    "/playback/resume",
    "/playback/operations/screen-effects/clear",
    "/playback/operations/screen-effects/effect-recent/replay"
  ]);
});

function snapshot() {
  return {
    revision: 5,
    owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
    current: [row("alerts", "alert-current", "Alert current", "playing"), row("screen-effects", "effect-current", "Flash sweep", "playing")],
    queued: [row("alerts", "alert-next", "Alert queued", "queued", 1), row("screen-effects", "effect-next", "Effect queued", "queued", 2)],
    recent: [
      row("alerts", "alert-recent", "Recent alert", "completed"),
      row("screen-effects", "effect-recent", "Original effect snapshot", "completed")
    ],
    paused: false,
    muted: false,
    doNotDisturb: false
  };
}

function row(moduleId: string, occurrenceId: string, name: string, status: string, moduleQueuePosition: number | null = null) {
  return {
    moduleId,
    occurrenceId,
    name,
    summary: "Neutral fixture",
    status,
    enqueuedAtMs: Date.parse("2026-09-13T12:00:00.000Z"),
    completedAtMs: status === "completed" ? Date.parse("2026-09-13T12:01:00.000Z") : null,
    sequence: 0,
    moduleQueuePosition
  };
}
