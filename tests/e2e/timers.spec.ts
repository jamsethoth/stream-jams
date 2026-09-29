import { expect, test } from "@playwright/test";
import { installOverlayWebSocketMock, mockManagementShell } from "./e2e-helpers.js";

const timestamp = "2026-09-29T00:00:00.000Z";
const defaultLayout = {
  profiles: {
    landscape: { layout: { x: 32, y: 32, width: 720, height: 360, zIndex: 20 }, orientation: "vertical", maxVisible: 3 },
    vertical: { layout: { x: 24, y: 48, width: 600, height: 420, zIndex: 20 }, orientation: "vertical", maxVisible: 2 }
  }
};

test("authors, lays out, reloads, and controls a reusable Timer", async ({ page }) => {
  await mockManagementShell(page);
  let definition: Record<string, unknown> | null = null;
  let state: Record<string, unknown> | null = null;
  let layout = structuredClone(defaultLayout);
  const commands: string[] = [];
  const assets = [
    asset("icon-paws", "Cat paws", "image", "image/png"),
    asset("audio-start", "Start bell", "audio", "audio/wav"),
    asset("audio-end", "End bell", "audio", "audio/wav")
  ];

  await page.route("**/management/assets/library", route => route.fulfill({ json: assets }));
  await page.route("**/assets/*/file", route => route.fulfill({
    body: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6'/></svg>",
    contentType: "image/svg+xml"
  }));
  await page.route("**/audio/status", route => route.fulfill({ json: {
    capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false,
    routes: [{ route: { id: "speakers", name: "Speakers", deviceId: "device-a", deviceLabel: "Speakers", autoFollowDeviceName: false }, state: "ready", automaticBindingState: "not-needed" }]
  } }));
  await page.route("**/timers/automation-credential", route => route.fulfill({ json: { configured: false, createdAt: null, rotatedAt: null } }));
  await page.route("**/overlay-modules/timers/config", async route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { config: typeof defaultLayout };
      layout = body.config;
    }
    await route.fulfill({ json: { moduleId: "timers", enabled: true, config: layout, updatedAt: timestamp } });
  });
  await page.route(/^https?:\/\/[^/]+\/timers(?:\/[^?]*)?(?:\?.*)?$/u, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/timers/automation-credential") return route.fulfill({ json: { configured: false, createdAt: null, rotatedAt: null } });
    if (path === "/timers/state") return route.fulfill({ json: state === null ? [] : [state] });
    if (path === "/timers/browser-sources") return route.fulfill({ json: [
      { id: "module:timers:landscape:live", label: "Timers Landscape Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "landscape", enabled: true, keyId: "key-landscape", url: "http://127.0.0.1/overlay/modules/timers/live/key?profile=landscape", copyableUrlStatus: "available", connectionState: "connected", lastConnectedAt: timestamp },
      { id: "module:timers:vertical:live", label: "Timers Vertical Live", purpose: "live", overlayId: "default", scope: "module", moduleId: "timers", targetProfileId: "vertical", enabled: true, keyId: null, url: null, copyableUrlStatus: "create-required", connectionState: "never-connected", lastConnectedAt: null }
    ] });
    if (path === "/timers") {
      if (request.method() === "GET") return route.fulfill({ json: definition === null ? [] : [definition] });
      const input = request.postDataJSON() as Record<string, unknown>;
      definition = { id: "timer-paws", ...input, createdAt: timestamp, updatedAt: timestamp };
      return route.fulfill({ status: 201, json: definition });
    }
    const command = path.split("/").at(-1)!;
    if (["start", "pause", "resume", "stop", "restart"].includes(command)) {
      commands.push(command);
      const snapshot = {
        id: definition!.id,
        label: definition!.label,
        durationMs: definition!.durationMs,
        iconAssetId: definition!.iconAssetId,
        startAudioAssetId: definition!.startAudioAssetId,
        endAudioAssetId: definition!.endAudioAssetId,
        outputs: definition!.outputs
      };
      if (command === "stop") state = null;
      else if (command === "pause") state = { status: "paused", definitionId: "timer-paws", generation: "g1", snapshot, remainingMs: 25_000 };
      else state = { status: "running", definitionId: "timer-paws", generation: command === "restart" ? "g2" : "g1", snapshot, startedAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 30_000 };
      return route.fulfill({ json: { changed: true, state } });
    }
    if (request.method() === "PUT") {
      definition = { ...definition!, ...(request.postDataJSON() as Record<string, unknown>), updatedAt: timestamp };
      return route.fulfill({ json: definition });
    }
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/manage/modules/timers");
  await expect(page.getByRole("heading", { name: "No timers yet" })).toBeVisible();
  await expect(page.getByText("Create one for a recurring stream activity.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  const timerPreview = page.getByLabel("landscape timer preview");
  await expect(timerPreview.getByText("Timer 1", { exact: true })).toBeVisible();
  const longExample = timerPreview.getByText(/deliberately long name/u);
  await expect(longExample).toBeVisible();
  await expect(timerPreview.getByRole("img", { name: "Default timer icon" })).toHaveCount(3);
  await expect(timerPreview.getByText("+2 more")).toBeVisible();
  expect(await timerPreview.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(420);
  const previewCards = timerPreview.getByRole("listitem");
  const iconWidths = await timerPreview.getByRole("img").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  expect(iconWidths.every(width => width > 10)).toBe(true);
  const verticalPlacement = await Promise.all([
    previewCards.last().evaluate(element => element.getBoundingClientRect().bottom),
    timerPreview.getByText("+2 more").evaluate(element => element.getBoundingClientRect().top)
  ]);
  expect(verticalPlacement[1]).toBeGreaterThanOrEqual(verticalPlacement[0]);
  const centerOffset = await previewCards.first().evaluate(element => {
    const card = element.getBoundingClientRect();
    const label = element.querySelector(".timer-stack__label")!.getBoundingClientRect();
    return Math.abs((card.top + card.height / 2) - (label.top + label.height / 2));
  });
  expect(centerOffset).toBeLessThanOrEqual(1);
  await expect(previewCards.first().locator(".timer-stack__label")).not.toHaveCSS("line-height", "normal");
  await page.getByLabel("HEIGHT").fill("180");
  const compactFontSize = await previewCards.first().locator(".timer-stack__label").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByLabel("HEIGHT").fill("480");
  const roomyFontSize = await previewCards.first().locator(".timer-stack__label").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(roomyFontSize).toBeGreaterThan(compactFontSize);
  await page.getByLabel("WIDTH").fill("360");
  expect(await longExample.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.getByLabel("WIDTH").fill("1600");
  expect(await longExample.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  const browserSources = page.getByRole("region", { name: "Browser sources" });
  await expect(browserSources.getByText("1 ready")).toBeVisible();
  await browserSources.getByRole("button", { name: "Expand browser sources" }).click();
  await expect(browserSources.getByRole("article", { name: "Landscape browser source" })).toContainText("Listening now");
  await page.getByRole("button", { name: "New timer" }).click();
  const editor = page.getByRole("dialog", { name: "Create timer" });
  await page.getByLabel("Name", { exact: true }).fill("Cat paws reward");
  await page.getByLabel("Duration (seconds)").fill("30");
  const assetRows = page.locator(".timer-asset-row");
  for (const [index, name] of ["Cat paws", "Start bell", "End bell"].entries()) {
    await assetRows.nth(index).getByRole("button", { name: "Choose" }).click();
    await page.getByRole("button", { name: new RegExp(`^${name},`) }).click();
    await page.getByRole("button", { name: "Use selected asset" }).click();
  }
  await editor.getByRole("checkbox", { name: "Browser Source" }).check();
  await editor.getByRole("checkbox", { name: "Speakers" }).check();
  await editor.getByRole("button", { name: "Create timer" }).click();
  await expect(page.getByRole("dialog", { name: "Create timer" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Cat paws reward timer" })).toBeVisible();
  await expect(timerPreview.getByRole("listitem").first()).toContainText("Cat paws reward");
  await expect(timerPreview.getByRole("img", { name: "Cat paws reward icon" })).toBeVisible();
  expect(definition).toMatchObject({
    label: "Cat paws reward", durationMs: 30_000, iconAssetId: "icon-paws",
    startAudioAssetId: "audio-start", endAudioAssetId: "audio-end",
    outputs: { browserSource: true, deviceRouteIds: ["speakers"] }
  });

  await page.getByRole("tab", { name: "Landscape" }).click();
  await page.getByLabel("Orientation").selectOption("horizontal");
  await page.getByLabel("Maximum shown").fill("4");
  await page.getByRole("tab", { name: "Vertical" }).click();
  await page.getByLabel("Maximum shown").fill("2");
  await page.getByRole("button", { name: "Save overlay layout" }).click();
  expect(layout.profiles.landscape).toMatchObject({ orientation: "horizontal", maxVisible: 4 });
  expect(layout.profiles.vertical).toMatchObject({ maxVisible: 2 });

  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await page.getByRole("button", { name: /Cat paws reward/u }).first().click();
  const controlDialog = page.getByRole("dialog");
  await controlDialog.getByRole("button", { name: "Pause" }).click();
  await controlDialog.getByRole("button", { name: "Resume" }).click();
  await controlDialog.getByRole("button", { name: "Restart" }).click();
  await controlDialog.getByRole("button", { name: "Stop" }).click();
  expect(commands).toEqual(["start", "pause", "resume", "restart", "stop"]);
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Cat paws reward/u }).first().click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Cat paws reward");
  await page.getByLabel("Name", { exact: true }).fill("Cat paws mitts");
  await page.getByRole("button", { name: "Save timer" }).click();
  await expect(page.getByRole("article", { name: "Cat paws mitts timer" })).toBeVisible();
});

test("renders late-joined Timer stacks in authoritative order with overflow and reconnect updates", async ({ page }) => {
  await installOverlayWebSocketMock(page);
  const now = Date.now();
  await page.route("**/overlay/modules/timers/live/ovl_timers/composition*", route => route.fulfill({ json: composition(now) }));
  await page.goto("/overlay/modules/timers/live/ovl_timers?profile=landscape");

  const cards = page.getByRole("list", { name: "Active timers" }).getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Completed reward");
  await expect(cards.nth(1)).toContainText("Soon running timer with a deliberately long label");
  await expect(cards.nth(2)).toContainText("Paused reward");
  await expect(page.getByText("+2 more")).toBeVisible();
  await expect(page.getByRole("img", { name: "Default timer icon" })).toHaveCount(3);
  await expect(page.getByRole("list", { name: "Active timers" })).toHaveAttribute("data-orientation", "horizontal");
  const widths = await cards.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await expect(cards.nth(1).locator(".timer-stack__label")).toHaveCSS("text-overflow", "ellipsis");
  await expect(cards.nth(1).locator(".timer-stack__label")).toHaveCSS("text-align", "left");
  await expect(cards.nth(1).locator(".timer-stack__value")).toHaveCSS("text-align", "right");

  await page.evaluate(() => {
    const sockets = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets ?? [];
    sockets.at(-1)?.dispatchEvent(new CloseEvent("close"));
  });
  await expect.poll(() => page.evaluate(() => (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets?.length ?? 0)).toBeGreaterThan(1);
  await page.evaluate((payload) => {
    const sockets = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets ?? [];
    sockets.at(-1)?.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "overlay.composition", composition: payload }) }));
  }, { ...composition(now), modules: [] });
  await expect(cards).toHaveCount(0);
});

function asset(id: string, displayName: string, mediaType: "image" | "audio", mimeType: string) {
  return { id, displayName, originalFileName: `${id}.${mediaType === "image" ? "png" : "wav"}`, mediaType, mimeType, sizeBytes: 8,
    width: mediaType === "image" ? 32 : null, height: mediaType === "image" ? 32 : null, durationMs: mediaType === "audio" ? 250 : null,
    health: "available", tags: [], createdAt: timestamp, updatedAt: timestamp, usage: { assetId: id, totalUsageCount: 0, usages: [] } };
}

function composition(now: number) {
  const slot = (x: number) => ({ x, y: 40, width: 300, height: 120, zIndex: 20 });
  return { overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape", modules: [{
    moduleId: "timers", enabled: true, instructions: [], presentation: { kind: "timer-stack", stack: {
      targetProfileId: "landscape", region: { layout: { x: 40, y: 40, width: 900, height: 120, zIndex: 20 }, orientation: "horizontal", maxVisible: 3 },
      cards: [
        { status: "completed", definitionId: "done", generation: "g-done", label: "Completed reward", iconAssetId: null, remainingMs: 0, expiresAtEpochMs: now + 3_000, slot: slot(40) },
        { status: "running", definitionId: "soon", generation: "g-soon", label: "Soon running timer with a deliberately long label", iconAssetId: null, endsAtEpochMs: now + 20_000, slot: slot(340) },
        { status: "paused", definitionId: "paused", generation: "g-paused", label: "Paused reward", iconAssetId: null, remainingMs: 25_000, slot: slot(640) }
      ], overflowCount: 2
    } }
  }] };
}
