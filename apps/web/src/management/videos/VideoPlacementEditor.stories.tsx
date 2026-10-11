import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDefaultVideosLayout } from "@stream-jams/core";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { VideoPlacementEditor } from "./VideoPlacementEditor.js";

const meta = {
  title: "Management/Videos Placement",
  component: VideoPlacementEditor,
  tags: ["video-content"],
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
    await expect(canvas.getByLabelText("Desktop Video X (px)")).toHaveValue(269);
    await expect(canvas.getByLabelText("Video content width (px)")).toHaveValue(1382);
    await expect(canvas.getByText("Example video title")).toBeInTheDocument();
  }
};

/** An operator moves a small picture-in-picture box with the keyboard. */
export const PictureInPicture: Story = {
  args: { value: { schemaVersion: 2, content: { width: 460, height: 320 }, desktopPlacement: { x: 1420, y: 40, scale: 1 } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole("button", { name: "Move video box" }).focus();
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}{ArrowDown}");
    await expect(canvas.getByLabelText("Desktop Video X (px)")).toHaveValue(1410);
    await expect(canvas.getByLabelText("Desktop Video Y (px)")).toHaveValue(41);
    await expect(args.onChange).toHaveBeenLastCalledWith({ schemaVersion: 2, content: { width: 460, height: 320 }, desktopPlacement: { x: 1410, y: 41, scale: 1 } });
  }
};

/** A value that would leave the canvas is corrected in place and never applied. */
export const OffCanvasValueRejected: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const width = canvas.getByLabelText("Video content width (px)");
    await userEvent.clear(width);
    await userEvent.type(width, "1921{Enter}");
    await expect(width).toHaveAccessibleDescription("Enter a whole number from 240 to 1920.");
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

/** Controls lock while the page saves. */
export const SavingLocked: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Move video box" })).toBeDisabled();
    await expect(canvas.getByLabelText("Video content height (px)")).toBeDisabled();
  }
};
