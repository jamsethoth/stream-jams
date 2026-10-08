import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayComposition, VideoShoutoutClip, VideoShoutoutProjection } from "@stream-jams/core";
import { OverlaySurface, type OverlayPlaybackEvent } from "./OverlaySurface.js";
import { VideoShoutout } from "./VideoShoutout.js";

afterEach(cleanup);

const clip: VideoShoutoutClip = {
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "ClipOne",
  embedUrl: "https://clips.twitch.tv/embed?clip=ClipOne&parent=127.0.0.1",
  title: "The big play",
  durationMs: 20_000,
  avatarUrl: "https://static-cdn.jtvnw.net/jtv_user_pictures/friendly.png"
};

describe("VideoShoutout", () => {
  it("renders nothing while idle", () => {
    const { container } = render(<VideoShoutout projection={{ status: "idle" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading state with the validated embed and safe shoutout context", () => {
    render(<VideoShoutout projection={{ status: "loading", activationId: "video-shoutout:a", clip }} />);
    expect(screen.getByTestId("video-shoutout")).toHaveAttribute("data-state", "loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading clip");
    const player = screen.getByTitle("Twitch clip: The big play");
    expect(player).toHaveAttribute("src", clip.embedUrl);
    expect(player).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
    expect(player).toHaveAttribute("referrerpolicy", "origin");
    expect(screen.getByText("Friendly Streamer")).toBeInTheDocument();
    expect(screen.getByText("The big play")).toBeInTheDocument();
    expect(document.querySelector(".video-shoutout__avatar")).toHaveAttribute("src", clip.avatarUrl);
  });

  it("reports the player started once when the embed loads and switches to playing", () => {
    const events: OverlayPlaybackEvent[] = [];
    render(<VideoShoutout onPlaybackEvent={event => events.push(event)} projection={{ status: "loading", activationId: "video-shoutout:a", clip }} />);
    const player = screen.getByTitle("Twitch clip: The big play");
    fireEvent.load(player);
    fireEvent.load(player);
    expect(events).toEqual([{ instructionId: "video-shoutout:a", status: "started" }]);
    expect(screen.getByTestId("video-shoutout")).toHaveAttribute("data-state", "playing");
    expect(screen.queryByText("Loading clip")).not.toBeInTheDocument();
  });

  it("reports a player that never loads through the overlay reporting path", () => {
    vi.useFakeTimers();
    try {
      const onPlaybackEvent = vi.fn<(event: OverlayPlaybackEvent) => void>();
      render(<VideoShoutout onPlaybackEvent={onPlaybackEvent} playerLoadTimeoutMs={5_000} projection={{ status: "loading", activationId: "video-shoutout:a", clip }} />);
      act(() => { vi.advanceTimersByTime(4_999); });
      expect(onPlaybackEvent).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(onPlaybackEvent).toHaveBeenCalledTimes(1);
      expect(onPlaybackEvent.mock.calls[0]?.[0]).toMatchObject({
        instructionId: "video-shoutout:a",
        status: "failed",
        failure: { stage: "source-load", message: "Twitch clip player did not load in time." }
      });
      // A late load after a reported failure does not also report a start.
      fireEvent.load(screen.getByTitle("Twitch clip: The big play"));
      expect(onPlaybackEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out once the player has loaded", () => {
    vi.useFakeTimers();
    try {
      const onPlaybackEvent = vi.fn<(event: OverlayPlaybackEvent) => void>();
      render(<VideoShoutout onPlaybackEvent={onPlaybackEvent} playerLoadTimeoutMs={5_000} projection={{ status: "loading", activationId: "video-shoutout:a", clip }} />);
      fireEvent.load(screen.getByTitle("Twitch clip: The big play"));
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(onPlaybackEvent.mock.calls.map(([event]) => event.status)).toEqual(["started"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the playing state and shows the login only when it differs from the display name", () => {
    const { rerender } = render(<VideoShoutout projection={{ status: "playing", activationId: "video-shoutout:a", clip, endsAtEpochMs: 10 }} />);
    expect(screen.getByText("(friendly_streamer)")).toBeInTheDocument();
    rerender(<VideoShoutout projection={{ status: "playing", activationId: "video-shoutout:a", clip: { ...clip, displayName: "Friendly_Streamer" }, endsAtEpochMs: 10 }} />);
    expect(screen.queryByText("(friendly_streamer)")).not.toBeInTheDocument();
  });

  it("omits a missing or broken avatar while the clip still renders", () => {
    const { rerender } = render(<VideoShoutout projection={{ status: "loading", activationId: "video-shoutout:a", clip: { ...clip, avatarUrl: null } }} />);
    expect(document.querySelector(".video-shoutout__avatar")).toBeNull();
    rerender(<VideoShoutout projection={{ status: "loading", activationId: "video-shoutout:b", clip }} />);
    fireEvent.error(document.querySelector(".video-shoutout__avatar")!);
    expect(document.querySelector(".video-shoutout__avatar")).toBeNull();
    expect(screen.getByTitle("Twitch clip: The big play")).toBeInTheDocument();
  });

  it("fails closed for unsafe media URLs and reports the invalid activation once", () => {
    const events: OverlayPlaybackEvent[] = [];
    const unsafe = { status: "loading", activationId: "video-shoutout:a",
      clip: { ...clip, embedUrl: "https://evil.example/embed?clip=ClipOne&parent=127.0.0.1" } } satisfies VideoShoutoutProjection;
    const { container, rerender } = render(<VideoShoutout onPlaybackEvent={event => events.push(event)} projection={unsafe} />);
    rerender(<VideoShoutout onPlaybackEvent={event => events.push(event)} projection={{ ...unsafe }} />);
    expect(container).toBeEmptyDOMElement();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ instructionId: "video-shoutout:a", status: "failed" });

    rerender(<VideoShoutout projection={{ status: "loading", activationId: "video-shoutout:b", clip: { ...clip, avatarUrl: "http://cdn.example/a.png" } }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["no-clip", "No clip to show right now"],
    ["playback-failed", "Clip unavailable"]
  ] as const)("shows only the bounded %s message", (reason, message) => {
    render(<VideoShoutout projection={{ status: "error", activationId: "video-shoutout:a", reason, displayName: "Quiet Friend" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(`Quiet Friend${message}`);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("replaces the player when a new activation arrives", () => {
    const events: OverlayPlaybackEvent[] = [];
    const { rerender } = render(<VideoShoutout onPlaybackEvent={event => events.push(event)} projection={{ status: "playing", activationId: "video-shoutout:a", clip, endsAtEpochMs: 1 }} />);
    fireEvent.load(screen.getByTitle("Twitch clip: The big play"));
    const next = { ...clip, clipId: "ClipTwo", title: "Second play", embedUrl: "https://clips.twitch.tv/embed?clip=ClipTwo&parent=127.0.0.1" };
    rerender(<VideoShoutout onPlaybackEvent={event => events.push(event)} projection={{ status: "loading", activationId: "video-shoutout:b", clip: next }} />);
    expect(screen.queryByTitle("Twitch clip: The big play")).not.toBeInTheDocument();
    expect(screen.getByText("Loading clip")).toBeInTheDocument();
    fireEvent.load(screen.getByTitle("Twitch clip: Second play"));
    expect(events.map(event => event.instructionId)).toEqual(["video-shoutout:a", "video-shoutout:b"]);
  });

  it("renders from a module composition and forwards player reports", () => {
    const events: OverlayPlaybackEvent[] = [];
    const composition: OverlayComposition = {
      overlayId: "default", purpose: "live", scope: "module",
      modules: [{ moduleId: "video-shoutout", enabled: true, instructions: [],
        presentation: { kind: "video-shoutout", shoutout: { status: "loading", activationId: "video-shoutout:a", clip } } }]
    };
    render(<OverlaySurface composition={composition} onPlaybackEvent={event => events.push(event)} resolveAssetUrl={() => ""} />);
    fireEvent.load(screen.getByTitle("Twitch clip: The big play"));
    expect(events).toEqual([{ instructionId: "video-shoutout:a", status: "started" }]);
  });
});
