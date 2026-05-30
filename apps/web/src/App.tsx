import "./App.css";
import type { AssetApi } from "./management/assets/AssetManager.js";
import type { AlertConfigurationApi } from "./management/modules/alerts/AlertConfigurationPanel.js";
import { AssetManager } from "./management/assets/AssetManager.js";
import { createHttpAssetApi } from "./management/assets/asset-api.js";
import { AlertConfigurationPanel } from "./management/modules/alerts/AlertConfigurationPanel.js";
import { createHttpAlertConfigurationApi } from "./management/modules/alerts/alert-api.js";

export interface AppProps {
  readonly assetApi?: AssetApi;
  readonly alertApi?: AlertConfigurationApi;
}

export function App({ assetApi = createHttpAssetApi(), alertApi = createHttpAlertConfigurationApi() }: AppProps) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Stream Jams</h1>
          <p>Local-first stream management shell.</p>
        </div>
      </header>
      <div className="management-stack">
        <AlertConfigurationPanel alertApi={alertApi} />
        <AssetManager assetApi={assetApi} />
      </div>
    </main>
  );
}
