import "./App.css";
import type { AssetApi } from "./management/assets/AssetManager.js";
import type { AlertConfigurationApi } from "./management/modules/alerts/AlertConfigurationPanel.js";
import { createHttpAssetApi } from "./management/assets/asset-api.js";
import { ManagementApp } from "./management/ManagementApp.js";
import type { ManagementApi } from "./management/management-api.js";
import { createHttpAlertConfigurationApi } from "./management/modules/alerts/alert-api.js";

export interface AppProps {
  readonly assetApi?: AssetApi;
  readonly alertApi?: AlertConfigurationApi;
  readonly managementApi?: ManagementApi | undefined;
}

export function App({ assetApi = createHttpAssetApi(), alertApi = createHttpAlertConfigurationApi(), managementApi }: AppProps) {
  return <ManagementApp alertApi={alertApi} assetApi={assetApi} managementApi={managementApi} />;
}
