import type { VideoShoutoutClip } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { VideoShoutoutService, type VideoShoutoutTransition } from "./video-shoutout-service.js";

const clip: VideoShoutoutClip = {
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "ClipOne",
  embedUrl: "https://clips.twitch.tv/embed?clip=ClipOne&parent=127.0.0.1",
  title: "The big play",
  durationMs: 20_000,
  avatarUrl: null
};

function createHarness() {
  let nowMs = 1_000;
  let nextId = 0;
  const scheduled: { delayMs: number; callback: () => void; cancelled: boolean }[] = [];
  const transitions: VideoShoutoutTransition[] = [];
  const service = new VideoShoutoutService({
    clock: { now: () => nowMs },
    scheduler: {
      schedule(delayMs, callback) {
        const entry = { delayMs, callback, cancelled: false };
        scheduled.push(entry);
        return { cancel: () => { entry.cancelled = true; } };
      }
    },
    generateActivationId: () => `id-${++nextId}`,
    loadingTimeoutMs: 10_000,
    errorDisplayMs: 4_000,
    onTransition: transition => transitions.push(transition)
  });
  const notified: string[] = [];
  service.subscribe(purpose => notified.push(purpose));
  return {
    service,
    transitions,
    notified,
    advance(ms: number) { nowMs += ms; },
    /** Fires the latest live timer, as the real scheduler would after its delay. */
    fireLatest() {
      const entry = scheduled.filter(candidate => !candidate.cancelled).at(-1);
      if (entry === undefined) throw new Error("No timer is scheduled");
      entry.cancelled = true;
      entry.callback();
      return entry.delayMs;
    },
    pending: () => scheduled.filter(candidate => !candidate.cancelled).length
  };
}

describe("VideoShoutoutService", () => {
  it("starts idle and exposes module-only presentation snapshots", async () => {
    const { service } = createHarness();
    expect(service.getProjection("live")).toEqual({ status: "idle" });
    await expect(service.getModuleSnapshot({ moduleId: "video-shoutout", overlayId: "default", purpose: "live", scope: "module" }))
      .resolves.toEqual({ moduleId: "video-shoutout", enabled: true, instructions: [], presentation: { kind: "video-shoutout", shoutout: { status: "idle" } } });
    await expect(service.getModuleSnapshot({ moduleId: "video-shoutout", overlayId: "default", purpose: "live", scope: "unified" }))
      .resolves.toEqual({ moduleId: "video-shoutout", enabled: true, instructions: [] });
  });

  it("moves loading to playing on the player report and returns to idle after the clip duration", () => {
    const harness = createHarness();
    const { service } = harness;
    expect(service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false })).toEqual({
      status: "loading", activationId: "video-shoutout:id-1", clip
    });
    harness.advance(500);
    expect(service.reportPlayback("video-shoutout:id-1", "started")).toBe(true);
    expect(service.getProjection("live")).toEqual({ status: "playing", activationId: "video-shoutout:id-1", clip, endsAtEpochMs: 21_500 });
    expect(service.reportPlayback("video-shoutout:id-1", "started")).toBe(true);
    expect(harness.fireLatest()).toBe(20_000);
    expect(service.getProjection("live")).toEqual({ status: "idle" });
    expect(harness.transitions.map(transition => [transition.to, transition.cause])).toEqual([
      ["loading", "command"], ["playing", "player-started"], ["idle", "duration-elapsed"]
    ]);
    expect(harness.transitions.at(-1)?.activationId).toBe("video-shoutout:id-1");
    expect(harness.notified).toEqual(["live", "live", "live"]);
  });

  it("returns to idle when no browser source loads the player in time", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    expect(harness.fireLatest()).toBe(10_000);
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
    expect(harness.transitions.at(-1)?.cause).toBe("loading-timeout");
  });

  it("replaces the active clip without queueing the previous one", () => {
    const harness = createHarness();
    const { service } = harness;
    service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    service.reportPlayback("video-shoutout:id-1", "started");
    const next = { ...clip, clipId: "ClipTwo", embedUrl: "https://clips.twitch.tv/embed?clip=ClipTwo&parent=127.0.0.1" };
    service.apply({ kind: "play", purpose: "live", clip: next, avatarOmitted: false });
    expect(service.getProjection("live")).toEqual({ status: "loading", activationId: "video-shoutout:id-2", clip: next });
    expect(harness.pending()).toBe(1);
    // A stale report from the replaced clip cannot finish the new one.
    expect(service.reportPlayback("video-shoutout:id-1", "completed")).toBe(false);
    expect(service.getProjection("live").status).toBe("loading");
  });

  it("shows a bounded error when the player fails, then returns to idle", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    expect(harness.service.reportPlayback("video-shoutout:id-1", "failed")).toBe(true);
    expect(harness.service.getProjection("live")).toEqual({
      status: "error", activationId: "video-shoutout:id-1", reason: "playback-failed", displayName: "Friendly Streamer"
    });
    expect(harness.fireLatest()).toBe(4_000);
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
  });

  it("returns to idle when the player reports completion or the trigger clears", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    harness.service.reportPlayback("video-shoutout:id-1", "started");
    harness.service.reportPlayback("video-shoutout:id-1", "completed");
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
    expect(harness.pending()).toBe(0);

    harness.service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    harness.service.apply({ kind: "clear", purpose: "live" });
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
    expect(harness.pending()).toBe(0);
  });

  it("shows the explicit no-clip state and keeps live and test purposes independent", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "no-clip", purpose: "test", displayName: "Quiet Friend" });
    expect(harness.service.getProjection("test")).toEqual({
      status: "error", activationId: "video-shoutout:id-1", reason: "no-clip", displayName: "Quiet Friend"
    });
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
    harness.fireLatest();
    expect(harness.service.getProjection("test")).toEqual({ status: "idle" });
  });

  it("ignores redundant clears and unknown reports without notifying outputs", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "clear", purpose: "live" });
    expect(harness.service.reportPlayback("alerts:instruction-1", "failed")).toBe(false);
    expect(harness.notified).toEqual([]);
    expect(harness.transitions).toEqual([]);
  });

  it("cancels timers and listeners on dispose", () => {
    const harness = createHarness();
    harness.service.apply({ kind: "play", purpose: "live", clip, avatarOmitted: false });
    harness.service.dispose();
    expect(harness.pending()).toBe(0);
    expect(harness.service.getProjection("live")).toEqual({ status: "idle" });
  });
});
