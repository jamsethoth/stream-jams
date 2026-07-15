import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { AssetPicker } from "./AssetPicker.js";

const meta = { title: "Management/Assets/Picker", component: AssetPicker } satisfies Meta<typeof AssetPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  assetApi: createStoryAssetApi(),
  compatibleMediaTypes: ["image", "gif"] as const,
  managementApi: createStoryManagementApi(),
  onCancel: () => undefined,
  onSelect: () => undefined,
  open: true
};

export const ExistingCompatibleAssets: Story = { args: baseArgs };

export const UploadNewAsset: Story = {
  args: baseArgs,
  play: async () => {
    const canvas = within(document.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Upload new" }));
    await expect(canvas.getByText(/PNG, JPG, or WebP/)).toBeVisible();
  }
};

export const InvalidUpload: Story = {
  args: baseArgs,
  play: async () => {
    const canvas = within(document.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Upload new" }));
    await userEvent.upload(canvas.getByLabelText("Asset file"), new File(["bad"], "bad.png", { type: "image/png" }));
    await userEvent.click(canvas.getByRole("button", { name: "Upload and use" }));
    await expect(await canvas.findByText("This file cannot be uploaded")).toBeVisible();
  }
};
