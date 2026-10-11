import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultVideosModuleConfig, type VideosModuleConfig } from "@stream-jams/core";
import type { DesktopVideoCommand, DesktopVideoEvent, DesktopVideoTransport } from "@stream-jams/core/videos";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteVideoQueueRepository } from "./video-queue-repository.js";
import { VideoQueueService, type VideoSubmission } from "./video-queue-service.js";
import { VideoMirrorDirector } from "./video-mirror-director.js";

class FakeTransport implements DesktopVideoTransport {
  available = false;
  readonly sent: DesktopVideoCommand[] = [];
  #listeners = new Set<(event: DesktopVideoEvent) => void>();
  send(command: DesktopVideoCommand): void { this.sent.push(command); }
  subscribe(listener: (event: DesktopVideoEvent) => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  emit(event: unknown): void { for (const listener of this.#listeners) listener(event as DesktopVideoEvent); }
  get listeners(): number { return this.#listeners.size; }
}

const databases: StreamJamsDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function clip(title: string, extra: Partial<VideoSubmission> = {}): VideoSubmission {
  return { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title, requester: "viewer", durationMs: 30_000, autoplay: false, via: "management", ...extra };
}

function setup(options: { available?: boolean; config?: Partial<VideosModuleConfig>; devices?: { routeId: string; deviceId: string }[] | Error } = {}) {
  const database = createInMemoryStreamJamsDatabase();
  database.runMigrations();
  databases.push(database);
  let now = 1_000_000;
  const config: VideosModuleConfig = { ...createDefaultVideosModuleConfig(), ...options.config };
  const queue = new VideoQueueService({
    repository: new SqliteVideoQueueRepository(database.connection), getConfig: () => config, now: () => now,
    scheduler: { setTimeout: () => 0, clearTimeout: () => undefined }, createId: (() => { let id = 0; return () => `id${++id}`; })()
  });
  const transport = new FakeTransport();
  transport.available = options.available ?? false;
  let muted = false;
  const delivered: { clientId: string; signal: unknown }[] = [];
  const deliverable = new Set(["client-1", "client-2"]);
  const availability = vi.fn();
  const errors: string[] = [];
  const director = new VideoMirrorDirector({
    queue, transport, getConfig: () => config, isMuted: () => muted,
    resolveDevices: async routeIds => {
      if (options.devices instanceof Error) throw options.devices;
      return (options.devices ?? []).filter(device => routeIds.includes(device.routeId));
    },
    deliverSignal: (clientId, signal) => { if (!deliverable.has(clientId)) return false; delivered.push({ clientId, signal }); return true; },
    onAvailabilityChanged: availability,
    onError: message => errors.push(message),
    now: () => now
  });
  queue.subscribe((purpose, view) => director.queueChanged(purpose, view));
  return {
    director, queue, transport, delivered, deliverable, availability, errors,
    setMuted: (value: boolean) => { muted = value; },
    advance: (ms: number) => { now += ms; },
    play: (title = "One") => {
      const item = queue.submit("live", clip(title));
      queue.command("live", queue.view("live").revision, { kind: "play-next" });
      return item;
    }
  };
}

describe("VideoMirrorDirector", () => {
  it("stays unavailable and sends nothing without a desktop player", () => {
    const { director, transport, play } = setup();
    play();
    expect(director.available).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  it("switches outputs when the desktop player appears and disappears, resyncing the current item", async () => {
    const { director, transport, availability, play } = setup({ config: { audioDeviceIds: ["route-a"], audioDeviceDelaysMs: { "route-a": 120 } }, devices: [{ routeId: "route-a", deviceId: "device-a" }] });
    const item = play();
    transport.emit({ type: "status", available: true });
    expect(director.available).toBe(true);
    expect(availability).toHaveBeenCalledOnce();
    expect(transport.sent).toContainEqual(expect.objectContaining({ type: "load", purpose: "live", itemId: item.id, paused: false }));
    await vi.waitFor(() => expect(transport.sent).toContainEqual({ type: "set-output", purpose: "live", muted: false, devices: [{ deviceId: "device-a", delayMs: 120 }] }));
    transport.emit({ type: "status", available: true });
    expect(availability).toHaveBeenCalledOnce();
    transport.emit({ type: "status", available: false });
    expect(director.available).toBe(false);
    expect(availability).toHaveBeenCalledTimes(2);
  });

  it("translates queue changes into load, pause, play, seek and stop", () => {
    const { director, transport, queue, play, advance } = setup({ available: true });
    expect(director.available).toBe(true);
    const item = play();
    expect(transport.sent.at(-1)).toMatchObject({ type: "load", purpose: "live", itemId: item.id, source: { provider: "youtube" }, positionMs: 0, paused: false });
    queue.reportStarted(item.id, { positionMs: 0 });
    advance(5000);
    queue.control("live", item.id, { kind: "pause" });
    expect(transport.sent.at(-1)).toEqual({ type: "pause", purpose: "live", itemId: item.id });
    queue.control("live", item.id, { kind: "seek", positionMs: 12_000 });
    expect(transport.sent.at(-1)).toMatchObject({ type: "seek", purpose: "live", itemId: item.id, positionMs: 12_000 });
    queue.control("live", item.id, { kind: "resume" });
    expect(transport.sent.at(-1)).toEqual({ type: "play", purpose: "live", itemId: item.id, positionMs: 12_000 });
    const count = transport.sent.length;
    director.queueChanged("live", queue.view("live"));
    expect(transport.sent).toHaveLength(count);
    queue.command("live", queue.view("live").revision, { kind: "stop" });
    expect(transport.sent.at(-1)).toEqual({ type: "stop", purpose: "live" });
  });

  it("routes player reports through the queue only for the item it was sent", () => {
    const { director, transport, queue, play } = setup({ available: true });
    const item = play();
    transport.emit({ type: "report", purpose: "live", itemId: "other", state: "started" });
    transport.emit({ type: "report", purpose: "test", itemId: item.id, state: "started" });
    expect(queue.view("live").current?.phase).not.toBe("playing");
    transport.emit({ type: "report", purpose: "live", itemId: item.id, state: "started", positionMs: 0, durationMs: 30_000, controls: { pause: false, seek: false } });
    expect(queue.view("live").current?.phase).toBe("playing");
    expect(director.controlsFor(item.id)).toEqual({ pause: false, seek: false });
    transport.emit({ type: "report", purpose: "live", itemId: item.id, state: "bogus" });
    transport.emit({ type: "report", purpose: "live", itemId: item.id, state: "ended" });
    expect(queue.view("live").current).toBeNull();
  });

  it("stops the desktop player and moves on when an unknown-length item reports a duration over the limit", () => {
    const { transport, queue } = setup({ available: true, config: { maxLengthSeconds: 60, gapSeconds: 0 } });
    const unknown = queue.submit("live", clip("Unknown", { durationMs: null }));
    const next = queue.submit("live", clip("Next"));
    queue.command("live", queue.view("live").revision, { kind: "play-all" });
    expect(transport.sent.at(-1)).toMatchObject({ type: "load", itemId: unknown.id });
    transport.emit({ type: "report", purpose: "live", itemId: unknown.id, state: "started", positionMs: 0, durationMs: 300_000 });
    expect(transport.sent.at(-1)).toMatchObject({ type: "load", itemId: next.id });
    expect(queue.view("live").current?.item.id).toBe(next.id);
    expect(queue.view("live").items.find(item => item.id === unknown.id)).toMatchObject({ status: "held", holdReason: "over-limit", durationMs: 300_000 });
  });

  it("follows the global mute and resolves device routes like alert audio", async () => {
    const { director, transport, setMuted } = setup({ available: true, config: { audioDeviceIds: ["route-a", "route-b"], audioDeviceDelaysMs: { "route-b": 40 } },
      devices: [{ routeId: "route-a", deviceId: "device-a" }, { routeId: "route-b", deviceId: "device-a" }] });
    await vi.waitFor(() => expect(transport.sent.filter(command => command.type === "set-output")).toHaveLength(2));
    setMuted(true);
    director.refreshOutput();
    await vi.waitFor(() => expect(transport.sent.at(-1)).toEqual({ type: "set-output", purpose: "test", muted: true, devices: [{ deviceId: "device-a", delayMs: 40 }] }));
  });

  it("fails closed for devices when destinations cannot be resolved", async () => {
    const { transport, errors } = setup({ available: true, config: { audioDeviceIds: ["route-a"] }, devices: new Error("audio unavailable") });
    await vi.waitFor(() => expect(transport.sent.filter(command => command.type === "set-output")).toEqual([
      { type: "set-output", purpose: "live", muted: false, devices: [] },
      { type: "set-output", purpose: "test", muted: false, devices: [] }
    ]));
    expect(errors).toEqual(["Video device audio destinations could not be resolved."]);
  });

  it("relays browser signals with relay-assigned receiver ids and answers not-ready while unavailable", () => {
    const { director, transport, delivered } = setup();
    director.receiveBrowserSignal({ id: "client-1", purpose: "live" }, { type: "hello", connection: 1 });
    expect(delivered).toEqual([{ clientId: "client-1", signal: { type: "not-ready", connection: 1 } }]);
    expect(transport.sent).toEqual([]);
    transport.emit({ type: "status", available: true });
    director.receiveBrowserSignal({ id: "client-1", purpose: "live" }, { type: "hello", connection: 2 });
    expect(transport.sent.at(-1)).toEqual({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "hello", connection: 2 } });
    transport.emit({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "offer", connection: 2, sdp: "v=0" } });
    expect(delivered.at(-1)).toEqual({ clientId: "client-1", signal: { type: "offer", connection: 2, sdp: "v=0" } });
    // Signals for another purpose, an unknown client, or a desktop receiver never reach a browser source.
    transport.emit({ type: "signal", purpose: "test", receiverId: "browser:client-1", signal: { type: "offer", connection: 3, sdp: "v=0" } });
    transport.emit({ type: "signal", purpose: "live", receiverId: "browser:client-2", signal: { type: "offer", connection: 3, sdp: "v=0" } });
    transport.emit({ type: "signal", purpose: "live", receiverId: "desktop:overlay", signal: { type: "offer", connection: 3, sdp: "v=0" } });
    expect(delivered).toHaveLength(2);
    director.browserClientDisconnected("client-1");
    expect(transport.sent.at(-1)).toEqual({ type: "signal", purpose: "live", receiverId: "browser:client-1", signal: { type: "bye", connection: Number.MAX_SAFE_INTEGER } });
    director.browserClientDisconnected("client-1");
    expect(transport.sent.filter(command => command.type === "signal")).toHaveLength(2);
  });

  it("bounds the number of browser receivers", () => {
    const { director, transport } = setup({ available: true });
    for (let index = 0; index < 260; index += 1) director.receiveBrowserSignal({ id: `client-${index}`, purpose: "live" }, { type: "hello", connection: 1 });
    expect(transport.sent.filter(command => command.type === "signal")).toHaveLength(256);
  });

  it("ignores invalid events and stops listening when closed", () => {
    const { director, transport, availability } = setup();
    transport.emit({ type: "status", available: "yes" });
    expect(availability).not.toHaveBeenCalled();
    director.close();
    expect(transport.listeners).toBe(0);
    expect(director.available).toBe(false);
  });
});
