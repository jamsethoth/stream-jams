import type { AssetRecord } from "./management/assets/asset-api.js";
import type { AlertCollection, AlertRule } from "./management/modules/alerts/alert-api.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import type { AssetApi } from "./management/assets/AssetManager.js";

describe("App", () => {
  it("renders the management shell name", async () => {
    render(<App alertApi={createAlertApi()} assetApi={createAssetApi()} />);

    expect(
      screen.getByRole("heading", {
        name: "Stream Jams"
      })
    ).toBeInTheDocument();
    expect(await screen.findByText("No alert collections configured.")).toBeInTheDocument();
    expect(screen.getByText("No assets imported yet.")).toBeInTheDocument();
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

function createAlertApi() {
  return {
    async listCollections(): Promise<readonly AlertCollection[]> {
      return [];
    },
    async listRules(): Promise<readonly AlertRule[]> {
      return [];
    },
    async setCollectionEnabled(): Promise<AlertCollection> {
      throw new Error("not called");
    },
    async setRuleEnabled(): Promise<AlertRule> {
      throw new Error("not called");
    }
  };
}
