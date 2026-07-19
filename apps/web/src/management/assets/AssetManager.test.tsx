import type { AssetChangeImpact, AssetLibraryItem, AssetMetadataUpdateInput } from "@stream-jams/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetManager, type AssetLibraryManagementApi } from "./AssetManager.js";
import type { AssetApi, AssetRecord } from "./asset-api.js";

describe("AssetManager", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows searchable assets, preview details, tags, and contextual usage links", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);

    await screen.findByRole("button", { name: "Follower burst" });
    expect(screen.getByText("seasonal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New follower/ })).toHaveAttribute(
      "href",
      "/manage/modules/alerts/editor/alert-follow?set=set-default&event=follow&profile=landscape"
    );

    await userEvent.type(screen.getByRole("searchbox", { name: "Search assets" }), "chime");
    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raid chime" })).toBeInTheDocument();
  });

  it("shows only retry when the initial asset-library load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const listAssetLibraryItems = vi.fn()
      .mockRejectedValueOnce(new Error("Local service unavailable"))
      .mockResolvedValue([imageItem, audioItem]);
    const fixture = createFixture({ listAssetLibraryItems });

    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);

    expect(await screen.findByText("Asset library could not be loaded")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry loading assets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add asset" })).not.toBeInTheDocument();
    expect(screen.queryByText("No assets imported yet.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading assets" }));
    expect(await screen.findByRole("button", { name: "Follower burst" })).toBeInTheDocument();
    expect(listAssetLibraryItems).toHaveBeenCalledTimes(2);
  });

  it("combines unused and multi-tag filters with AND behavior", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    await userEvent.selectOptions(screen.getByLabelText("Usage"), "unused");
    await userEvent.click(screen.getByRole("checkbox", { name: "seasonal" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "audio" }));

    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raid chime" })).toBeInTheDocument();
  });

  it("saves global display name and normalized tags", async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    const name = screen.getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Follower burst"));
    await user.clear(name);
    await user.type(name, "Winter follower");
    const tags = screen.getByLabelText("Tags");
    await user.clear(tags);
    await user.type(tags, " Winter, FOLLOW, winter ");
    await user.click(screen.getByRole("button", { name: "Save asset details" }));

    await waitFor(() => expect(fixture.metadataUpdates).toEqual([{ displayName: "Winter follower", tags: ["winter", "follow"] }]));
  });

  it("requires an explicit choice before discarding metadata to select another asset", async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    const name = screen.getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Follower burst"));
    await user.clear(name);
    await user.type(name, "Unsaved follower");
    await user.click(screen.getByRole("button", { name: "Raid chime" }));

    const dialog = screen.getByRole("dialog", { name: "Switch assets with unsaved changes?" });
    expect(within(dialog).getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Discard" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Follower burst details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Unsaved follower");

    await user.click(screen.getByRole("button", { name: "Raid chime" }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch assets with unsaved changes?" })).getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("region", { name: "Raid chime details" })).toBeInTheDocument();
    expect(fixture.metadataUpdates).toEqual([]);
  });

  it("saves dirty metadata before selecting another asset", async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    const name = screen.getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Follower burst"));
    await user.clear(name);
    await user.type(name, "Saved follower");
    await user.click(screen.getByRole("button", { name: "Raid chime" }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch assets with unsaved changes?" })).getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(fixture.metadataUpdates).toEqual([{ displayName: "Saved follower", tags: ["seasonal", "follow"] }]));
    expect(await screen.findByRole("region", { name: "Raid chime details" })).toBeInTheDocument();
  });

  it("requires impact review before stable-ID replacement", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    await userEvent.click(screen.getByRole("button", { name: "Replace file" }));
    const file = new File([pngBytes], "replacement.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Replacement file"), file);
    await userEvent.click(screen.getByRole("button", { name: "Review replacement" }));

    const dialog = await screen.findByRole("dialog", { name: "Replace Follower burst?" });
    expect(within(dialog).getByText("1 alert usage will update everywhere.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Replace everywhere" }));
    await waitFor(() => expect(fixture.replacements).toEqual([{ assetId: "asset-image", file, confirmed: true }]));
  });

  it("confirms manual deletion for unused assets and blocks in-use deletion", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });
    expect(screen.getByRole("button", { name: "Delete asset" })).toBeDisabled();

    await userEvent.click(screen.getByRole("row", { name: /Raid chime/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Raid chime?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete asset" }));

    await waitFor(() => expect(fixture.deleted).toEqual(["asset-audio"]));
  });
});

