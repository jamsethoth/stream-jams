import type { AssetRecord } from "@stream-jams/core";
import {
  createManagementHttpClient,
  type HttpManagementClientOptions,
  type ManagementHttpClient
} from "../management-http-client.js";

export type { AssetRecord } from "@stream-jams/core";

export interface AssetApi {
  listAssets(): Promise<readonly AssetRecord[]>;
  importAsset(file: File): Promise<AssetRecord>;
  getAssetFile(assetId: string): Promise<Blob>;
  replaceAsset(assetId: string, file: File, confirmImpact: boolean): Promise<AssetRecord>;
}

export interface HttpAssetApiOptions extends HttpManagementClientOptions {
  readonly client?: ManagementHttpClient;
}

export function createHttpAssetApi(options: HttpAssetApiOptions = {}): AssetApi {
  const client = options.client ?? createManagementHttpClient(options);

  return {
    async listAssets() {
      const response = await client.request("/assets", {
        fallbackMessage: "Unable to load assets."
      });

      return (await response.json()) as readonly AssetRecord[];
    },

    async importAsset(file: File) {
      const body = await file.arrayBuffer();
      const response = await client.request("/assets/import", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream"
        },
        body,
        fallbackMessage: "Unable to import asset."
      });

      return (await response.json()) as AssetRecord;
    },

    async getAssetFile(assetId) {
      const path = `/assets/${encodeURIComponent(assetId)}/file`;
      const response = await client.request(path, {
        fallbackMessage: "Unable to load asset preview."
      });

      return response.blob();
    },

    async replaceAsset(assetId, file, confirmImpact) {
      const path = `/assets/${encodeURIComponent(assetId)}/replace`;
      const body = await file.arrayBuffer();
      const response = await client.request(path, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-stream-jams-confirm-impact": String(confirmImpact),
          "x-stream-jams-file-name": file.name,
          "x-stream-jams-mime-type": file.type || "application/octet-stream"
        },
        body,
        fallbackMessage: "Unable to replace asset."
      });

      return (await response.json()) as AssetRecord;
    }
  };
}
