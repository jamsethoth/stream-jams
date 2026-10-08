import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopVideoEvent } from "@stream-jams/core/videos";
import { twitchDetectionMs, VideoPlayerHost, type TwitchFrameOperation, type TwitchFrameState, type VideoPortCallbacks } from "./video-player-host.js";
import type { VideoDevicesCommand, VideoPlayerCommand } from "./video-ipc.js";

const origin = "http://127.0.0.1:39187";
const youtube = { provider: "youtube" as const, videoId: "dQw4w9WgXcQ", startAtMs: 0 };
const clip = { provider: "twitch-clip" as const, clipSlug: "FunnyClip" };

function fakePlayer() {
  const sent: VideoPlayerCommand[] = [];
  const twitchCalls: TwitchFrameOperation[] = [];
  let callbacks!: VideoPortCallbacks;
  let twitchState: TwitchFrameState | null = null;
  const port = {
    destroyed: false,
    capture: true,
    load: vi.fn(async () => undefined),
    startCapture: vi.fn(async () => port.capture),
    send: (command: VideoPlayerCommand) => { sent.push(command); },
    twitch: async (operation: TwitchFrameOperation) => { twitchCalls.push(operation); return twitchState; },
    destroy: () => { port.destroyed = true; }
  };
  return {
    port, sent, twitchCalls,
    setTwitch: (state: TwitchFrameState | null) => { twitchState = state; },
    report: (candidate: unknown) => callbacks.onReport(candidate),
    crash: () => callbacks.onDestroyed(),
    bind: (value: VideoPortCallbacks) => { callbacks = value; }
  };
}

function fakeDevices() {
  const sent: VideoDevicesCommand[] = [];
  let callbacks!: VideoPortCallbacks;
  const port = { destroyed: false, load: vi.fn(async () => undefined), send: (command: VideoDevicesCommand) => { sent.push(command); }, destroy: () => { port.destroyed = true; } };
  return { port, sent, report: (candidate: unknown) => callbacks.onReport(candidate), bind: (value: VideoPortCallbacks) => { callbacks = value; } };
}

function setup() {
  const players: ReturnType<typeof fakePlayer>[] = [];
  const devices: ReturnType<typeof fakeDevices>[] = [];
  const events: DesktopVideoEvent[] = [];
  const diagnostics: string[] = [];
  const host = new VideoPlayerHost({
    createPlayer: (_purpose, callbacks) => { const player = fakePlayer(); player.bind(callbacks); players.push(player); return player.port; },
    createDeviceOutput: (_purpose, callbacks) => { const device = fakeDevices(); device.bind(callbacks); devices.push(device); return device.port; },
    playerOrigin: () => origin,
    diagnose: input => diagnostics.push(input.source),
    twitchPollMs: 1000
  });
  host.onEvent(event => events.push(event));
  host.beginOwnership();
  host.refreshLease();
  return { host, players, devices, events, diagnostics };
}

