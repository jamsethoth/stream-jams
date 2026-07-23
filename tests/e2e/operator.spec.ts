import { expect, test, type BrowserContext } from "@playwright/test";

interface PlaybackQueueSnapshot {
  readonly current: PlaybackQueueItem | null;
  readonly queued: readonly PlaybackQueueItem[];
  readonly recent: readonly PlaybackQueueItem[];
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}

interface PlaybackQueueItem {
  readonly id: string;
  readonly sourceEvent: Record<string, unknown>;
  readonly alerts: readonly unknown[];
  readonly priority: number;
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly enqueuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

test("management opens the focused operator console and reversible controls apply returned state", async ({ context, page }) => {
  let state = activeSnapshot();
  let sessionRequests = 0;
  const commands: string[] = [];
  await installManagementSession(context, () => { sessionRequests += 1; });
  await page.route("**/management/home", (route) => route.fulfill({
    contentType: "application/json",
    json: { readiness: [], activeAlertSet: null, actionableProblems: [] }
  }));
  await context.route(/^https?:\/\/[^/]+\/playback(?:\/.*)?$/u, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", json: state });
      return;
    }

    expect(request.headers().authorization).toBe("Bearer mgmt_operator_e2e");
    expect(request.headers()["x-stream-jams-csrf"]).toBe("csrf_operator_e2e");
    commands.push(path);
    if (path === "/playback/pause") state = { ...state, paused: true };
    else if (path === "/playback/resume") state = { ...state, paused: false };
    else if (path === "/playback/mute") state = { ...state, muted: true };
    else if (path === "/playback/unmute") state = { ...state, muted: false };
    else if (path === "/playback/do-not-disturb") {
      state = { ...state, doNotDisturb: (request.postDataJSON() as { enabled: boolean }).enabled };
    } else if (path === "/playback/skip") {
      state = { ...state, current: state.queued[0] ?? null, queued: state.queued.slice(1) };
    } else if (path === "/playback/replay") {
      const itemId = (request.postDataJSON() as { itemId: string }).itemId;
      state = { ...state, queued: [...state.queued, ...state.recent.filter((item) => item.id === itemId)] };
    }
    await route.fulfill({ contentType: "application/json", json: state });
  });

  await page.goto("/manage");
  const operatorLink = page.getByRole("link", { name: "Open Operator Console" });
  await expect(operatorLink).not.toHaveAttribute("target");
  const managementLinkBounds = await operatorLink.boundingBox();
  if (managementLinkBounds === null) throw new Error("Operator link is not visible.");
  await operatorLink.click();
  const operator = page;

  await expect(operator).toHaveURL(/\/operator$/u);
  await expect(operator.getByRole("heading", { name: "Operator Console" })).toBeVisible();
  const managementLink = operator.getByRole("link", { name: "Back to management" });
  await expect(managementLink).not.toHaveAttribute("target");
  const operatorLinkBounds = await managementLink.boundingBox();
  if (operatorLinkBounds === null) throw new Error("Management link is not visible.");
  expect(operatorLinkBounds.y).toBeCloseTo(managementLinkBounds.y, 0);
  expect(operatorLinkBounds.x + operatorLinkBounds.width).toBeCloseTo(
    managementLinkBounds.x + managementLinkBounds.width,
    0
  );
  await expect(operator.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(operator.getByText("Current Viewer")).toBeVisible();
  expect(await operator.locator("body").innerText()).not.toContain("private message");
  expect(sessionRequests).toBeGreaterThanOrEqual(2);

  const pause = operator.getByRole("button", { name: "Pause queue" });
  await pause.focus();
  await operator.keyboard.press("Enter");
  await expect(operator.getByRole("button", { name: "Resume queue" })).toBeFocused();
  await expect(operator.getByText("Current alert continues; queued alerts wait.")).toBeVisible();
  await operator.getByRole("button", { name: "Resume queue" }).click();
  await operator.getByRole("button", { name: "Mute alert audio" }).click();
  await expect(operator.getByText("Audio muted", { exact: true })).toBeVisible();
  await operator.getByRole("button", { name: "Unmute alert audio" }).click();
  await operator.getByRole("button", { name: "Enable do-not-disturb" }).click();
  await expect(operator.getByRole("button", { name: "Disable do-not-disturb" })).toHaveAttribute("aria-pressed", "true");
  await operator.getByRole("button", { name: "Disable do-not-disturb" }).click();
  await operator.getByRole("button", { name: "Skip current alert" }).click();
  await expect(operator.getByText("Next Viewer")).toBeVisible();
  await operator.getByRole("button", { name: "Replay Follow from Recent Viewer" }).click();
  await expect(operator.getByRole("heading", { name: "Up next (1)" })).toBeVisible();

  expect(commands).toEqual([
    "/playback/pause",
    "/playback/resume",
    "/playback/mute",
    "/playback/unmute",
    "/playback/do-not-disturb",
    "/playback/do-not-disturb",
    "/playback/skip",
    "/playback/replay"
  ]);

  await managementLink.click();
  await expect(operator).toHaveURL(/\/manage$/u);
  await expect(operator.getByRole("link", { name: "Open Operator Console" })).toBeVisible();
});

