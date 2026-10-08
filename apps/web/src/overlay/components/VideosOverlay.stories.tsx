import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import type { VideoSource, VideosProjection } from "@stream-jams/core";
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
