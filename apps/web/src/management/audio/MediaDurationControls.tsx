import type { AssetLibraryItem, PlaybackDurationMode } from "@stream-jams/core";

export function MediaDurationControls({ mode, durationMs, assets, assetIds, fallbackDurationMs, onChange, onRepair }: {
  readonly mode: PlaybackDurationMode;
  readonly durationMs: number;
  readonly assets: readonly AssetLibraryItem[];
  readonly assetIds: readonly string[];
  readonly fallbackDurationMs: number;
  readonly onChange: (value: { readonly mode: PlaybackDurationMode; readonly durationMs: number }) => void;
  readonly onRepair?: ((assetId: string) => Promise<void>) | undefined;
}) {
  const candidates = [...new Set(assetIds)].map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is AssetLibraryItem => asset !== undefined);
  const timed = candidates.filter((asset) => (asset.mediaType === "audio" || asset.mediaType === "video") && asset.durationMs !== null);
  const longest = timed.reduce<AssetLibraryItem | null>((current, asset) => current === null || asset.durationMs! > current.durationMs! ? asset : current, null);
  const missing = candidates.filter((asset) => (asset.mediaType === "audio" || asset.mediaType === "video") && asset.durationMs === null);
  const resolvedDurationMs = Math.min(longest?.durationMs ?? fallbackDurationMs, 120_000);
  return <fieldset>
    <legend>Duration</legend>
    <label><input checked={mode === "media"} onChange={() => onChange({ mode: "media", durationMs: resolvedDurationMs })} type="radio" />Match longest media</label>
    <label><input checked={mode === "custom"} onChange={() => onChange({ mode: "custom", durationMs })} type="radio" />Custom</label>
    <label>Duration (milliseconds)<input aria-label="Duration (milliseconds)" disabled={mode === "media"} max={120_000} min={100} onChange={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next)) onChange({ mode: "custom", durationMs: Math.round(next) });
    }} type="number" value={mode === "media" ? resolvedDurationMs : durationMs} /></label>
    {mode === "media" ? <p>{longest === null
      ? `No readable audio or video duration is available. Playback uses the ${fallbackDurationMs / 1000}-second fallback.`
      : `Matched to ${longest.displayName} (${formatDuration(resolvedDurationMs)}).`}</p> : null}
    {longest?.durationMs !== null && longest !== null && longest.durationMs > 120_000 ? <p role="alert">This media is longer than 2 minutes, so playback is capped at 2 minutes.</p> : null}
    {missing.map((asset) => <div key={asset.id}><span>{asset.displayName} has no readable duration.</span>{onRepair === undefined ? null : <button className="button button--secondary button--compact" onClick={() => void onRepair(asset.id)} type="button">Retry duration</button>}</div>)}
  </fieldset>;
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs / 100) / 10}s`;
}
