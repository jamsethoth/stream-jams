import "./App.css";
import type { AssetApi } from "./management/assets/AssetManager.js";
import { createHttpAssetApi } from "./management/assets/asset-api.js";
import { ManagementApp } from "./management/ManagementApp.js";
import type { ManagementApi } from "./management/management-api.js";

export interface AppProps {
  readonly assetApi?: AssetApi;
  readonly managementApi?: ManagementApi | undefined;
}

export function App({ assetApi = createHttpAssetApi(), managementApi }: AppProps) {
  return <ManagementApp assetApi={assetApi} managementApi={managementApi} />;
}
