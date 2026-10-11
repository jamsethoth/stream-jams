import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDefaultVideosLayout } from "@stream-jams/core";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { VideoPlacementEditor } from "./VideoPlacementEditor.js";

const meta = {
  title: "Management/Videos Placement",
  component: VideoPlacementEditor,
  tags: ["videos"],
  args: { value: createDefaultVideosLayout(), onChange: fn() },
  render: function Example(args) {
    const [layout, setLayout] = useState(args.value);
    return <VideoPlacementEditor {...args} value={layout} onChange={next => { setLayout(next); args.onChange(next); }} />;
  }
} satisfies Meta<typeof VideoPlacementEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The saved default: centered and 72% wide, the same look outputs had before placement existed. */
export const DefaultPlacement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Video X (px)")).toHaveValue(269);
    await expect(canvas.getByLabelText("Video width (px)")).toHaveValue(1382);
    await expect(canvas.getByText("Example video title")).toBeInTheDocument();
  }
};

/** An operator moves a small picture-in-picture box with the keyboard. */
export const PictureInPicture: Story = {
  args: { value: { x: 1420, y: 40, width: 460, height: 320 } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole("button", { name: "Move video box" }).focus();
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}{ArrowDown}");
    await expect(canvas.getByLabelText("Video X (px)")).toHaveValue(1410);
    await expect(canvas.getByLabelText("Video Y (px)")).toHaveValue(41);
    await expect(args.onChange).toHaveBeenLastCalledWith({ x: 1410, y: 41, width: 460, height: 320 });
  }
};

/** A value that would leave the canvas is corrected in place and never applied. */
export const OffCanvasValueRejected: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const width = canvas.getByLabelText("Video width (px)");
    await userEvent.clear(width);
    await userEvent.type(width, "1800{Enter}");
    await expect(width).toHaveAccessibleDescription("Enter a whole number from 240 to 1651.");
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

/** Controls lock while the page saves. */
export const SavingLocked: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Move video box" })).toBeDisabled();
    await expect(canvas.getByLabelText("Video height (px)")).toBeDisabled();
  }
};
