import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { AssetManager } from "./AssetManager.js";

const meta = { title: "Management/Assets/Library", component: AssetManager } satisfies Meta<typeof AssetManager>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedWithDetail: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() }
};

export const EmptyLibrary: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({ listAssetLibraryItems: async () => [] }) }
};

export const FilteredToUnusedAudio: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Follower burst" });
    await userEvent.selectOptions(canvas.getByLabelText("Usage"), "unused");
    await userEvent.selectOptions(canvas.getByLabelText("Type"), "audio");
    await expect(canvas.getByRole("button", { name: "Short chime" })).toBeVisible();
  }
};

export const UploadFailureInContext: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Follower burst" });
    await userEvent.click(canvas.getByRole("button", { name: "Add asset" }));
    const dialog = within(document.body);
    await userEvent.click(await dialog.findByRole("tab", { name: "Upload new" }));
    await userEvent.upload(dialog.getByLabelText("Asset file"), new File(["bad"], "bad.png", { type: "image/png" }));
    await userEvent.click(dialog.getByRole("button", { name: "Upload and use" }));
    await expect(await dialog.findByText("This file cannot be uploaded")).toBeVisible();
  }
};

export const InUseReplacementWarning: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Follower burst" });
    await userEvent.click(canvas.getByRole("button", { name: "Replace file" }));
    const dialog = within(document.body);
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "replacement.png", { type: "image/png" });
    await userEvent.upload(dialog.getByLabelText("Replacement file"), png);
    await userEvent.click(dialog.getByRole("button", { name: "Review replacement" }));
    await waitFor(() => expect(dialog.getByText("1 alert usage will update everywhere.")).toBeVisible());
  }
};