describe("VideoPlayerHost", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("announces itself on the first lease and withdraws when the service is lost", async () => {
    const { host, events, players } = setup();
    expect(events).toEqual([{ type: "status", available: true }]);
    host.refreshLease();
    expect(events).toHaveLength(1);
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.runOnlyPendingTimersAsync();
    host.serviceLost();
    expect(players[0]!.port.destroyed).toBe(true);
    expect(events.at(-1)).toEqual({ type: "status", available: false });
  });

  it("expires without leases so a lost service cannot leave a player making sound", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(players[0]!.port.destroyed).toBe(true);
    expect(events.at(-1)).toEqual({ type: "status", available: false });
    host.handle({ type: "load", purpose: "live", itemId: "b", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(10);
    expect(players).toHaveLength(1);
  });

  it("loads one long-lived player per purpose, captures before loading, and swaps providers inside it", async () => {
    const { host, players } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 5000, paused: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(players).toHaveLength(1);
    expect(players[0]!.port.startCapture).toHaveBeenCalledTimes(1);
    const load = players[0]!.sent[0];
    expect(load).toMatchObject({ type: "load", itemId: "a", positionMs: 5000, paused: true });
    expect(load?.type === "load" && new URL(load.url).searchParams.get("origin")).toBe(origin);
    host.handle({ type: "load", purpose: "live", itemId: "b", source: { provider: "direct", url: "https://videos.example.com/b.mp4" }, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(players).toHaveLength(1);
    expect(players[0]!.sent.at(-1)).toMatchObject({ type: "load", itemId: "b", url: "https://videos.example.com/b.mp4" });
    host.handle({ type: "load", purpose: "test", itemId: "t", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(players).toHaveLength(2);
  });

  it("passes the service host as the Twitch embed parent", async () => {
    const { host, players } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "c", source: clip, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    const load = players[0]!.sent[0];
    expect(load?.type === "load" && new URL(load.url).searchParams.get("parent")).toBe("127.0.0.1");
  });

  it("fails the item and discards the player when capture is refused", async () => {
    const diagnostics: string[] = [];
    const refused = new VideoPlayerHost({
      createPlayer: (_purpose, callbacks) => { const player = fakePlayer(); player.port.capture = false; player.bind(callbacks); return player.port; },
      createDeviceOutput: () => { throw new Error("unused"); },
      playerOrigin: () => origin,
      diagnose: input => diagnostics.push(input.source)
    });
    const refusedEvents: DesktopVideoEvent[] = [];
    refused.onEvent(event => refusedEvents.push(event));
    refused.beginOwnership();
    refused.refreshLease();
    refused.handle({ type: "load", purpose: "live", itemId: "x", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(refusedEvents.at(-1)).toMatchObject({ type: "report", itemId: "x", state: "failed" });
    expect(diagnostics).toContain("desktop.video.player-start-failed");
    await refused.close();
  });

  it("maps page reports to queue reports for the current item only", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    const player = players[0]!;
    player.report({ type: "state", itemId: "stale", state: "started", positionMs: 0 });
    player.report({ type: "state", itemId: "a", state: "progress", positionMs: 500 });
    player.report({ type: "state", itemId: "a", state: "started", positionMs: 0, durationMs: 90_000 });
    player.report({ type: "state", itemId: "a", state: "started", positionMs: 0, durationMs: 90_000 });
    player.report({ type: "state", itemId: "a", state: "progress", positionMs: 1000, durationMs: 90_000 });
    player.report({ type: "state", itemId: "a", state: "bogus" });
    player.report({ type: "state", itemId: "a", state: "ended" });
    player.report({ type: "state", itemId: "a", state: "progress", positionMs: 2000 });
    expect(events.filter(event => event.type === "report")).toEqual([
      { type: "report", purpose: "live", itemId: "a", state: "started", positionMs: 0, durationMs: 90_000, controls: { pause: true, seek: true } },
      { type: "report", purpose: "live", itemId: "a", state: "progress", positionMs: 1000, durationMs: 90_000 },
      { type: "report", purpose: "live", itemId: "a", state: "ended" }
    ]);
  });

  it("sends play, pause and seek to the page, and ignores commands for another item", async () => {
    const { host, players } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    host.handle({ type: "pause", purpose: "live", itemId: "a" });
    host.handle({ type: "seek", purpose: "live", itemId: "a", positionMs: 30_000 });
    host.handle({ type: "play", purpose: "live", itemId: "a", positionMs: 30_000 });
    host.handle({ type: "pause", purpose: "live", itemId: "other" });
    host.handle({ type: "stop", purpose: "live" });
    expect(players[0]!.sent.slice(1)).toEqual([{ type: "pause" }, { type: "seek", positionMs: 30_000 }, { type: "play", positionMs: 30_000 }, { type: "stop" }]);
  });

  it("rejects invalid commands and commands before ownership", async () => {
    const players: unknown[] = [];
    const host = new VideoPlayerHost({ createPlayer: () => { players.push(1); throw new Error("unused"); }, createDeviceOutput: () => { throw new Error("unused"); }, playerOrigin: () => origin });
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    host.beginOwnership();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: { provider: "direct", url: "http://insecure.example.com/a.mp4" }, positionMs: 0, paused: false } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(players).toEqual([]);
    await host.close();
  });

  it("feature-detects the Twitch video and falls back to play and stop when it cannot be found", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "c", source: clip, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    const player = players[0]!;
    player.report({ type: "state", itemId: "c", state: "frame-loaded" });
    player.setTwitch({ video: false });
    await vi.advanceTimersByTimeAsync(twitchDetectionMs + 1000);
    expect(events.filter(event => event.type === "report")).toEqual([
      { type: "report", purpose: "live", itemId: "c", state: "started", controls: { pause: false, seek: false }, reason: "Twitch player control is unavailable for this video." }
    ]);
    // Without detected control, pause is not attempted on the frame.
    host.handle({ type: "pause", purpose: "live", itemId: "c" });
    await vi.advanceTimersByTimeAsync(0);
    expect(player.twitchCalls.some(call => call.type === "pause")).toBe(false);
  });

  it("controls a detected Twitch video from the main process and reports its end", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "c", source: clip, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    const player = players[0]!;
    player.setTwitch({ video: true, paused: false, positionMs: 1200, durationMs: 30_000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.at(-1)).toEqual({ type: "report", purpose: "live", itemId: "c", state: "started", positionMs: 1200, durationMs: 30_000, controls: { pause: true, seek: true } });
    host.handle({ type: "pause", purpose: "live", itemId: "c" });
    host.handle({ type: "seek", purpose: "live", itemId: "c", positionMs: 10_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(player.twitchCalls).toEqual(expect.arrayContaining([{ type: "pause" }, { type: "seek", positionMs: 10_000 }]));
    expect(player.sent.filter(command => command.type !== "load")).toEqual([]);
    player.setTwitch({ video: true, paused: true, ended: true, positionMs: 30_000, durationMs: 30_000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.at(-1)).toEqual({ type: "report", purpose: "live", itemId: "c", state: "ended" });
  });

  it("answers receivers with not-ready until capture runs, then relays signals both ways", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "hello", connection: 1 } });
    expect(events.at(-1)).toEqual({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "not-ready", connection: 1 } });
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    host.handle({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "hello", connection: 2 } });
    expect(players[0]!.sent.at(-1)).toEqual({ type: "signal", receiverId: "browser:client-1", signal: { type: "hello", connection: 2 } });
    players[0]!.report({ type: "signal", receiverId: "browser:client-1", signal: { type: "offer", connection: 2, sdp: "v=0" } });
    expect(events.at(-1)).toEqual({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "offer", connection: 2, sdp: "v=0" } });
    // The service may not speak for desktop receivers.
    host.handle({ type: "signal", purpose: "live", receiverId: "desktop:devices", signal: { type: "bye", connection: 1 } });
    expect(players[0]!.sent.at(-1)).toMatchObject({ receiverId: "browser:client-1" });
  });

  it("drops public ICE candidates from the page", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    const before = events.length;
    players[0]!.report({ type: "signal", receiverId: "browser:c", signal: { type: "ice", connection: 1, candidate: { candidate: "candidate:1 1 udp 1 203.0.113.9 5000 typ srflx raddr 0.0.0.0 rport 0" } } });
    expect(events).toHaveLength(before);
  });

  it("routes desktop receivers inside the app and closes their connection on detach", async () => {
    const { host, players } = setup();
    const delivered: unknown[] = [];
    const receiver = host.attachDesktopReceiver("desktop:overlay", "live", signal => delivered.push(signal));
    expect(() => host.attachDesktopReceiver("desktop:devices", "live", () => undefined)).toThrow();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    receiver.send({ type: "hello", connection: 1 });
    receiver.send({ type: "nonsense" } as never);
    expect(players[0]!.sent.at(-1)).toEqual({ type: "signal", receiverId: "desktop:overlay", signal: { type: "hello", connection: 1 } });
    players[0]!.report({ type: "signal", receiverId: "desktop:overlay", signal: { type: "offer", connection: 1, sdp: "v=0" } });
    expect(delivered).toEqual([{ type: "offer", connection: 1, sdp: "v=0" }]);
    receiver.detach();
    expect(players[0]!.sent.at(-1)).toEqual({ type: "signal", receiverId: "desktop:overlay", signal: { type: "bye", connection: Number.MAX_SAFE_INTEGER } });
    players[0]!.report({ type: "signal", receiverId: "desktop:overlay", signal: { type: "offer", connection: 2, sdp: "v=0" } });
    expect(delivered).toHaveLength(1);
  });

  it("runs device output only while a player exists and devices are selected, with mute and delays", async () => {
    const { host, devices } = setup();
    host.handle({ type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "speakers", delayMs: 120 }] });
    expect(devices).toHaveLength(0);
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.sent).toEqual([{ type: "configure", muted: false, devices: [{ deviceId: "speakers", delayMs: 120 }] }]);
    host.handle({ type: "set-output", purpose: "live", muted: true, devices: [{ deviceId: "speakers", delayMs: 80 }] });
    expect(devices[0]!.sent.at(-1)).toEqual({ type: "configure", muted: true, devices: [{ deviceId: "speakers", delayMs: 80 }] });
    devices[0]!.report({ type: "signal", signal: { type: "hello", connection: 1 } });
    host.handle({ type: "set-output", purpose: "live", muted: false, devices: [] });
    expect(devices[0]!.port.destroyed).toBe(true);
  });

  it("reports the item failed and recreates the player after a renderer crash", async () => {
    const { host, players, events } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    players[0]!.crash();
    expect(events.at(-1)).toMatchObject({ type: "report", itemId: "a", state: "failed" });
    host.handle({ type: "load", purpose: "live", itemId: "b", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(players).toHaveLength(2);
  });

  it("treats an ended capture as a lost player", async () => {
    const { host, players, events, diagnostics } = setup();
    host.handle({ type: "load", purpose: "live", itemId: "a", source: youtube, positionMs: 0, paused: false });
    await vi.advanceTimersByTimeAsync(0);
    players[0]!.report({ type: "capture", ok: false, reason: "capture-ended" });
    expect(players[0]!.port.destroyed).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "report", itemId: "a", state: "failed" });
    expect(diagnostics).toContain("desktop.video.capture-ended");
  });
});
