import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import type { VideoSource, VideosProjection } from "@stream-jams/core";
import type { VideoMirrorConnector, VideoMirrorPublisherSignal } from "@stream-jams/core/videos";
import { VideosOverlay } from "./VideosOverlay.js";

// Stories never contact providers: embedded players are swapped for a tiny local document,
// and direct files for the tiny local video.
const localPlayer = (_url: string, source: VideoSource) => source.provider === "direct" ? "/storybook-assets/tiny-video.mp4" : "/storybook-assets/tiny-alert.svg";

function active(source: VideoSource, overrides: Partial<Extract<VideosProjection, { status: "active" }>> = {}): VideosProjection {
  return {
    status: "active",
    itemId: `story-${source.provider}`,
    title: "The comeback nobody expected",
    requester: "Friendly Streamer",
    delivery: { mode: "player", source, clock: { state: "playing", positionMs: 0, atEpochMs: Date.now() }, obsAudio: false },
    ...overrides
  };
}

const meta = {
  title: "Overlay/Videos",
  component: VideosOverlay,
  tags: ["videos"],
  parameters: { layout: "fullscreen" },
  args: { resolvePlayerUrl: localPlayer },
  decorators: [(Story) => <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#343b4a" }}><Story /></div>]
} satisfies Meta<typeof VideosOverlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const IdleIsTransparent: Story = {
  args: { projection: { status: "idle" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-testid='video-overlay']")).toBeNull();
  }
};

export const TwitchClip: Story = {
  args: { projection: active({ provider: "twitch-clip", clipSlug: "StorybookClip" }) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector(".video-overlay__frame")).toHaveAttribute("data-state", "playing"));
    await expect(within(canvasElement).getByText("The comeback nobody expected")).toBeVisible();
    await expect(within(canvasElement).getByText("Requested by Friendly Streamer")).toBeVisible();
  }
};

// The local stand-in sends no YouTube state messages, so the frame stays in its loading state.
export const YouTubeLoading: Story = {
  args: { projection: active({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, { title: null }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Loading video");
  }
};

export const DirectFile: Story = {
  args: { projection: active({ provider: "direct", url: "https://media.example.com/highlight.mp4" }, { requester: null }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("video")).toHaveProperty("muted", true);
  }
};

export const NoClipNotice: Story = {
  args: { projection: { status: "notice", noticeId: "story-notice", notice: "no-clip", displayName: "Quiet Friend" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Quiet FriendNo clip to show right now");
  }
};

export const InvalidDataStaysTransparent: Story = {
  args: { projection: active({ provider: "direct", url: "http://unsafe.example/clip.mp4" }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-testid='video-overlay']")).toBeNull();
  }
};

/*
 * Desktop mirror receiver states. Stories stay offline: a local stand-in answers the
 * signaling and its "peer" hands over a tiny canvas stream instead of a WebRTC connection.
 */
type MirrorBehaviour = "connecting" | "playing" | "unavailable";

function storyMirror(behaviour: MirrorBehaviour): { connector: VideoMirrorConnector; createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection } {
  const listeners = new Set<(signal: VideoMirrorPublisherSignal) => void>();
  const reply = (signal: VideoMirrorPublisherSignal) => window.setTimeout(() => { for (const listener of listeners) listener(signal); }, 50);
  const connector: VideoMirrorConnector = {
    send: signal => {
      if (signal.type !== "hello" || behaviour === "connecting") return;
      reply(behaviour === "playing" ? { type: "offer", connection: signal.connection, sdp: "story-offer" } : { type: "not-ready", connection: signal.connection });
    },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }
  };
  const createPeerConnection = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext("2d");
    if (context !== null) { context.fillStyle = "#1f6feb"; context.fillRect(0, 0, 320, 180); context.fillStyle = "#ffffff"; context.font = "24px sans-serif"; context.fillText("Desktop mirror", 70, 100); }
    const stream = canvas.captureStream(5);
    const peer = {
      connectionState: "new" as RTCPeerConnectionState,
      localDescription: { type: "answer", sdp: "story-answer" },
      ontrack: null as ((event: { streams: MediaStream[] }) => void) | null,
      onicecandidate: null,
      onconnectionstatechange: null as (() => void) | null,
      setRemoteDescription: async () => undefined,
      createAnswer: async () => ({ type: "answer", sdp: "story-answer" }),
      setLocalDescription: async () => {
        window.setTimeout(() => {
          peer.ontrack?.({ streams: [stream] });
          peer.connectionState = "connected";
          peer.onconnectionstatechange?.();
        }, 50);
      },
      addIceCandidate: async () => undefined,
      close: () => { for (const track of stream.getTracks()) track.stop(); }
    };
    return peer as unknown as RTCPeerConnection;
  };
  return { connector, createPeerConnection };
}

function mirrored(paused: boolean): VideosProjection {
  return { status: "active", itemId: "story-mirror", title: "The comeback nobody expected", requester: "Friendly Streamer", delivery: { mode: "mirror", paused, obsAudio: true } };
}

const mirrorArgs = (behaviour: MirrorBehaviour, paused = false) => {
  const { connector, createPeerConnection } = storyMirror(behaviour);
  return { projection: mirrored(paused), mirror: connector, createMirrorPeerConnection: createPeerConnection, muted: true };
};

export const MirrorConnecting: Story = {
  args: mirrorArgs("connecting"),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-testid='video-overlay']")).toHaveAttribute("data-state", "connecting");
    // Transparent until frames arrive: no picture and no caption.
    await expect(canvasElement.querySelector(".video-overlay__frame")).not.toBeVisible();
    await expect(within(canvasElement).queryByText("The comeback nobody expected")).toBeNull();
  }
};

export const MirrorPlaying: Story = {
  args: mirrorArgs("playing"),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-testid='video-overlay']")).toHaveAttribute("data-state", "playing"), { timeout: 4000 });
    await expect(within(canvasElement).getByText("The comeback nobody expected")).toBeVisible();
    await expect(canvasElement.querySelector("[data-testid='video-overlay-mirror']")).toBeVisible();
  }
};

export const MirrorPaused: Story = {
  args: mirrorArgs("playing", true),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-testid='video-overlay']")).toHaveAttribute("data-state", "paused"), { timeout: 4000 });
    await expect(within(canvasElement).getByText("Requested by Friendly Streamer")).toBeVisible();
  }
};

export const MirrorUnavailable: Story = {
  args: mirrorArgs("unavailable"),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-testid='video-overlay']")).toHaveAttribute("data-state", "unavailable"), { timeout: 5000 });
    await expect(canvasElement.querySelector(".video-overlay__frame")).not.toBeVisible();
  }
};
