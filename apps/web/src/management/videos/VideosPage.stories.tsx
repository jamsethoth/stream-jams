import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { createStoryAudioApi } from "../../stories/audio-fixtures.js";
import { createStaticVideosApi, heldVideos, playingVideo } from "../../stories/video-queue-fixtures.js";
import { VideosPage } from "./VideosPage.js";

const rewards = { rewards: [
  { id: "reward-video", title: "Play my video", cost: 500, prompt: "Paste a YouTube or Twitch link", backgroundColor: "#9147FF", isEnabled: true, isPaused: false, isInStock: true, isUserInputRequired: true }
] };

const meta = {
  title: "Management/Videos",
  component: VideosPage,
  parameters: { layout: "fullscreen" },
  args: {
    api: createStaticVideosApi(playingVideo()),
    audioApi: createStoryAudioApi(),
    managementApi: { getTwitchCustomRewards: async () => rewards }
  }
} satisfies Meta<typeof VideosPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfiguredWithPlayback: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Maximum length (seconds)")).toHaveValue(120);
    await expect(canvas.getByRole("note")).toHaveTextContent("the desktop mirror arrives with the desktop player");
    await expect(await canvas.findByRole("article", { name: "Now playing" })).toBeVisible();
    await expect(await within(canvas.getByRole("list", { name: "Mapped rewards" })).findByText("Play my video")).toBeVisible();
  }
};

export const HeldRequests: Story = {
  args: { api: createStaticVideosApi(heldVideos()) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("button", { name: "Play anyway: Full concert" })).toBeVisible();
  }
};

export const TwitchRewardsUnavailable: Story = {
  args: { managementApi: { getTwitchCustomRewards: async () => { throw new Error("Twitch is not connected. Connect it in Event sources."); } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Twitch rewards could not be loaded/u)).toBeVisible();
    await expect(canvas.getByLabelText("Reward ID")).toBeVisible();
  }
};
