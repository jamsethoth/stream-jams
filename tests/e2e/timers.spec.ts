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
  await page.route("**/assets/*/file", route => route.fulfill({ body: "asset", contentType: "application/octet-stream" }));
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
  await expect(page.getByText("No timers yet. Create one for a recurring stream activity.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Cat paws reward");
  await page.getByLabel("Duration (seconds)").fill("30");
  const assetRows = page.locator(".timer-asset-row");
  for (const [index, name] of ["Cat paws", "Start bell", "End bell"].entries()) {
    await assetRows.nth(index).getByRole("button", { name: "Choose" }).click();
    await page.getByRole("button", { name: new RegExp(`^${name},`) }).click();
    await page.getByRole("button", { name: "Use selected asset" }).click();
  }
  await page.getByLabel("Browser Source").check();
  await page.getByLabel("Speakers").check();
  await page.getByRole("button", { name: "Create timer" }).click();
  await expect(page.getByRole("heading", { name: "Edit Cat paws reward" })).toBeVisible();
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
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  expect(commands).toEqual(["start", "pause", "resume", "restart", "stop"]);
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Cat paws reward");
  await page.getByLabel("Name", { exact: true }).fill("Cat paws mitts");
  await page.getByRole("button", { name: "Save timer" }).click();
  await expect(page.getByRole("heading", { name: "Edit Cat paws mitts" })).toBeVisible();
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
  await expect(page.getByRole("list", { name: "Active timers" })).toHaveAttribute("data-orientation", "horizontal");
  const widths = await cards.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await expect(cards.nth(1).locator(".timer-stack__label")).toHaveCSS("text-overflow", "ellipsis");

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