function createFixture(overrides: Partial<AssetLibraryManagementApi> = {}) {
  let items: readonly AssetLibraryItem[] = [imageItem, audioItem];
  const metadataUpdates: AssetMetadataUpdateInput[] = [];
  const replacements: Array<{ assetId: string; file: File; confirmed: boolean }> = [];
  const deleted: string[] = [];
  const managementApi: AssetLibraryManagementApi = {
    async listAssetLibraryItems() { return items; },
    async updateAssetMetadata(assetId, input) {
      metadataUpdates.push(input);
      const current = items.find((item) => item.id === assetId)!;
      const updated = { ...current, displayName: input.displayName, tags: input.tags, updatedAt: "2026-07-15T09:00:00.000Z" };
      items = items.map((item) => item.id === assetId ? updated : item);
      return updated;
    },
    async getAssetChangeImpact(assetId) {
      return impactFor(items.find((item) => item.id === assetId)!);
    },
    async deleteAsset(assetId) {
      deleted.push(assetId);
      items = items.filter((item) => item.id !== assetId);
    },
    ...overrides
  };
  const assetApi: AssetApi = {
    async listAssets() { return []; },
    async importAsset() { throw new Error("not called"); },
    async getAssetFile(assetId) {
      return new Blob([assetId === "asset-image" ? pngBytes : new Uint8Array([1, 2, 3])], {
        type: assetId === "asset-image" ? "image/png" : "audio/wav"
      });
    },
    async replaceAsset(assetId, file, confirmed) {
      replacements.push({ assetId, file, confirmed });
      return recordFor(items.find((item) => item.id === assetId)!);
    }
  };
  return { assetApi, managementApi, metadataUpdates, replacements, deleted };
}

function impactFor(item: AssetLibraryItem): AssetChangeImpact {
  return {
    assetId: item.id,
    usage: item.usage,
    canDelete: item.usage.totalUsageCount === 0,
    requiresConfirmation: item.usage.totalUsageCount > 0,
    warnings: item.usage.totalUsageCount > 0 ? ["1 alert usage will update everywhere."] : []
  };
}

function recordFor(item: AssetLibraryItem): AssetRecord {
  return { id: item.id, originalFileName: item.originalFileName, mediaType: item.mediaType, mimeType: item.mimeType, sizeBytes: item.sizeBytes, checksum: "sha256:test", storagePath: `${item.mediaType}/${item.id}` };
}

const imageItem: AssetLibraryItem = {
  id: "asset-image", displayName: "Follower burst", originalFileName: "follow.png", mediaType: "image", mimeType: "image/png", sizeBytes: 1024,
  width: null, height: null, durationMs: null, health: "available", tags: ["seasonal", "follow"], createdAt: "2026-07-15T08:00:00.000Z", updatedAt: "2026-07-15T08:00:00.000Z",
  usage: { assetId: "asset-image", totalUsageCount: 1, usages: [{ setId: "set-default", setName: "Default", eventType: "follow", alertId: "alert-follow", alertName: "New follower", targetProfileIds: ["landscape", "vertical"] }] }
};

const audioItem: AssetLibraryItem = {
  id: "asset-audio", displayName: "Raid chime", originalFileName: "raid.wav", mediaType: "audio", mimeType: "audio/wav", sizeBytes: 2048,
  width: null, height: null, durationMs: null, health: "available", tags: ["seasonal", "audio"], createdAt: "2026-07-15T08:00:00.000Z", updatedAt: "2026-07-15T08:00:00.000Z",
  usage: { assetId: "asset-audio", totalUsageCount: 0, usages: [] }
};

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
