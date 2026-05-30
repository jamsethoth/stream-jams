import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { AssetApi, AssetRecord } from "./asset-api.js";
export type { AssetApi } from "./asset-api.js";

export interface AssetManagerProps {
  readonly assetApi: AssetApi;
}

type LoadState = "loading" | "ready" | "importing";

export function AssetManager({ assetApi }: AssetManagerProps) {
  const [assets, setAssets] = useState<readonly AssetRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setLoadState("loading");
      try {
        const loadedAssets = await assetApi.listAssets();
        if (!cancelled) {
          setAssets(loadedAssets);
          setDiagnostic(null);
          setLoadState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnostic(readErrorMessage(error));
          setLoadState("ready");
        }
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [assetApi]);

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFile === null) {
      setDiagnostic("Choose a file to import.");
      return;
    }

    setLoadState("importing");
    try {
      await assetApi.importAsset(selectedFile);
      const loadedAssets = await assetApi.listAssets();
      setAssets(loadedAssets);
      setDiagnostic(`${selectedFile.name} imported.`);
    } catch (error) {
      setDiagnostic(readErrorMessage(error));
    } finally {
      setLoadState("ready");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.currentTarget.files?.[0] ?? null);
  }

  const importDisabled = loadState === "importing" || selectedFile === null;

  return (
    <section className="asset-panel" aria-labelledby="asset-panel-title">
      <div className="asset-panel__header">
        <div>
          <h2 id="asset-panel-title">Assets</h2>
          <p>{assets.length} stored</p>
        </div>
        <form className="asset-import" onSubmit={handleImport}>
          <label>
            <span>Asset file</span>
            <input type="file" onChange={handleFileChange} />
          </label>
          <button type="submit" disabled={importDisabled}>
            {loadState === "importing" ? "Importing..." : "Import selected"}
          </button>
        </form>
      </div>

      {diagnostic !== null ? <p className="asset-diagnostic">{diagnostic}</p> : null}

      {loadState === "loading" ? <p className="asset-empty">Loading assets...</p> : null}

      {loadState !== "loading" && assets.length === 0 ? (
        <p className="asset-empty">No assets imported yet.</p>
      ) : null}

      {assets.length > 0 ? (
        <div className="asset-table-wrap">
          <table className="asset-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>MIME</th>
                <th>Size</th>
                <th>Checksum</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.originalFileName}</td>
                  <td>{asset.mediaType}</td>
                  <td>{asset.mimeType}</td>
                  <td>{formatBytes(asset.sizeBytes)}</td>
                  <td>{asset.checksum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  return `${(sizeBytes / 1024).toFixed(1)} KiB`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Asset operation failed.";
}
