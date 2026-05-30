import type { AssetRecord } from "./asset-api.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AssetManager, type AssetApi } from "./AssetManager.js";

describe("AssetManager", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders loaded asset metadata rows", async () => {
    render(<AssetManager assetApi={createAssetApi({ lists: [[createAsset()]] })} />);

    expect(await screen.findByRole("cell", { name: "Alert.PNG" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "image/png" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1.0 KiB" })).toBeInTheDocument();
  });

  it("shows an empty state when no assets have been imported", async () => {
    render(<AssetManager assetApi={createAssetApi({ lists: [[]] })} />);

    expect(await screen.findByText("No assets imported yet.")).toBeInTheDocument();
  });

  it("imports a selected file and refreshes the list", async () => {
    const user = userEvent.setup();
    const asset = createAsset();
    const api = createAssetApi({
      lists: [[], [asset]],
      imported: asset
    });
    render(<AssetManager assetApi={api} />);
    const file = new File([new Uint8Array([1, 2, 3])], "Alert.PNG", { type: "image/png" });

    await user.upload(await screen.findByLabelText("Asset file"), file);
    await user.click(screen.getByRole("button", { name: "Import selected" }));

    await waitFor(() => expect(api.importedFiles).toEqual([file]));
    expect(await screen.findByRole("cell", { name: "Alert.PNG" })).toBeInTheDocument();
    expect(api.listCount).toBe(2);
  });

  it("shows import diagnostics without clearing the existing list", async () => {
    const user = userEvent.setup();
    const api = createAssetApi({
      lists: [[createAsset()]],
      importError: new Error("File extension does not match media type")
    });
    render(<AssetManager assetApi={api} />);
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/jpeg" });

    await user.upload(await screen.findByLabelText("Asset file"), file);
    await user.click(screen.getByRole("button", { name: "Import selected" }));

    expect(await screen.findByText("File extension does not match media type")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Alert.PNG" })).toBeInTheDocument();
  });
});

function createAsset(): AssetRecord {
  return {
    id: "asset_1",
    originalFileName: "Alert.PNG",
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: 1024,
    checksum: "sha256:test",
    storagePath: "image/asset_1.png"
  };
}

function createAssetApi(options: {
  readonly lists: readonly (readonly AssetRecord[])[];
  readonly imported?: AssetRecord;
  readonly importError?: Error;
}): AssetApi & { readonly importedFiles: File[]; readonly listCount: number } {
  let listIndex = 0;
  const importedFiles: File[] = [];
  return {
    importedFiles,
    get listCount() {
      return listIndex;
    },
    async listAssets() {
      const list = options.lists[Math.min(listIndex, options.lists.length - 1)] ?? [];
      listIndex += 1;
      return list;
    },
    async importAsset(file: File) {
      importedFiles.push(file);
      if (options.importError !== undefined) {
        throw options.importError;
      }

      if (options.imported === undefined) {
        throw new Error("Missing imported asset fixture");
      }

      return options.imported;
    }
  };
}
