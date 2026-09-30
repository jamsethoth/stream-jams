import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("browser prepares real media silently, retains it at start, and recovers after a failed occurrence", async ({ page }) => {
  const base = { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module", targetProfileId: "landscape" };
  const instruction = { ...base, id: "prepared-video", visual: { assetId: "clip", mediaType: "video", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } }, audio: null, text: null, tts: null, durationMs: 1200 };
  const reports: { type: string; instructionId: string }[] = [];
  let send: (message: object) => void = () => { throw new Error("Socket not connected"); };
  await page.route("**/composition**", route => route.fulfill({ json: { ...base, modules: [{ moduleId: "alerts", enabled: true, instructions: [] }] } }));
  await page.route("**/assets/clip**", route => route.fulfill({ path: resolve("tests/fixtures/media/neutral-trackless.webm"), contentType: "video/webm" }));
  await page.route("**/assets/broken**", route => route.fulfill({ status: 404 }));
  await page.routeWebSocket("**/overlay/ws/**", socket => {
    send = message => socket.send(JSON.stringify(message));
    socket.onMessage(message => reports.push(JSON.parse(String(message)) as { type: string; instructionId: string }));
    send({ type: "overlay.playback.audio-state", muted: false });
  });
  await page.goto("/overlay/modules/alerts/live/fixture?profile=landscape");
  await expect(page.getByTestId("overlay-root")).toBeAttached();
  send({ type: "overlay.playback.prepare", instruction });
  await expect.poll(() => reports.some(report => report.type === "overlay.playback.ready" && report.instructionId === instruction.id)).toBe(true);
  const video = page.getByTestId(`overlay-video-${instruction.id}`);
  await expect(video).toBeHidden();
  expect(await video.evaluate(element => ({ paused: (element as HTMLVideoElement).paused, time: (element as HTMLVideoElement).currentTime, rate: (element as HTMLVideoElement).playbackRate }))).toEqual({ paused: true, time: 0, rate: 1 });
  await video.evaluate(element => { element.setAttribute("data-retained", "yes"); element.addEventListener("seeking", () => element.setAttribute("data-seeked", "yes")); });
  send({ type: "overlay.playback.start", instructionId: instruction.id, startsAtEpochMs: Date.now() + 200 });
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("data-retained", "yes");
  await expect(video).not.toHaveAttribute("data-seeked", "yes");
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
  await expect(video).toHaveCount(0);
  send({ type: "overlay.playback.prepare", instruction: { ...instruction, id: "failed-video", visual: { ...instruction.visual, assetId: "broken" } } });
  await expect.poll(() => reports.some(report => report.type === "overlay.playback.failed" && report.instructionId === "failed-video")).toBe(true);
  send({ type: "overlay.playback.prepare", instruction: { ...instruction, id: "next-video" } });
  await expect.poll(() => reports.some(report => report.type === "overlay.playback.ready" && report.instructionId === "next-video")).toBe(true);
  send({ type: "overlay.playback.start", instructionId: "next-video", startsAtEpochMs: Date.now() + 100 });
  await expect(page.getByTestId("overlay-video-next-video")).toBeVisible();
  await expect(page.getByTestId("overlay-video-failed-video")).toHaveCount(0);
});
