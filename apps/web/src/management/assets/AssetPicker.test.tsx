import type { AssetLibraryItem } from "@stream-jams/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetPicker } from "./AssetPicker.js";
import type { AssetApi } from "./asset-api.js";
import type { AssetLibraryManagementApi } from "./AssetManager.js";

describe("AssetPicker", () => {
  afterEach(cleanup);

  it("shows compatible existing assets and selects by stable asset ID", async () => {
    const onSelect = vi.fn();
    render(<AssetPicker {...fixture()} compatibleMediaTypes={["image", "gif"]} onCancel={vi.fn()} onSelect={onSelect} open />);

    expect(await screen.findByRole("option", { name: /Follower burst/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Raid chime/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Follower burst/ }));
    await userEvent.click(screen.getByRole("button", { name: "Use selected asset" }));
    expect(onSelect).toHaveBeenCalledWith("asset-image");
  });

  it("keeps invalid uploads in context with allowed types, limits, and a next step", async () => {
    const values = fixture();
    const user = userEvent.setup({ applyAccept: false });
    render(<AssetPicker {...values} compatibleMediaTypes={["image"]} onCancel={vi.fn()} onSelect={vi.fn()} open />);
    await user.click(screen.getByRole("tab", { name: "Upload new" }));
    await user.upload(screen.getByLabelText("Asset file"), new File(["text"], "notes.txt", { type: "text/plain" }));
    await user.click(screen.getByRole("button", { name: "Upload and use" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/PNG, JPG, or WebP up to 10 MiB/)).toBeInTheDocument();
    expect(alert).toHaveTextContent("Next step: Choose a supported file");
    expect(values.assetApi.importAsset).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Choose asset" })).toBeInTheDocument();
  });

  it("registers a valid upload with display name and normalized tags before selecting it", async () => {
    const values = fixture();
    const onSelect = vi.fn();
    render(<AssetPicker {...values} compatibleMediaTypes={["image"]} onCancel={vi.fn()} onSelect={onSelect} open />);
    await userEvent.click(screen.getByRole("tab", { name: "Upload new" }));
    const file = new File([pngBytes], "new.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Asset file"), file);
    await userEvent.type(screen.getByLabelText("Display name"), "New follower art");
    await userEvent.type(screen.getByLabelText("Tags"), " Seasonal, FOLLOW, seasonal ");
    await userEvent.click(screen.getByRole("button", { name: "Upload and use" }));

    await waitFor(() => expect(values.managementApi.updateAssetMetadata).toHaveBeenCalledWith("asset-new", {
      displayName: "New follower art",
      tags: ["seasonal", "follow"]
    }));
    expect(onSelect).toHaveBeenCalledWith("asset-new");
  });
});

function fixture() {
  const managementApi: AssetLibraryManagementApi = {
    listAssetLibraryItems: vi.fn(async () => [imageItem, audioItem]),
    updateAssetMetadata: vi.fn(async (_assetId, input) => ({ ...imageItem, id: "asset-new", displayName: input.displayName, tags: input.tags })),
    getAssetChangeImpact: vi.fn(async () => ({ assetId: "asset-image", usage: imageItem.usage, canDelete: false, requiresConfirmation: true, warnings: [] })),
    deleteAsset: vi.fn(async () => undefined)
  };
  const assetApi: AssetApi = {
    listAssets: vi.fn(async () => []),
    importAsset: vi.fn(async () => ({ id: "asset-new", originalFileName: "new.png", mediaType: "image" as const, mimeType: "image/png", sizeBytes: pngBytes.byteLength, checksum: "sha256:new", storagePath: "image/asset-new.png" })),
    getAssetFile: vi.fn(async () => new Blob([pngBytes], { type: "image/png" })),
    replaceAsset: vi.fn(async () => { throw new Error("not called"); })
  };
  return { assetApi, managementApi };
}

const imageItem: AssetLibraryItem = {
  id: "asset-image", displayName: "Follower burst", originalFileName: "follow.png", mediaType: "image", mimeType: "image/png", sizeBytes: 1024,
  width: null, height: null, durationMs: null, health: "available", tags: ["seasonal"], createdAt: "2026-07-15T08:00:00.000Z", updatedAt: "2026-07-15T08:00:00.000Z",
  usage: { assetId: "asset-image", totalUsageCount: 1, usages: [] }
};
const audioItem: AssetLibraryItem = { ...imageItem, id: "asset-audio", displayName: "Raid chime", originalFileName: "raid.wav", mediaType: "audio", mimeType: "audio/wav", tags: ["audio"], usage: { assetId: "asset-audio", totalUsageCount: 0, usages: [] } };
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
