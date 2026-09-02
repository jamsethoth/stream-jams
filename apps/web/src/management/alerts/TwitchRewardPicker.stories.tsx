import type { TwitchCustomReward } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { ManagementHttpError } from "../management-http-client.js";
import { TwitchRewardPicker } from "./TwitchRewardPicker.js";

const meta = {
  title: "Management/Alerts/Twitch reward picker",
  component: TwitchRewardPicker,
  args: {
    onChange: fn(),
    selection: { mode: "selected", rewardIds: [] }
  }
} satisfies Meta<typeof TwitchRewardPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingCatalog: Story = {
  args: {
    loadRewards: () => new Promise(() => undefined)
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading Twitch rewards");
  }
};

export const PopulatedMultiSelection: Story = {
  args: {
    loadRewards: async () => ({ rewards: [
      customReward("reward-hydrate", "Hydrate", { cost: 250 }),
      customReward("reward-stretch", "Stretch break", { cost: 750 }),
      customReward("reward-posture", "Posture check", { cost: 500 })
    ] }),
    onUseAsSample: fn(),
    overlapAlertNames: ["General channel points"],
    sampleRewardId: "reward-hydrate",
    selection: { mode: "selected", rewardIds: ["reward-hydrate", "reward-stretch"] }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByText("3 custom rewards loaded.")).toBeVisible();
    await expect(canvas.getByRole("note", { name: "Potential overlapping alerts" })).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: /Hydrate/u })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: /Stretch break/u })).toBeChecked();
  }
};

export const InactiveRewards: Story = {
  args: {
    loadRewards: async () => ({ rewards: [
      customReward("reward-disabled", "Disabled reward", { isEnabled: false }),
      customReward("reward-paused", "Paused reward", { isPaused: true }),
      customReward("reward-stock", "Out-of-stock reward", { isInStock: false }),
      customReward("reward-input", "Viewer message", { isUserInputRequired: true })
    ] }),
    selection: { mode: "selected", rewardIds: ["reward-disabled", "reward-paused"] }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByText("Disabled")).toBeVisible();
    await expect(canvas.getByText("Paused")).toBeVisible();
    await expect(canvas.getByText("Out of stock")).toBeVisible();
    await expect(canvas.getByText("Requires user input")).toBeVisible();
  }
};

export const EmptyCatalog: Story = {
  args: {
    loadRewards: async () => ({ rewards: [] })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByText("No custom rewards are available for this channel.")).toBeVisible();
  }
};

export const Disconnected: Story = {
  args: {
    loadRewards: async () => {
      throw new ManagementHttpError(
        "Twitch is not connected",
        "TWITCH_REWARD_CATALOG_DISCONNECTED",
        "ref-story-disconnected"
      );
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Twitch is not connected");
    await expect(canvas.getByRole("link", { name: "Open Event sources" })).toHaveAttribute("href", "/manage/event-sources");
  }
};

export const ProviderFailure: Story = {
  args: {
    loadRewards: async () => {
      throw new ManagementHttpError(
        "Twitch did not respond",
        "TWITCH_API_REQUEST_FAILED",
        "ref-story-provider"
      );
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Twitch rewards could not be loaded");
    await expect(canvas.getByRole("button", { name: "Retry rewards" })).toBeVisible();
  }
};

export const UnavailableSavedReward: Story = {
  args: {
    loadRewards: async () => ({ rewards: [customReward("reward-current", "Current reward")] }),
    onUseAsSample: fn(),
    sampleRewardId: "reward-missing",
    selection: { mode: "selected", rewardIds: ["reward-missing", "reward-current"] }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Custom Twitch rewards" })).toBeVisible();
    await expect(await canvas.findByText("1 custom reward loaded.")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: /Unavailable reward.*reward-missing/u })).toBeChecked();
  }
};

function customReward(
  id: string,
  title: string,
  overrides: Partial<TwitchCustomReward> = {}
): TwitchCustomReward {
  return {
    id,
    title,
    prompt: "",
    cost: 500,
    backgroundColor: "#00E5CB",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true,
    ...overrides
  };
}
