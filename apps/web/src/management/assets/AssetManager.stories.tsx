import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { AssetManager } from "./AssetManager.js";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";

const meta = { tags: ["stream-local-media", "mantine-assets"], title: "Management/Assets/Library", component: AssetManager, render: (args, context) => <AssetManager key={context.id} {...args} /> } satisfies Meta<typeof AssetManager>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedWithDetail: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() }
};

export const EmptyLibrary: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({ listAssetLibraryItems: async () => [] }) }
};

export const LoadingLibrary: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({ listAssetLibraryItems: () => new Promise(() => {}) }) }
};

export const DirtySelectionDecision: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Follower burst" });
    await userEvent.type(canvas.getByLabelText("Display name"), " draft");
    const trigger = canvas.getByRole("button", { name: "Short chime" });
    await userEvent.click(trigger);
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Switch assets with unsaved changes?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByLabelText("Display name")).toHaveValue("Follower burst draft");
  }
};

export const DeletionPending: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({ deleteAsset: () => new Promise(() => {}) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Short chime" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete asset" }));
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Delete Short chime?" }));
    await userEvent.dblClick(dialog.getByRole("button", { name: "Delete asset" }));
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(body.getByRole("dialog", { name: "Delete Short chime?" })).toBeVisible();
  }
};

let retryDeletionAttempts = 0;
export const DeletionFailureRetry: Story = {
  beforeEach: () => {
    retryDeletionAttempts = 0;
    const reportError = console.error; console.error = fn();
    return () => { console.error = reportError; };
  },
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({ deleteAsset: async () => { if (retryDeletionAttempts++ === 0) throw new Error("Asset usage changed"); }, listAssetLibraryItems: async () => storyAssetLibraryItems }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Short chime" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete asset" }));
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Delete Short chime?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Delete asset" }));
    await expect(await dialog.findByText("Asset was not deleted")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete asset" })).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: "Delete asset" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByText("Unused asset deleted.")).toBeVisible();
  }
};

let staleRefreshLoads = 0;
export const RetainedDetailsAfterRefreshFailure: Story = {
  beforeEach: () => {
    staleRefreshLoads = 0;
    const reportError = console.error; console.error = fn();
    return () => { console.error = reportError; };
  },
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi({
    listAssetLibraryItems: async () => {
      if (++staleRefreshLoads === 2) throw new Error("Local service refresh unavailable");
      return staleRefreshLoads === 1 ? storyAssetLibraryItems : storyAssetLibraryItems.filter(item => item.mediaType === "image");
    }
  }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Short chime" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete asset" }));
    const body = within(document.body);
    const dialog = within(await body.findByRole("dialog", { name: "Delete Short chime?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Delete asset" }));
    await expect(await canvas.findByText("Showing last loaded asset details. Refresh before making another change.")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Short chime" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Replace file" })).toBeDisabled();
  }
};

export const InitialLoadFailure: Story = {
  beforeEach: () => {
    const reportError = console.error;
    console.error = fn();
    return () => { console.error = reportError; };
  },
  args: {
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi({
      listAssetLibraryItems: async () => { throw new Error("The local service is unavailable."); }
    })
  }
};

export const FilteredToUnusedAudio: Story = {
  args: { assetApi: createStoryAssetApi(), managementApi: createStoryManagementApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Follower burst" });
    await userEvent.click(canvas.getByText("More filters", { selector: "summary" }));
    await userEvent.selectOptions(canvas.getByLabelText("Usage"), "unused");
    await userEvent.selectOptions(canvas.getByLabelText("Type"), "audio");
    await expect(canvas.getByLabelText("1 active secondary filters")).toBeVisible();
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
