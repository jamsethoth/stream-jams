import "./App.css";
import type { AssetApi } from "./management/assets/AssetManager.js";
import { createHttpAssetApi } from "./management/assets/asset-api.js";
import { ManagementApp } from "./management/ManagementApp.js";
import type { ManagementApi } from "./management/management-api.js";
import { createClientErrorReporter, type ClientErrorReporter } from "./management/diagnostics/client-error-reporter.js";
import { ManagementErrorBoundary } from "./management/foundation/ManagementErrorBoundary.js";

export interface AppProps {
  readonly assetApi?: AssetApi;
  readonly managementApi?: ManagementApi | undefined;
  readonly errorReporter?: ClientErrorReporter | undefined;
}

export function App({ assetApi = createHttpAssetApi(), managementApi, errorReporter = createClientErrorReporter() }: AppProps) {
  return (
    <ManagementErrorBoundary reporter={errorReporter} resetKey={window.location.pathname}>
      <ManagementApp assetApi={assetApi} managementApi={managementApi} />
    </ManagementErrorBoundary>
  );
}
