import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MediaAudioControls } from "./MediaAudioControls.js";

const meta = {
  title: "Management/Alerts/Video audio",
  component: MediaAudioControls,
  args: { value: { playEmbeddedAudio: true, audioVolume: 1 }, hasSeparateAudio: false, onChange: fn() },
  render: function Controlled(args) {
    const [value, setValue] = useState(args.value);
    return <div className="alert-editor-inspector"><MediaAudioControls {...args} value={value} onChange={(next) => { setValue(next); args.onChange(next); }} /></div>;
  },
  parameters: { layout: "padded" }
} satisfies Meta<typeof MediaAudioControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NewVideo: Story = {};
export const Saving: Story = { args: { disabled: true } };
export const ExistingSilentVideo: Story = {
  args: { value: { playEmbeddedAudio: false, audioVolume: 1 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("spinbutton", { name: "Embedded audio volume" })).toBeDisabled();
    canvas.getByRole("checkbox", { name: "Play embedded audio" }).focus();
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("checkbox", { name: "Play embedded audio" })).toBeChecked();
    await expect(canvas.getByRole("spinbutton", { name: "Embedded audio volume" })).toBeEnabled();
  }
};
export const BothSources: Story = {
  args: { hasSeparateAudio: true, value: { playEmbeddedAudio: true, audioVolume: 0.5 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Both the video soundtrack and separate audio/)).toBeVisible();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Play embedded audio" }));
    await expect(canvas.queryByText(/Both the video soundtrack and separate audio/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("spinbutton", { name: "Embedded audio volume" })).toHaveValue(0.5);
  }
};
