import { mockMediaPreviews } from "./media-preview-fixtures.js";
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
  let moduleEnabled = true;
  const commands: string[] = [];
  const assets = [
    asset("icon-paws", "Cat paws", "image", "image/png"),
    asset("audio-start", "Start bell", "audio", "audio/wav"),
    asset("audio-end", "End bell", "audio", "audio/wav")
  ];

  await page.route("**/management/assets/library", route => route.fulfill({ json: assets }));
  await mockMediaPreviews(page, id => ({ mimeType: id.startsWith("audio") ? "audio/wav" : "image/png" }));
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
    await route.fulfill({ json: { moduleId: "timers", enabled: moduleEnabled, config: layout, updatedAt: timestamp } });
  });
  await page.route("**/overlay-modules/timers/enabled", async route => {
    moduleEnabled = (route.request().postDataJSON() as { readonly enabled: boolean }).enabled;
    await route.fulfill({ json: { moduleId: "timers", enabled: moduleEnabled, config: layout, updatedAt: timestamp } });
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
  await expect(page.getByText("Module enabled")).toBeVisible();
  await page.getByRole("button", { name: "Disable Timers module" }).click();
  await page.getByRole("dialog", { name: "Disable Timers module?" }).getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Module disabled")).toBeVisible();
  await page.getByRole("button", { name: "Enable Timers module" }).click();
  await page.getByRole("dialog", { name: "Enable Timers module?" }).getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Module enabled")).toBeVisible();
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
  const overflowBadge = timerPreview.getByText("+2 more");
  await page.getByLabel("HEIGHT").fill("180");
  const compactFontSize = await previewCards.first().locator(".timer-stack__label").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  const compactOverflowFontSize = await overflowBadge.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByLabel("HEIGHT").fill("480");
  const roomyFontSize = await previewCards.first().locator(".timer-stack__label").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  const roomyOverflowFontSize = await overflowBadge.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(roomyFontSize).toBeGreaterThan(compactFontSize);
  expect(roomyOverflowFontSize).toBeGreaterThan(compactOverflowFontSize);
  expect(compactOverflowFontSize).toBe(compactFontSize);
  expect(roomyOverflowFontSize).toBe(roomyFontSize);
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
  const outputLabels = editor.getByRole("group", { name: "Audio outputs" }).locator("label");
  await expect(outputLabels).toHaveCount(2);
  const outputAlignment = await outputLabels.evaluateAll(labels => labels.map(label => {
    const labelBounds = label.getBoundingClientRect();
    const checkbox = document.getElementById(label.getAttribute("for")!);
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") throw new Error("Output label must associate a checkbox");
    const checkboxBounds = checkbox.getBoundingClientRect();
    return {
      centerOffset: Math.abs((labelBounds.top + labelBounds.height / 2) - (checkboxBounds.top + checkboxBounds.height / 2)),
      checkboxLeft: checkboxBounds.left
    };
  }));
  expect(outputAlignment.every(({ centerOffset }) => centerOffset <= 1)).toBe(true);
  expect(new Set(outputAlignment.map(({ checkboxLeft }) => Math.round(checkboxLeft))).size).toBe(1);
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
  const timerRow = page.getByRole("article", { name: "Cat paws reward timer" });
  await expect(timerRow).toBeVisible();
  const rowAlignment = await Promise.all([
    timerRow.getByText("Idle", { exact: true }).evaluate(element => element.getBoundingClientRect()),
    timerRow.getByRole("button", { name: "Edit" }).evaluate(element => element.getBoundingClientRect())
  ]);
  expect(Math.abs((rowAlignment[0].top + rowAlignment[0].height / 2) - (rowAlignment[1].top + rowAlignment[1].height / 2))).toBeLessThanOrEqual(1);
  await expect(timerPreview.getByRole("listitem").first()).toContainText("Cat paws reward");
  const savedTimerIcon = timerPreview.getByRole("img", { name: "Cat paws reward icon" });
  await expect(savedTimerIcon).toBeVisible();
  await expect(savedTimerIcon).toHaveAttribute("src", /^\/media\/med_[A-Za-z0-9_-]{43}$/u);
  await expect.poll(() => savedTimerIcon.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(definition).toMatchObject({
    label: "Cat paws reward", durationMs: 30_000, iconAssetId: "icon-paws",
    startAudioAssetId: "audio-start", endAudioAssetId: "audio-end",
    outputs: { browserSource: true, deviceRouteIds: ["speakers"] }
  });

  await page.getByRole("radiogroup", { name: "Timer profile" }).getByText("Landscape", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Landscape" })).toBeChecked();
  await page.getByLabel("Orientation").selectOption("horizontal");
  await page.getByLabel("Maximum shown").fill("4");
  await page.getByRole("radiogroup", { name: "Timer profile" }).getByText("Vertical", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Vertical" })).toBeChecked();
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

for (const orientation of ["vertical", "horizontal"] as const) {
  test(`keeps ${orientation} timer overflow inside the bottom-right profile edge without resizing on overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installOverlayWebSocketMock(page);
    const payload = composition(Date.now());
    const stack = payload.modules[0]!.presentation.stack;
    stack.region = { layout: { x: 1320, y: 780, width: 600, height: 300, zIndex: 20 }, orientation, maxVisible: 3 };
    stack.cards = stack.cards.map((card, index) => ({ ...card, slot: {
      x: 1320 + (orientation === "horizontal" ? index * 200 : 0),
      y: 780 + (orientation === "vertical" ? index * 100 : 0),
      width: orientation === "vertical" ? 600 : 200,
      height: orientation === "vertical" ? 100 : 300, zIndex: 20
    } }));
    await page.route("**/overlay/modules/timers/live/ovl_timers/composition*", route => route.fulfill({ json: payload }));
    await page.goto("/overlay/modules/timers/live/ovl_timers?profile=landscape");
    const cards = page.getByRole("listitem");
    await expect(cards).toHaveCount(3);
    const first = await cards.first().boundingBox();
    const last = (await cards.last().boundingBox())!;
    const badge = (await page.getByText("+2 more").boundingBox())!;
    expect(badge.x + badge.width).toBeLessThanOrEqual(1921);
    expect(badge.y + badge.height).toBeLessThanOrEqual(1081);
    if (orientation === "vertical") expect(badge.y).toBeGreaterThanOrEqual(last.y + last.height);
    else expect(badge.x).toBeGreaterThanOrEqual(last.x + last.width);
    await page.evaluate(payload => {
      const sockets = (window as Window & { __overlaySockets?: EventTarget[] }).__overlaySockets ?? [];
      sockets.at(-1)?.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "overlay.composition", composition: payload }) }));
    }, { ...payload, modules: [{ ...payload.modules[0]!, presentation: { kind: "timer-stack", stack: { ...stack, cards: stack.cards.slice(0, 1), overflowCount: 0 } } }] });
    await expect(cards).toHaveCount(1);
    expect(await cards.first().boundingBox()).toEqual(first);
  });
}

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
