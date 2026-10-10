import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createStaticVideoQueueApi, describedRecentVideos, describedVideos, failedVideos, heldVideos, playingVideo, queuedVideos, recentVideos, twitchClipPlaying, videoQueue } from "../../stories/video-queue-fixtures.js";
import { ManagementHttpError } from "../management-http-client.js";
import { OperatorItemCard } from "../../operator/OperatorItemCard.js";
import { VideoQueuePanel } from "./VideoQueuePanel.js";

/** The shared queue tools used by the Videos page and the Operator Console. */
const meta = {
  title: "Management/Videos/Queue",
  component: VideoQueuePanel,
  parameters: { layout: "padded" },
  args: { api: createStaticVideoQueueApi(videoQueue()) }
} satisfies Meta<typeof VideoQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyQueue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No videos are waiting. Add a link below or wait for requests.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Play next" })).toBeDisabled();
  }
};

export const QueuedRequests: Story = {
  args: { api: createStaticVideoQueueApi(queuedVideos()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("article", { name: "Cat plays keyboard" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Waiting (3)" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Move up: Cat plays keyboard" })).toBeDisabled();
  }
};

/** After provider lookup: titles and channels from YouTube and Twitch, a Twitch length over the limit, and a direct file with neither. */
export const ProviderDetails: Story = {
  args: { api: createStaticVideoQueueApi(describedVideos()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const youtube = await canvas.findByRole("article", { name: "Never Gonna Give You Up (Official Video)" });
    await expect(within(youtube).getByText("Rick Astley · Length unknown")).toBeVisible();
    const clip = canvas.getByRole("article", { name: "Clutch final round" });
    await expect(within(clip).getByText("SpeedyStreamer · 0:28")).toBeVisible();
    const vod = canvas.getByRole("article", { name: "Full charity marathon" });
    await expect(within(vod).getByText("SpeedyStreamer · 1:12:03")).toBeVisible();
    await expect(within(vod).getByText("Over the length limit")).toBeVisible();
    // A submitted title wins over the provider's.
    await expect(canvas.getByRole("article", { name: "Viewer's pick" })).toHaveTextContent("Some Channel · Length unknown");
    await expect(canvas.queryByText("Provider title is kept beside it")).not.toBeInTheDocument();
    const file = canvas.getByRole("article", { name: "https://videos.example.com/clip.mp4" });
    await expect(within(file).getByText("Length unknown")).toBeVisible();
    await expect(canvas.queryByText(/undefined|null/u)).not.toBeInTheDocument();
  }
};

export const HeldOverLimit: Story = {
  args: { api: createStaticVideoQueueApi(heldVideos()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const held = await canvas.findByRole("article", { name: "Full concert" });
    await expect(within(held).getByText("Over the length limit")).toBeVisible();
    await expect(within(held).getByRole("button", { name: "Play anyway: Full concert" })).toBeEnabled();
    const unknown = canvas.getByRole("article", { name: "Mystery link" });
    await expect(within(unknown).getByText(/Length unknown/u)).toBeVisible();
    await expect(within(unknown).getByText("Queued")).toBeVisible();
    await expect(within(unknown).queryByRole("button", { name: /Play anyway/u })).not.toBeInTheDocument();
  }
};

export const RecentFailure: Story = {
  args: { api: createStaticVideoQueueApi(failedVideos()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const failed = await canvas.findByRole("article", { name: "Removed upload" });
    await expect(within(failed).getByText("Failed")).toBeVisible();
    await expect(canvas.getByText("Failed recently (1)")).toBeVisible();
  }
};

/** The Operator Console variant: finished videos, newest first, with Replay in place of the failed-only list. */
export const OperatorRecentVideos: Story = {
  args: { api: createStaticVideoQueueApi(recentVideos()), recentCard: OperatorItemCard },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const recent = within(await canvas.findByRole("region", { name: "Recent videos" }));
    await expect(recent.getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Cat plays keyboard", "Removed upload", "https://videos.example.com/clip.mp4"]);
    await expect(recent.getByRole("article", { name: "Cat plays keyboard" })).toHaveTextContent("youtu.be · via channel points");
    await expect(canvas.queryByText(/Failed recently/u)).not.toBeInTheDocument();
    await userEvent.click(recent.getByRole("button", { name: "Replay Removed upload in Videos" }));
    await expect(await canvas.findByText("Removed upload added to the live video queue.")).toBeVisible();
  }
};

/** Operator Recent with provider details: the channel leads the summary and the provider title names the card. */
export const OperatorRecentProviderDetails: Story = {
  args: { api: createStaticVideoQueueApi(describedRecentVideos()), recentCard: OperatorItemCard },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const recent = within(await canvas.findByRole("region", { name: "Recent videos" }));
    await expect(recent.getByRole("article", { name: "Never Gonna Give You Up (Official Video)" })).toHaveTextContent("Rick Astley · Requested by viewer_one · YouTube");
    await expect(recent.getByRole("button", { name: "Replay Never Gonna Give You Up (Official Video) in Videos" })).toBeEnabled();
    await expect(recent.getByRole("article", { name: "Viewer's pick" })).toHaveTextContent("Some Channel · Requested by viewer_one");
  }
};

export const PlayingWithControls: Story = {
  args: { api: createStaticVideoQueueApi(playingVideo()) },
  play: async ({ canvasElement }) => {
    const card = within(await within(canvasElement).findByRole("article", { name: "Now playing" }));
    await expect(card.getByRole("slider", { name: "Seek" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Pause video" })).toBeEnabled();
    await expect(card.getByRole("button", { name: "Skip" })).toBeEnabled();
  }
};

export const PausedVideo: Story = {
  args: { api: createStaticVideoQueueApi(playingVideo("paused")) },
  play: async ({ canvasElement }) => {
    const card = within(await within(canvasElement).findByRole("article", { name: "Now playing" }));
    await expect(card.getByText("Paused")).toBeVisible();
    await expect(card.getByRole("button", { name: "Resume video" })).toBeEnabled();
    await expect(card.getByLabelText("Playback position")).toHaveTextContent("1:20 / 3:00");
  }
};

export const TwitchClipWithoutSeek: Story = {
  args: { api: createStaticVideoQueueApi(twitchClipPlaying()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("This player cannot be paused or sought. Skip and Stop still work.")).toBeVisible();
    await expect(canvas.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
  }
};

export const QueueChangedConflict: Story = {
  args: { api: createStaticVideoQueueApi(queuedVideos(), {
    command: async () => { throw new ManagementHttpError("The video queue changed. Refresh before trying again.", "VIDEO_QUEUE_CONFLICT", null, null, [], [], 409); }
  }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Play next" }));
    await expect(await canvas.findByText("The queue changed; try again.")).toBeVisible();
  }
};

export const AddVideoRejected: Story = {
  args: { api: createStaticVideoQueueApi(queuedVideos(), {
    submit: async () => { throw new ManagementHttpError("That site is not allowed. Add direct-file hosts in Videos settings. (VIDEO_REQUEST_REJECTED)", "VIDEO_REQUEST_REJECTED", null, null, [], [], 422); }
  }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText("Video link"), "https://unknown.example.com/clip.mp4");
    await userEvent.click(canvas.getByRole("button", { name: "Add video" }));
    await waitFor(() => expect(canvas.getByLabelText("Video link")).toHaveAccessibleDescription("That site is not allowed. Add direct-file hosts in Videos settings."));
  }
};

export const ClearConfirmation: Story = {
  args: { api: createStaticVideoQueueApi(queuedVideos()) },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Clear queue" }));
    const dialog = within(await within(document.body).findByRole("dialog", { name: "Clear 3 waiting videos?" }));
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  }
};
