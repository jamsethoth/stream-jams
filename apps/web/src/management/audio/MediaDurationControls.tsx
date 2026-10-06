import { Button, Radio, TextInput } from "@mantine/core";
import type { AssetLibraryItem, PlaybackDurationMode } from "@stream-jams/core";
import { useId } from "react";
import "./media-duration-controls.css";

export function MediaDurationControls({ mode, durationMs, assets, assetIds, fallbackDurationMs, onChange, onRepair }: {
  readonly mode: PlaybackDurationMode;
  readonly durationMs: number;
  readonly assets: readonly AssetLibraryItem[];
  readonly assetIds: readonly string[];
  readonly fallbackDurationMs: number;
  readonly onChange: (value: { readonly mode: PlaybackDurationMode; readonly durationMs: number }) => void;
  readonly onRepair?: ((assetId: string) => Promise<void>) | undefined;
}) {
  const durationModeName = useId();
  const candidates = [...new Set(assetIds)].map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is AssetLibraryItem => asset !== undefined);
  const timed = candidates.filter((asset) => (asset.mediaType === "audio" || asset.mediaType === "video") && asset.durationMs !== null);
  const longest = timed.reduce<AssetLibraryItem | null>((current, asset) => current === null || asset.durationMs! > current.durationMs! ? asset : current, null);
  const missing = candidates.filter((asset) => (asset.mediaType === "audio" || asset.mediaType === "video") && asset.durationMs === null);
  const resolvedDurationMs = Math.min(longest?.durationMs ?? fallbackDurationMs, 120_000);
  return <fieldset className="media-duration-controls">
    <legend>Duration</legend>
    <div aria-label="Duration mode" className="media-duration-controls__modes" role="radiogroup">
      <Radio label="Match longest media" checked={mode === "media"} name={durationModeName} onChange={() => onChange({ mode: "media", durationMs: resolvedDurationMs })} />
      <Radio label="Custom" checked={mode === "custom"} name={durationModeName} onChange={() => onChange({ mode: "custom", durationMs })} />
    </div>
    {mode === "custom" ? <TextInput label="Duration (milliseconds)" className="media-duration-controls__custom" aria-label="Duration (milliseconds)" max={120_000} min={100} onChange={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next)) onChange({ mode: "custom", durationMs: Math.round(next) });
    }} type="number" value={durationMs} /> : null}
    {mode === "media" ? <p className="media-duration-controls__feedback">{longest === null
      ? `No readable audio or video duration is available. Playback uses the ${fallbackDurationMs / 1000}-second fallback.`
      : `Matched to ${longest.displayName} (${formatDuration(resolvedDurationMs)}).`}</p> : null}
    {longest?.durationMs !== null && longest !== null && longest.durationMs > 120_000 ? <p className="media-duration-controls__feedback" role="alert">This media is longer than 2 minutes, so playback is capped at 2 minutes.</p> : null}
    {missing.map((asset) => <div className="media-duration-controls__missing" key={asset.id}><span>{asset.displayName} has no readable duration.</span>{onRepair === undefined ? null : <Button variant="default" onClick={() => void onRepair(asset.id)} type="button">Retry duration</Button>}</div>)}
  </fieldset>;
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs / 100) / 10}s`;
}
