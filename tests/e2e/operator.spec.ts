import { expect, test, type BrowserContext } from "@playwright/test";

test("management opens the focused Operator console and global controls apply returned state", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let state = activeSnapshot();
  const commands: string[] = [];
  await installManagementSession(context);
  await page.route("**/management/home", (route) => route.fulfill({ contentType: "application/json", json: { readiness: [], activeAlertSet: null, actionableProblems: [] } }));
  await context.route(/^https?:\/\/[^/]+\/playback\/operations$/u, (route) => route.fulfill({ contentType: "application/json", json: state }));
  await context.route(/^https?:\/\/[^/]+\/playback\/(?:pause|resume|mute|unmute|do-not-disturb)$/u, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe("Bearer mgmt_operator_e2e");
    expect(request.headers()["x-stream-jams-csrf"]).toBe("csrf_operator_e2e");
    commands.push(path);
    if (path === "/playback/pause") state = { ...state, paused: true, revision: state.revision + 1 };
    if (path === "/playback/resume") state = { ...state, paused: false, revision: state.revision + 1 };
    if (path === "/playback/mute") state = { ...state, muted: true, revision: state.revision + 1 };
    if (path === "/playback/unmute") state = { ...state, muted: false, revision: state.revision + 1 };
    if (path === "/playback/do-not-disturb") state = { ...state, doNotDisturb: (request.postDataJSON() as { enabled: boolean }).enabled, revision: state.revision + 1 };
    await route.fulfill({ contentType: "application/json", json: {} });
  });

  await page.goto("/manage");
  const operatorLink = page.getByRole("link", { name: "Open Operator Console" });
  await expect(operatorLink).not.toHaveAttribute("target");
  await operatorLink.click();

  await expect(page).toHaveURL(/\/operator$/u);
  await expect(page.getByRole("heading", { name: "Operator Console" })).toBeVisible();
  await expect(page.locator("main.operator-console")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/operator-shell/u);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText("Current follow")).toBeVisible();
  await expect(page.getByText("Current sweep")).toBeVisible();
  const currentCards = page.getByRole("heading", { name: "Now playing (2)" }).locator("xpath=following-sibling::ol[1]/li");
  await expect(currentCards).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  expect(resources).toContain("/src/operator/OperatorApp.tsx");
  expect(resources).not.toContain("/src/App.tsx");
  expect(resources.some((path) => path.includes("/management/alerts/editor/") || path.includes("/management/screen-effects/ScreenEffectEditor"))).toBe(false);

  const pause = page.getByRole("button", { name: "Pause all queues" });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Resume all queues" })).toBeFocused();
  await page.getByRole("button", { name: "Resume all queues" }).click();
  await page.getByRole("button", { name: "Mute playback audio" }).click();
  await expect(page.getByText("Audio muted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unmute playback audio" }).click();
  await page.getByRole("button", { name: "Enable do-not-disturb" }).click();
  await expect(page.getByRole("button", { name: "Disable do-not-disturb" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Disable do-not-disturb" }).click();

  expect(commands).toEqual([
    "/playback/pause",
    "/playback/resume",
    "/playback/mute",
    "/playback/unmute",
    "/playback/do-not-disturb",
    "/playback/do-not-disturb"
  ]);
  await page.getByRole("link", { name: "Back to management" }).click();
  await expect(page).toHaveURL(/\/manage$/u);
});

test("healthy phone layout exposes current playback and Skip without scrolling", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installManagementSession(context);
  await context.route(/^https?:\/\/[^/]+\/playback\/operations$/u, (route) => route.fulfill({ contentType: "application/json", json: activeSnapshot() }));

  await page.goto("/operator");
  const nowPlaying = page.getByRole("heading", { name: "Now playing (2)" });
  const firstSkip = page.getByRole("button", { name: "Skip Current follow in Alerts" });
  await expect(nowPlaying).toBeVisible();
  await expect(firstSkip).toBeVisible();
  const [headingBox, skipBox] = await Promise.all([nowPlaying.boundingBox(), firstSkip.boundingBox()]);
  expect(headingBox).not.toBeNull();
  expect(skipBox).not.toBeNull();
  expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(844);
  expect(skipBox!.y + skipBox!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a failed later refresh retains the safe snapshot and links Diagnostics", async ({ context, page }) => {
  let reads = 0;
  await installManagementSession(context);
  await context.route(/^https?:\/\/[^/]+\/playback\/operations$/u, async (route) => {
    reads += 1;
    if (reads <= 2) await route.fulfill({ contentType: "application/json", json: activeSnapshot() });
    else await route.fulfill({ contentType: "application/json", status: 500, json: { error: { code: "PLAYBACK_READ_FAILED", id: "ref-e2e-stale", message: "Playback refresh failed." } } });
  });

  await page.goto("/operator");
  await expect(page.getByText("Current follow")).toBeVisible();
  await expect(page.getByText("Playback state may be stale")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Current follow")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute("href", "/manage/diagnostics?reference=ref-e2e-stale");
});

async function installManagementSession(context: BrowserContext): Promise<void> {
  await context.route("**/auth/management/sessions", (route) => route.fulfill({ contentType: "application/json", json: { id: "mgmt_operator_e2e", csrfToken: "csrf_operator_e2e" } }));
}

function activeSnapshot() {
  return {
    revision: 2,
    owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
    current: [row("alerts", "current", "Current follow", "playing"), row("screen-effects", "current-effect", "Current sweep", "playing")],
    queued: [row("alerts", "next", "Next follow", "queued", 1)],
    recent: [row("alerts", "recent", "Recent follow", "completed")],
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
    summary: "Neutral viewer",
    status,
    enqueuedAtMs: Date.parse("2026-09-13T12:00:00.000Z"),
    completedAtMs: status === "completed" ? Date.parse("2026-09-13T12:01:00.000Z") : null,
    sequence: 0,
    moduleQueuePosition
  };
}
