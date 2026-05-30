import type { AssetRecord } from "./management/assets/asset-api.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type { AssetApi } from "./management/assets/AssetManager.js";

describe("App", () => {
  it("renders the management shell name", async () => {
    render(<App assetApi={createAssetApi()} />);

    expect(
      screen.getByRole("heading", {
        name: "Stream Jams"
      })
    ).toBeInTheDocument();
    expect(await screen.findByText("No assets imported yet.")).toBeInTheDocument();
  });
});

function createAssetApi(): AssetApi {
  return {
    async listAssets(): Promise<readonly AssetRecord[]> {
      return [];
    },
    async importAsset(): Promise<AssetRecord> {
      throw new Error("not called");
    }
  };
}
