import type { VideoSource, VideosProjection } from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseYouTubeMessage, VideosOverlay } from "./VideosOverlay.js";

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
let pause: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  pause = vi.fn<() => void>();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const youtube: VideoSource = { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 };
const clip: VideoSource = { provider: "twitch-clip", clipSlug: "ClipOne" };
const direct: VideoSource = { provider: "direct", url: "https://media.example.com/a.mp4" };

function active(source: VideoSource, overrides: { clock?: { state: "playing" | "paused"; positionMs: number; atEpochMs: number }; obsAudio?: boolean; itemId?: string } = {}): VideosProjection {
  return {
    status: "active", itemId: overrides.itemId ?? "item-1", title: "The big play", requester: "Viewer",
    delivery: { mode: "player", source, clock: overrides.clock ?? { state: "playing", positionMs: 0, atEpochMs: 1_000 }, obsAudio: overrides.obsAudio ?? true }
  };
}

describe("VideosOverlay", () => {
  it("renders nothing while idle or mirrored", () => {
    const { container, rerender } = render(<VideosOverlay projection={{ status: "idle" }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<VideosOverlay projection={{ status: "active", itemId: "item-1", title: null, requester: null, delivery: { mode: "mirror", obsAudio: true } }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fails closed on invalid data and reports it once against the item", () => {
    const events = vi.fn();
    const invalid = active({ provider: "direct", url: "http://evil.example/a.mp4" });
    const { container, rerender } = render(<VideosOverlay onPlaybackEvent={events} projection={invalid} />);
    rerender(<VideosOverlay onPlaybackEvent={events} projection={invalid} />);
    expect(container).toBeEmptyDOMElement();
    expect(events).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ instructionId: "video:item-1", status: "failed" }));
    expect(JSON.stringify(events.mock.calls)).not.toContain("evil.example");
  });

  it("shows the no-clip notice", () => {
    render(<VideosOverlay projection={{ status: "notice", noticeId: "n1", notice: "no-clip", displayName: "Quiet Friend" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Quiet FriendNo clip to show right now");
  });

  it("builds the Twitch player for this page and reports started once on load", () => {
    const events = vi.fn();
    render(<VideosOverlay onPlaybackEvent={events} projection={active(clip, { obsAudio: false })} />);
    const frame = screen.getByTitle("Video player");
    const url = new URL(frame.getAttribute("src")!);
    expect(url.origin).toBe("https://clips.twitch.tv");
    expect(url.searchParams.get("parent")).toBe(window.location.hostname);
    expect(url.searchParams.get("muted")).toBe("true");
    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(events.mock.calls).toEqual([[{ instructionId: "video:item-1", status: "started" }]]);
    expect(screen.getByText("Requested by Viewer")).toBeVisible();
  });

  it("follows the shared clock for direct files and reports start and end", () => {
    const events = vi.fn();
    let now = 6_000;
    const { rerender } = render(<VideosOverlay now={() => now} onPlaybackEvent={events} projection={active(direct, { obsAudio: false })} />);
    const video = screen.getByTestId<HTMLVideoElement>("video-overlay-direct");
    expect(video.muted).toBe(true);
    Object.defineProperty(video, "duration", { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(5);
    expect(play).toHaveBeenCalled();

    now = 10_000;
    rerender(<VideosOverlay now={() => now} onPlaybackEvent={events} projection={active(direct, { clock: { state: "paused", positionMs: 7_000, atEpochMs: 9_000 } })} />);
    expect(video.currentTime).toBe(7);
    expect(pause).toHaveBeenCalled();

    fireEvent.playing(video);
    fireEvent.ended(video);
    expect(events.mock.calls.map(([event]) => event.status)).toEqual(["started", "completed"]);
  });

  it("steers YouTube by postMessage and only trusts messages from its own frame", () => {
    const events = vi.fn();
    render(<VideosOverlay now={() => 31_000} onPlaybackEvent={events} projection={active(youtube, { clock: { state: "playing", positionMs: 0, atEpochMs: 1_000 } })} />);
    const frame = screen.getByTitle<HTMLIFrameElement>("Video player");
    const posted = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => undefined);
    fireEvent.load(frame);
    const commands = posted.mock.calls.map(call => ({ message: JSON.parse(String(call[0])) as { event: string; func?: string; args?: unknown[] }, origin: call[1] as unknown }));
    expect(commands.every(command => command.origin === "https://www.youtube-nocookie.com")).toBe(true);
    expect(commands.map(command => command.message.func ?? command.message.event)).toEqual(["listening", "seekTo", "playVideo"]);
    expect(commands[1]?.message.args).toEqual([30, true]);
    expect(events).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", source: frame.contentWindow, data: JSON.stringify({ event: "onStateChange", info: 1 }) }));
      window.dispatchEvent(new MessageEvent("message", { origin: "https://www.youtube-nocookie.com", source: window, data: JSON.stringify({ event: "onStateChange", info: 1 }) }));
    });
    expect(events).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://www.youtube-nocookie.com", source: frame.contentWindow, data: JSON.stringify({ event: "onStateChange", info: 1 }) }));
      window.dispatchEvent(new MessageEvent("message", { origin: "https://www.youtube-nocookie.com", source: frame.contentWindow, data: JSON.stringify({ event: "onStateChange", info: 0 }) }));
    });
    expect(events.mock.calls.map(([event]) => event.status)).toEqual(["started", "completed"]);
  });

  it("reports a player that never loads as failed", () => {
    vi.useFakeTimers();
    const events = vi.fn();
    render(<VideosOverlay onPlaybackEvent={events} playerLoadTimeoutMs={500} projection={active(clip)} />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ instructionId: "video:item-1", status: "failed", failure: expect.objectContaining({ stage: "source-load" }) }));
  });
});

describe("parseYouTubeMessage", () => {
  it("reads state and time and ignores anything else", () => {
    expect(parseYouTubeMessage(JSON.stringify({ event: "infoDelivery", info: { playerState: 2, currentTime: 12.5 } }))).toEqual({ playerState: 2, currentTime: 12.5 });
    expect(parseYouTubeMessage(JSON.stringify({ event: "onStateChange", info: 0 }))).toEqual({ playerState: 0, currentTime: null });
    expect(parseYouTubeMessage("not json")).toBeNull();
    expect(parseYouTubeMessage(JSON.stringify({ event: "other" }))).toBeNull();
  });
});
