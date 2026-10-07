import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { createDefaultTextWarp, type AlertTextStyle, type AssetLibraryItem } from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import { RgbaColorControl } from "./RgbaColorControl.js";

export function AdvancedTypographyControls({ value, onChange, assets, assetApi, onAssetsChanged, editingWarp, onEditWarp }: {
  readonly value: AlertTextStyle;
  readonly onChange: (style: AlertTextStyle) => void;
  readonly assets: readonly AssetLibraryItem[];
  readonly assetApi: AssetApi;
  readonly onAssetsChanged: () => Promise<void>;
  readonly editingWarp: boolean;
  readonly onEditWarp: (editing: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const fonts = assets.filter((asset) => asset.mediaType === "font");
  async function upload(file: File) {
    setUploading(true); setError(null);
    try {
      const asset = await assetApi.importAsset(file);
      await onAssetsChanged();
      if (active.current) latest.current.onChange({ ...latest.current.value, fontAssetId: asset.id });
    } catch (cause) {
      if (active.current) setError(`Font upload failed. ${cause instanceof Error ? cause.message : "Try another font file."}`);
    } finally { if (active.current) setUploading(false); }
  }
  return <>
    <NativeSelect label="Uploaded font" aria-label="Uploaded font" value={value.fontAssetId ?? ""} onChange={(event) => onChange({ ...value, fontAssetId: event.currentTarget.value || null })}><option value="">Use font preset</option>{value.fontAssetId && !fonts.some((font) => font.id === value.fontAssetId) ? <option value={value.fontAssetId}>Unavailable font — select another</option> : null}{fonts.map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</NativeSelect>
    <TextInput label={<>{uploading ? "Uploading font…" : "Upload reusable font"}</>} aria-label="Upload reusable font" type="file" accept=".ttf,.otf,.woff,.woff2" disabled={uploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} />
    {error ? <p role="alert">{error}</p> : null}
    <Checkbox label="Italic" checked={value.italic ?? false} onChange={(event) => onChange({ ...value, italic: event.currentTarget.checked })} />
    <Checkbox label="Underline" checked={value.underline ?? false} onChange={(event) => onChange({ ...value, underline: event.currentTarget.checked })} />
    <TextInput label="Letter spacing" aria-label="Letter spacing" type="number" min={-20} max={100} step={0.5} value={value.letterSpacingPx ?? 0} onChange={(event) => { const amount = event.currentTarget.valueAsNumber; if (Number.isFinite(amount)) onChange({ ...value, letterSpacingPx: Math.max(-20, Math.min(100, amount)) }); }} />
    <Checkbox label="Text outline" checked={value.outline != null} onChange={(event) => onChange({ ...value, outline: event.currentTarget.checked ? { color: "#000000FF", widthPx: 2 } : null })} />
    {value.outline ? <>
      <RgbaColorControl label="Outline color" value={value.outline.color} onChange={(color) => onChange({ ...value, outline: { ...value.outline!, color } })} />
      <TextInput label="Outline thickness" aria-label="Outline thickness" type="number" min={0} max={32} step={0.5} value={value.outline.widthPx} onChange={(event) => { const width = event.currentTarget.valueAsNumber; if (Number.isFinite(width)) onChange({ ...value, outline: { ...value.outline!, widthPx: Math.max(0, Math.min(32, width)) } }); }} />
    </> : null}
    <Checkbox label="Warp text" checked={value.warp != null} onChange={(event) => { onChange({ ...value, warp: event.currentTarget.checked ? createDefaultTextWarp() : null }); onEditWarp(event.currentTarget.checked); }} />
    {value.warp ? <Button variant="default" type="button" onClick={() => onEditWarp(!editingWarp)}>{editingWarp ? "Done editing warp" : "Edit warp"}</Button> : null}
  </>;
}