test("a failed later refresh retains the safe snapshot and links diagnostics", async ({ context, page }) => {
  let reads = 0;
  await installManagementSession(context);
  await context.route(/^https?:\/\/[^/]+\/playback$/u, async (route) => {
    reads += 1;
    if (reads <= 2) {
      await route.fulfill({ contentType: "application/json", json: activeSnapshot() });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      json: { error: { code: "PLAYBACK_READ_FAILED", id: "ref-e2e-stale", message: "Playback refresh failed." } },
      status: 500
    });
  });

  await page.goto("/operator");
  await expect(page.getByText("Current Viewer")).toBeVisible();
  await expect.poll(() => reads, { timeout: 8_000 }).toBe(3);
  await expect(page.getByText("Playback state may be stale")).toBeVisible();
  await expect(page.getByText("Current Viewer")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute(
    "href",
    "/manage/diagnostics?reference=ref-e2e-stale"
  );
});

test("an older poll cannot overwrite a newer command response", async ({ context, page }) => {
  let reads = 0;
  let releaseOldPoll!: () => void;
  const oldPoll = new Promise<void>((resolve) => { releaseOldPoll = resolve; });
  await installManagementSession(context);
  await context.route(/^https?:\/\/[^/]+\/playback(?:\/.*)?$/u, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      reads += 1;
      if (reads > 2) await oldPoll;
      await route.fulfill({ contentType: "application/json", json: activeSnapshot() });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: { ...activeSnapshot(), paused: true } });
  });

  await page.goto("/operator");
  await expect(page.getByRole("button", { name: "Pause queue" })).toBeVisible();
  await expect.poll(() => reads, { timeout: 5_000 }).toBe(3);
  await page.getByRole("button", { name: "Pause queue" }).click();
  await expect(page.getByRole("button", { name: "Resume queue" })).toBeVisible();
  releaseOldPoll();
  await page.waitForTimeout(100);
  await expect(page.getByRole("button", { name: "Resume queue" })).toBeVisible();
});

async function installManagementSession(context: BrowserContext, onRequest: () => void = () => undefined): Promise<void> {
  await context.route("**/auth/management/sessions", async (route) => {
    onRequest();
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_operator_e2e", csrfToken: "csrf_operator_e2e" }
    });
  });
}

function idleSnapshot(): PlaybackQueueSnapshot {
  return { current: null, queued: [], recent: [], paused: false, muted: false, doNotDisturb: false };
}

function activeSnapshot(): PlaybackQueueSnapshot {
  return {
    ...idleSnapshot(),
    current: item("current", "playing", "Current Viewer"),
    queued: [item("next", "queued", "Next Viewer")],
    recent: [item("recent", "completed", "Recent Viewer")]
  };
}

function item(id: string, status: PlaybackQueueItem["status"], displayName: string): PlaybackQueueItem {
  return {
    id,
    sourceEvent: {
      id: `event-${id}`,
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "twitch",
      occurredAt: "2026-07-21T12:00:00.000Z",
      actor: { id: null, displayName },
      message: "private message",
      metadata: { private: true },
      type: "follow",
      amount: null
    },
    alerts: [],
    priority: 10,
    status,
    enqueuedAt: "2026-07-21T12:00:01.000Z",
    startedAt: status === "queued" ? null : "2026-07-21T12:00:02.000Z",
    completedAt: status === "completed" ? "2026-07-21T12:00:05.000Z" : null
  };
}
