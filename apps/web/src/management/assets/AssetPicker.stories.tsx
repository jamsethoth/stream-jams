import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { AssetPicker } from "./AssetPicker.js";

const meta = { tags: ["stream-local-media", "mantine-assets"], title: "Management/Assets/Picker", component: AssetPicker, render: (args, context) => <AssetPicker key={context.id} {...args} /> } satisfies Meta<typeof AssetPicker>;
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

export const AudioSelectionWithNativePlayback: Story = {
  tags: ["mantine-assets-keyboard"],
  args: { ...baseArgs, compatibleMediaTypes: ["audio"] },
  play: async () => {
    const body = within(document.body);
    const tab = await body.findByRole("tab", { name: "Existing" });
    await userEvent.click(tab);
    await waitFor(() => expect(tab).toHaveFocus());
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(body.getByRole("tab", { name: "Upload new" })).toHaveAttribute("aria-selected", "true"));
    await userEvent.keyboard("{Home}");
    await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
    const audio = await body.findByLabelText("Short chime preview");
    await expect(audio).toHaveAttribute("controls");
    await expect(audio.closest("button")).toBeNull();
  }
};

export const UploadPending: Story = {
  args: { ...baseArgs, assetApi: createStoryAssetApi({ importAsset: () => new Promise(() => {}) }) },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("tab", { name: "Upload new" }));
    await userEvent.upload(body.getByLabelText("Asset file"), new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "fixture.png", { type: "image/png" }));
    await userEvent.click(body.getByRole("button", { name: "Upload and use" }));
    await expect(body.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(body.getByRole("tab", { name: "Existing" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(body.getByRole("dialog", { name: "Choose asset" })).toBeVisible();
  }
};

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
