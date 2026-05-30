import "./App.css";
import type { AssetApi } from "./management/assets/AssetManager.js";
import { AssetManager } from "./management/assets/AssetManager.js";
import { createHttpAssetApi } from "./management/assets/asset-api.js";

export interface AppProps {
  readonly assetApi?: AssetApi;
}

export function App({ assetApi = createHttpAssetApi() }: AppProps) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Stream Jams</h1>
          <p>Local-first stream management shell.</p>
        </div>
      </header>
      <AssetManager assetApi={assetApi} />
    </main>
  );
}
