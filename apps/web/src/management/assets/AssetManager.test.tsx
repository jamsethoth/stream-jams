import { renderManagement as render } from "../../test-support/render-management.js";
import { createTestMediaPreviewApi } from "../../test-support/media-preview-fixture.js";
import type { AssetChangeImpact, AssetLibraryItem, AssetMetadataUpdateInput } from "@stream-jams/core";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByText("More filters", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("searchbox", { name: "Search assets" })).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByText("seasonal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New follower/ })).toHaveAttribute(
      "href",
      "/manage/modules/alerts/editor/alert-follow?set=set-default&event=follow&profile=landscape"
    );

    await userEvent.type(screen.getByRole("searchbox", { name: "Search assets" }), "chime");
    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raid chime" })).toBeInTheDocument();
  });

  it("shows readable event labels while retaining the stored filter value", async () => {
    const rewardItem = {
      ...imageItem,
      usage: { ...imageItem.usage, usages: imageItem.usage.usages.map((usage) => ({ ...usage, eventType: "channel_point_redemption" as const })) }
    };
    const fixture = createFixture({ listAssetLibraryItems: vi.fn(async () => [rewardItem]) });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);

    expect(await screen.findByText(/Default \/ Channel point redemption \/ Landscape, Vertical/)).toBeVisible();
    await userEvent.click(screen.getByText("More filters", { selector: "summary" }));
    expect(screen.getByRole("option", { name: "Channel point redemption" })).toHaveValue("channel_point_redemption");
  });

  it("shows and filters Timer asset roles as saved module usages", async () => {
    const timerItem: AssetLibraryItem = {
      ...audioItem,
      moduleUsages: [
        { moduleId: "timers", ownerId: "timer-mitts", ownerName: "Wear oven mitts", variantId: null, usageRole: "start-audio" },
        { moduleId: "timers", ownerId: "timer-mitts", ownerName: "Wear oven mitts", variantId: null, usageRole: "end-audio" }
      ]
    };
    const fixture = createFixture({ listAssetLibraryItems: vi.fn(async () => [imageItem, timerItem]) });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);

    await screen.findByRole("button", { name: "Follower burst" });
    await userEvent.click(screen.getByText("More filters", { selector: "summary" }));
    await userEvent.selectOptions(screen.getByLabelText("Module"), "timers");
    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /Raid chime/ }));
    expect(screen.getAllByRole("link", { name: "Wear oven mitts" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Wear oven mitts" })[0]).toHaveAttribute("href", "/manage/modules/timers?ownerId=timer-mitts");
    expect(screen.getByText("Remove 2 saved uses before deleting this asset.")).toBeVisible();
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

  it("hides asset controls while the initial load and retry are pending", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const initial = deferred<readonly AssetLibraryItem[]>();
    const retry = deferred<readonly AssetLibraryItem[]>();
    const listAssetLibraryItems = vi.fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise);
    const fixture = createFixture({ listAssetLibraryItems });

    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);

    expect(await screen.findByText("Loading asset library...")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add asset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading assets" })).not.toBeInTheDocument();

    await act(async () => initial.reject(new Error("Local service unavailable")));
    await user.click(await screen.findByRole("button", { name: "Retry loading assets" }));

    expect(await screen.findByText("Loading asset library...")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add asset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search assets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading assets" })).not.toBeInTheDocument();

    await act(async () => retry.resolve([imageItem, audioItem]));
    expect(await screen.findByRole("button", { name: "Add asset" })).toBeVisible();
  });

  it("combines unused and multi-tag filters with AND behavior", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });

    await userEvent.click(screen.getByText("More filters", { selector: "summary" }));
    await userEvent.selectOptions(screen.getByLabelText("Usage"), "unused");
    await userEvent.click(screen.getByRole("checkbox", { name: "seasonal" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "audio" }));

    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raid chime" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 active secondary filters")).toBeInTheDocument();

    await userEvent.click(screen.getByText("More filters", { selector: "summary" }));
    expect(screen.getByText("More filters", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "Follower burst" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("More filters", { selector: "summary" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByLabelText(/active secondary filters/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follower burst" })).toBeInTheDocument();
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
    expect((await screen.findByText("Asset details saved.")).closest(".management-toast")).toHaveClass("management-toast--success");
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

  it("preserves unsaved metadata when replacement refreshes the same stable asset", async () => {
    const listAssetLibraryItems = vi.fn().mockResolvedValueOnce([imageItem, audioItem])
      .mockResolvedValue([{ ...imageItem, updatedAt: "2026-10-06T00:00:00.000Z" }, audioItem]);
    const fixture = createFixture({ listAssetLibraryItems });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });
    await userEvent.type(screen.getByLabelText("Display name"), " draft");
    await userEvent.click(screen.getByRole("button", { name: "Replace file" }));
    await userEvent.upload(screen.getByLabelText("Replacement file"), new File([pngBytes], "replacement.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    await userEvent.click(await screen.findByRole("button", { name: "Replace everywhere" }));
    await waitFor(() => expect(listAssetLibraryItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Display name")).toHaveValue("Follower burst draft");
    await userEvent.click(screen.getByRole("button", { name: "Raid chime" }));
    expect(screen.getByRole("dialog", { name: "Switch assets with unsaved changes?" })).toBeVisible();
  });

  it("removes a confirmed deletion locally while a failed refresh marks retained details stale until retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listAssetLibraryItems = vi.fn().mockResolvedValueOnce([imageItem, audioItem])
      .mockRejectedValueOnce(new Error("Refresh unavailable")).mockResolvedValue([imageItem]);
    const fixture = createFixture({ listAssetLibraryItems });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await userEvent.click(await screen.findByRole("button", { name: "Raid chime" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete asset" }));
    expect(await screen.findByText("Showing last loaded asset details. Refresh before making another change.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Raid chime" })).toBeNull();
    expect(screen.getByRole("button", { name: "Follower burst" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace file" })).toBeDisabled();
    act(() => screen.getByRole("button", { name: "Save asset details" }).closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fixture.metadataUpdates).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Retry loading assets" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Replace file" })).toBeEnabled());
    expect(listAssetLibraryItems).toHaveBeenCalledTimes(3);
  });

  it("confirms manual deletion for unused assets and blocks in-use deletion", async () => {
    const fixture = createFixture();
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });
    const blockedDelete = screen.getByRole("button", { name: "Delete asset" });
    expect(blockedDelete).toBeDisabled();
    expect(blockedDelete).toHaveAccessibleDescription("Remove 1 saved use before deleting this asset.");
    expect(screen.getByText("Remove 1 saved use before deleting this asset.")).toBeVisible();

    await userEvent.click(screen.getByRole("row", { name: /Raid chime/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Raid chime?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete asset" }));

    await waitFor(() => expect(fixture.deleted).toEqual(["asset-audio"]));
  });

  it("keeps deferred deletion locked, scopes its failure and permits explicit same-target retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = deferred<void>();
    const deleteAsset = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const fixture = createFixture({ deleteAsset, listAssetLibraryItems: async () => deleteAsset.mock.calls.length >= 2 ? [imageItem] : [imageItem, audioItem] });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await userEvent.click(await screen.findByRole("button", { name: "Raid chime" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Raid chime?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete asset" });
    act(() => { confirm.click(); confirm.click(); });
    expect(deleteAsset).toHaveBeenCalledExactlyOnceWith("asset-audio");
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    await act(async () => first.reject(Object.assign(new Error("Usage changed"), { referenceId: "fixture-delete-failure" })));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("fixture-delete-failure");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteAsset).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Asset library" })).toHaveFocus());
  });

  it("locks dirty selection save and preserves its intended destination until the save completes", async () => {
    const save = deferred<AssetLibraryItem>();
    const updateAssetMetadata = vi.fn(() => save.promise);
    const fixture = createFixture({ updateAssetMetadata });
    render(<AssetManager assetApi={fixture.assetApi} managementApi={fixture.managementApi} />);
    await screen.findByRole("button", { name: "Follower burst" });
    await userEvent.type(screen.getByLabelText("Display name"), " draft");
    await userEvent.click(screen.getByRole("button", { name: "Raid chime" }));
    const dialog = screen.getByRole("dialog", { name: "Switch assets with unsaved changes?" });
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Save and continue" }));
    expect(updateAssetMetadata).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "Discard" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    await act(async () => save.resolve({ ...imageItem, displayName: "Follower burst draft" }));
    expect(screen.getByRole("region", { name: "Raid chime details" })).toBeVisible();
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
    ...createTestMediaPreviewApi(),
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
    owners: [],
    canDelete: item.usage.totalUsageCount === 0,
    requiresConfirmation: item.usage.totalUsageCount > 0,
    warnings: item.usage.totalUsageCount > 0 ? ["1 alert usage will update everywhere."] : []
  };
}

function recordFor(item: AssetLibraryItem): AssetRecord {
  return { id: item.id, originalFileName: item.originalFileName, mediaType: item.mediaType, mimeType: item.mimeType, sizeBytes: item.sizeBytes, checksum: "sha256:test", storagePath: `${item.mediaType}/${item.id}`, durationMs: item.durationMs };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
