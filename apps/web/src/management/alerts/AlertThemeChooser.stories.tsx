import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AlertThemeChooser } from "./AlertThemeChooser.js";

const meta = {
  title: "Management/Alerts/Starter theme chooser",
  component: AlertThemeChooser,
  args: {
    eventType: "raid",
    onChange: fn()
  }
} satisfies Meta<typeof AlertThemeChooser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RaidCleanSelected: Story = {
  args: { value: "clean-signal" }
};

export const RaidBoldSelected: Story = {
  args: { value: "bold-pop" }
};

export const RaidNeonSelected: Story = {
  args: { value: "neon-terminal" }
};

export const Disabled: Story = {
  args: { disabled: true, value: "clean-signal" }
};
