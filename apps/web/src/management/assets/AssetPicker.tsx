import type { ActionableManagementError, AssetLibraryItem, AssetMediaType } from "@stream-jams/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { actionableError, parseTags, uploadError, validateAssetFile, type AssetLibraryManagementApi } from "./asset-library-utils.js";
import { AssetPreview } from "./AssetPreview.js";
import type { AssetApi } from "./asset-api.js";
import "./asset-library.css";

export interface AssetPickerProps {
  readonly assetApi: AssetApi;
  readonly compatibleMediaTypes: readonly AssetMediaType[];
  readonly managementApi: AssetLibraryManagementApi;
  readonly onCancel: () => void;
  readonly onSelect: (assetId: string) => void;
  readonly open: boolean;
  readonly selectedAssetId?: string | null;
}

export function AssetPicker(props: AssetPickerProps) {
  const selectionScope = JSON.stringify([props.open, props.compatibleMediaTypes, props.selectedAssetId ?? null]);
  const [tab, setTab] = useState<"existing" | "upload">("existing");
  const [items, setItems] = useState<readonly AssetLibraryItem[]>([]);
  const [selection, setSelection] = useState<{ readonly scope: string | null; readonly id: string | null }>({ scope: null, id: null });
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<readonly string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const selectedId = selection.scope === selectionScope ? selection.id : null;

  useEffect(() => {
    if (!props.open) return;
    let active = true;
    setLoading(true);
    setSelection({ scope: selectionScope, id: null });
    void props.managementApi.listAssetLibraryItems().then((loaded) => {
      if (!active) return;
      setItems(loaded);
      const compatible = loaded.filter((item) => props.compatibleMediaTypes.includes(item.mediaType));
      const requestedId = props.selectedAssetId ?? null;
      setSelection({ scope: selectionScope, id: compatible.some((item) => item.id === requestedId) ? requestedId : (compatible[0]?.id ?? null) });
      setError(null);
    }).catch((loadError: unknown) => {
      if (active) setError(actionableError(loadError, "Assets could not be loaded", "Retry or close the picker and open the Assets page."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.compatibleMediaTypes, props.managementApi, props.open, props.selectedAssetId, selectionScope]);

  const compatibleItems = useMemo(() => items.filter((item) => props.compatibleMediaTypes.includes(item.mediaType)), [items, props.compatibleMediaTypes]);
  const allTags = useMemo(() => [...new Set(compatibleItems.flatMap((item) => item.tags))].sort(), [compatibleItems]);
  const visible = useMemo(() => compatibleItems.filter((item) => {
    const query = search.trim().toLowerCase();
    return (query === "" || [item.displayName, item.originalFileName, ...item.tags].some((value) => value.toLowerCase().includes(query)))
      && tagFilters.every((tag) => item.tags.includes(tag));
  }), [compatibleItems, search, tagFilters]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file === null) {
      setError(uploadError("Choose a file before uploading."));
      return;
    }
    setLoading(true);
    try {
      const validation = await validateAssetFile(file);
      if (!validation.accepted || validation.mediaType === null || !props.compatibleMediaTypes.includes(validation.mediaType)) {
        setError({ ...uploadError(validation.reason ?? "This file type is not compatible with the selected layer."), cause: `${allowedTypes(props.compatibleMediaTypes)} ${validation.reason ?? "This file is not compatible."}` });
        return;
      }
      const imported = await props.assetApi.importAsset(file);
      await props.managementApi.updateAssetMetadata(imported.id, {
        displayName: displayName.trim() || file.name,
        tags: parseTags(tags)
      });
      setError(null);
      props.onSelect(imported.id);
    } catch (uploadFailure) {
      setError(actionableError(uploadFailure, "Asset upload did not complete", `Keep this picker open, verify ${allowedTypes(props.compatibleMediaTypes)}, then retry.`));
    } finally {
      setLoading(false);
    }
  }

  return <ModalSurface labelledBy="asset-picker-title" onCancel={props.onCancel} open={props.open}><div className="asset-picker"><header><p className="management-eyebrow">Alert asset</p><h2 id="asset-picker-title">Choose asset</h2><p>Select a compatible global asset or register a new one without leaving the editor.</p></header><div aria-label="Asset source" className="asset-picker__tabs" role="tablist"><button aria-selected={tab === "existing"} onClick={() => setTab("existing")} role="tab" type="button">Existing</button><button aria-selected={tab === "upload"} onClick={() => setTab("upload")} role="tab" type="button">Upload new</button></div>{error === null ? null : <ManagementErrorBanner error={error} />}{tab === "existing" ? <section aria-label="Existing assets" className="asset-picker__existing"><label><span>Search compatible assets</span><input onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} /></label>{allTags.length === 0 ? null : <fieldset><legend>Tags (match all)</legend>{allTags.map((tag) => <label key={tag}><input checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} type="checkbox" />{tag}</label>)}</fieldset>}<div aria-label="Compatible assets" className="asset-picker__options">{loading ? <p>Loading...</p> : visible.map((item) => <button aria-label={`${item.displayName}, ${item.mediaType}, ${item.usage.totalUsageCount} uses`} aria-pressed={selectedId === item.id} key={item.id} onClick={() => setSelection({ scope: selectionScope, id: item.id })} type="button"><AssetPreview assetApi={props.assetApi} compact item={item} /><span><strong>{item.displayName}</strong><small>{item.tags.join(" / ") || "No tags"} / {item.usage.totalUsageCount} uses</small></span></button>)}</div><div className="management-modal__actions"><button className="button button--secondary" onClick={props.onCancel} type="button">Cancel</button><button disabled={selectedId === null} onClick={() => { if (selectedId !== null) props.onSelect(selectedId); }} type="button">Use selected asset</button></div></section> : <form className="asset-picker__upload" onSubmit={upload}><label><span>Asset file</span><input accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} type="file" /></label><p className="asset-picker__limits">{allowedTypes(props.compatibleMediaTypes)}</p><label><span>Display name</span><input onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder={file?.name ?? "Asset name"} value={displayName} /></label><label><span>Tags</span><input list="asset-picker-tags" onChange={(event) => setTags(event.currentTarget.value)} placeholder="seasonal, follower" value={tags} /></label><datalist id="asset-picker-tags">{allTags.map((tag) => <option key={tag} value={tag} />)}</datalist><div className="management-modal__actions"><button className="button button--secondary" onClick={props.onCancel} type="button">Cancel</button><button disabled={loading || file === null} type="submit">Upload and use</button></div></form>}</div></ModalSurface>;
}

function allowedTypes(types: readonly AssetMediaType[]): string {
  const values: string[] = [];
  if (types.includes("image")) values.push("PNG, JPG, or WebP up to 10 MiB");
  if (types.includes("gif")) values.push("GIF up to 25 MiB");
  if (types.includes("video")) values.push("MP4 or WebM up to 100 MiB");
  if (types.includes("audio")) values.push("MP3, WAV, OGG, or WebM audio up to 25 MiB");
  return `${values.join("; ")}.`;
}
