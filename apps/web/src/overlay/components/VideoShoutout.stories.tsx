import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import type { VideoShoutoutClip, VideoShoutoutProjection } from "@stream-jams/core";
import { VideoShoutout } from "./VideoShoutout.js";

// Stories never contact Twitch: the validated embed URL is swapped for a tiny local document.
const localPlayer = () => "/storybook-assets/tiny-alert.svg";
const clip: VideoShoutoutClip = {
  login: "friendly_streamer",
  displayName: "Friendly Streamer",
  clipId: "StorybookClip",
  embedUrl: "https://clips.twitch.tv/embed?clip=StorybookClip&parent=localhost",
  title: "The comeback nobody expected",
  durationMs: 27_000,
  avatarUrl: null
};
const nextClip: VideoShoutoutClip = {
  ...clip,
  login: "second_friend",
  displayName: "Second Friend",
  clipId: "SecondClip",
  embedUrl: "https://clips.twitch.tv/embed?clip=SecondClip&parent=localhost",
  title: "A brand new highlight"
};

const meta = {
  title: "Overlay/Video shoutout",
  component: VideoShoutout,
  tags: ["video-shoutout"],
  parameters: { layout: "fullscreen" },
  args: { resolvePlayerUrl: localPlayer },
  decorators: [(Story) => <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#343b4a" }}><Story /></div>]
} satisfies Meta<typeof VideoShoutout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const IdleIsTransparent: Story = {
  args: { projection: { status: "idle" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-testid='video-shoutout']")).toBeNull();
  }
};

// The loading frame shows until the embedded player reports loaded; locally that is near-instant.
export const LoadingClip: Story = {
  args: { projection: { status: "loading", activationId: "video-shoutout:loading", clip } }
};

export const PlayingClip: Story = {
  args: { projection: { status: "playing", activationId: "video-shoutout:playing", clip, endsAtEpochMs: Date.now() + 27_000 } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-testid='video-shoutout']")).toHaveAttribute("data-state", "playing"));
    await expect(within(canvasElement).getByText("The comeback nobody expected")).toBeVisible();
  }
};

export const NoClipAvailable: Story = {
  args: { projection: { status: "error", activationId: "video-shoutout:no-clip", reason: "no-clip", displayName: "Quiet Friend" } }
};

export const PlayerFailed: Story = {
  args: { projection: { status: "error", activationId: "video-shoutout:failed", reason: "playback-failed", displayName: "Friendly Streamer" } }
};

export const LongTextStaysBounded: Story = {
  args: { projection: { status: "playing", activationId: "video-shoutout:long", endsAtEpochMs: Date.now() + 27_000,
    clip: { ...clip, displayName: "AnExtremelyLongDisplayNameThatKeepsGoing", title: "An extraordinarily long clip title that should truncate instead of wrapping across the broadcast canvas" } } }
};

function ReplacementDemo(props: { readonly resolvePlayerUrl?: ((embedUrl: string) => string) | undefined }) {
  const [projection, setProjection] = useState<VideoShoutoutProjection>({ status: "playing", activationId: "video-shoutout:first", clip, endsAtEpochMs: Date.now() + 27_000 });
  return (
    <>
      <VideoShoutout projection={projection} resolvePlayerUrl={props.resolvePlayerUrl} />
      <button style={{ position: "absolute", left: 16, top: 16 }} type="button"
        onClick={() => setProjection({ status: "loading", activationId: "video-shoutout:second", clip: nextClip })}>
        Send next shoutout
      </button>
    </>
  );
}

export const ReplacementSwapsActiveClip: Story = {
  args: { projection: { status: "idle" } },
  render: (args) => <ReplacementDemo resolvePlayerUrl={args.resolvePlayerUrl} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The comeback nobody expected")).toBeVisible();
    fireEvent.click(canvas.getByRole("button", { name: "Send next shoutout" }));
    await waitFor(() => expect(canvas.getByText("A brand new highlight")).toBeVisible());
    await expect(canvas.queryByText("The comeback nobody expected")).toBeNull();
  }
};
