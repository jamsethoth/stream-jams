import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, within } from "storybook/test";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import { createTestMediaPreviewApi } from "../../test-support/media-preview-fixture.js";
import { AssetPreview } from "./AssetPreview.js";

const meta = { title: "Management/Assets/Stream preview", component: AssetPreview, tags: ["stream-local-media"], args: { assetApi: createTestMediaPreviewApi(), item: storyAssetLibraryItems[0]! } } satisfies Meta<typeof AssetPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = { play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole("img")).toBeVisible(); } };
export const SilentVideo: Story = {
  args: { item: { ...storyAssetLibraryItems[0]!, id: "video", displayName: "Tiny video", mediaType: "video", mimeType: "video/mp4" } },
  play: async ({ canvasElement }) => { const element = await within(canvasElement).findByLabelText("Tiny video preview"); await expect((element as HTMLVideoElement).muted).toBe(true); await expect((element as HTMLVideoElement).autoplay).toBe(false); }
};
export const ExplicitAudioControls: Story = {
  args: { item: { ...storyAssetLibraryItems[0]!, id: "audio", displayName: "Tiny sound", mediaType: "audio", mimeType: "audio/wav" } },
  play: async ({ canvasElement }) => { const element = await within(canvasElement).findByLabelText("Tiny sound preview"); await expect(element).toHaveAttribute("controls"); await expect((element as HTMLAudioElement).autoplay).toBe(false); }
};
export const Loading: Story = { args: { assetApi: createTestMediaPreviewApi(() => new Promise(() => {})) } };
export const Unavailable: Story = {
  args: { assetApi: createTestMediaPreviewApi(async () => { throw new Error("Session expired"); }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Preview unavailable")).toBeVisible(); }
};
export const NativeReadFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.error(await canvas.findByRole("img"));
    await expect(await canvas.findByText("Preview unavailable")).toBeVisible();
    await expect(canvas.getByText("Preview unavailable")).toHaveAttribute("title", expect.stringContaining("Retry by reselecting the asset."));
    await expect(canvas.queryByRole("img")).toBeNull();
  }
};
