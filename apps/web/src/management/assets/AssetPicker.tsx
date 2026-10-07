import { Button, Checkbox, Tabs, TextInput } from "@mantine/core";
import type { ActionableManagementError, AssetLibraryItem, AssetMediaType } from "@stream-jams/core";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { formatCount } from "../foundation/formatters.js";
import { actionableError, parseTags, uploadError, validateAssetFile, type AssetLibraryManagementApi } from "./asset-library-utils.js";
import { AssetPreview } from "./AssetPreview.js";
import type { AssetApi, AssetRecord } from "./asset-api.js";
import "./asset-library.css";

export interface AssetPickerProps {
  readonly assetApi: AssetApi;
  readonly compatibleMediaTypes: readonly AssetMediaType[];
  readonly managementApi: AssetLibraryManagementApi;
  readonly onCancel: () => void;
  readonly onSelect: (assetId: string, mediaType: AssetMediaType, item: AssetLibraryItem) => void;
  readonly open: boolean;
  readonly selectedAssetId?: string | null;
}

export function AssetPicker(props: AssetPickerProps) {
  const compatibleMediaTypesKey = props.compatibleMediaTypes.join("\u0000");
  const compatibleMediaTypes = useMemo<readonly AssetMediaType[]>(
    () => compatibleMediaTypesKey === "" ? [] : compatibleMediaTypesKey.split("\u0000") as AssetMediaType[],
    [compatibleMediaTypesKey]
  );
  const selectionScope = JSON.stringify([props.open, compatibleMediaTypesKey, props.selectedAssetId ?? null]);
  const [tab, setTab] = useState<"existing" | "upload">("existing");
  const [items, setItems] = useState<readonly AssetLibraryItem[]>([]);
  const [selection, setSelection] = useState<{ readonly scope: string | null; readonly id: string | null }>({ scope: null, id: null });
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<readonly string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadPending = useRef(false);
  const importedFile = useRef<{ file: File; asset: AssetRecord } | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const selectedId = selection.scope === selectionScope ? selection.id : null;

  useEffect(() => {
    if (!props.open) {
      importedFile.current = null;
      setFile(null);
      setDisplayName("");
      setTags("");
      setTab("existing");
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setSelection({ scope: selectionScope, id: null });
    void props.managementApi.listAssetLibraryItems().then((loaded) => {
      if (!active) return;
      setItems(loaded);
      const compatible = loaded.filter((item) => compatibleMediaTypes.includes(item.mediaType));
      const requestedId = props.selectedAssetId ?? null;
      setSelection({ scope: selectionScope, id: compatible.some((item) => item.id === requestedId) ? requestedId : (compatible[0]?.id ?? null) });
      setError(null);
    }).catch((loadError: unknown) => {
      if (active) setError(actionableError(loadError, "Assets could not be loaded", "Retry or close the picker and open the Assets page."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [compatibleMediaTypes, props.managementApi, props.open, props.selectedAssetId, reload, selectionScope]);

  const compatibleItems = useMemo(() => items.filter((item) => compatibleMediaTypes.includes(item.mediaType)), [compatibleMediaTypes, items]);
  const allTags = useMemo(() => [...new Set(compatibleItems.flatMap((item) => item.tags))].sort(), [compatibleItems]);
  const visible = useMemo(() => compatibleItems.filter((item) => {
    const query = search.trim().toLowerCase();
    return (query === "" || [item.displayName, item.originalFileName, ...item.tags].some((value) => value.toLowerCase().includes(query)))
      && tagFilters.every((tag) => item.tags.includes(tag));
  }), [compatibleItems, search, tagFilters]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadPending.current) return;
    if (file === null) {
      setError(uploadError("Choose a file before uploading."));
      return;
    }
    uploadPending.current = true;
    setUploading(true);
    setError(null);
    try {
      const validation = await validateAssetFile(file);
      if (!validation.accepted || validation.mediaType === null || !compatibleMediaTypes.includes(validation.mediaType)) {
        setError({ ...uploadError(validation.reason ?? "This file type is not compatible with the selected layer."), cause: `${allowedTypes(compatibleMediaTypes)} ${validation.reason ?? "This file is not compatible."}` });
        return;
      }
      const imported = importedFile.current?.file === file ? importedFile.current.asset : await props.assetApi.importAsset(file);
      importedFile.current = { file, asset: imported };
      const item = await props.managementApi.updateAssetMetadata(imported.id, {
        displayName: displayName.trim() || file.name,
        tags: parseTags(tags)
      });
      setError(null);
      props.onSelect(imported.id, imported.mediaType, item);
    } catch (uploadFailure) {
      setError(actionableError(uploadFailure, "Asset upload did not complete", `Keep this picker open, verify ${allowedTypes(compatibleMediaTypes)}, then retry.`));
    } finally {
      uploadPending.current = false;
      setUploading(false);
    }
  }

  const selectedItem = compatibleItems.find((item) => item.id === selectedId);
  return <ModalSurface labelledBy="asset-picker-title" onCancel={props.onCancel} open={props.open} pending={uploading}><div className="asset-picker"><header><p className="management-eyebrow">Global asset</p><ManagementModalTitle>Choose asset</ManagementModalTitle><p>Select a compatible global asset or register a new one without leaving the editor.</p></header><Tabs value={tab} onChange={value => { if (!uploadPending.current && (value === "existing" || value === "upload")) setTab(value); }} keepMounted={false}><Tabs.List aria-label="Asset source"><Tabs.Tab value="existing" disabled={uploading} onFocus={() => { if (!uploadPending.current) setTab("existing"); }}>Existing</Tabs.Tab><Tabs.Tab value="upload" disabled={uploading} onFocus={() => { if (!uploadPending.current) setTab("upload"); }}>Upload new</Tabs.Tab></Tabs.List>{error === null ? null : <><ManagementErrorBanner error={error} />{tab === "existing" ? <Button variant="default" disabled={loading} onClick={() => setReload(value => value + 1)}>Retry loading assets</Button> : null}</>}<Tabs.Panel value="existing"><section aria-label="Existing assets" className="asset-picker__existing"><TextInput label="Search compatible assets" onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} />{allTags.length === 0 ? null : <fieldset><legend>Tags (match all)</legend>{allTags.map((tag) => <Checkbox key={tag} label={tag} checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} />)}</fieldset>}<div aria-label="Compatible assets" className="asset-picker__options">{loading ? <p role="status">Loading...</p> : visible.length === 0 ? <p>No compatible assets match these filters.</p> : visible.map((item) => { const usage = formatCount(item.usage.totalUsageCount, { one: "use", other: "uses" }); return <div className="asset-picker__option" data-media-type={item.mediaType} data-selected={selectedId === item.id || undefined} key={item.id}><AssetPreview assetApi={props.assetApi} compact item={item} /><Button variant="transparent" aria-label={`${item.displayName}, ${item.mediaType}, ${usage}`} aria-pressed={selectedId === item.id} onClick={() => setSelection({ scope: selectionScope, id: item.id })} type="button"><span><strong>{item.displayName}</strong><small>{item.tags.join(" / ") || "No tags"} / {usage}</small></span></Button></div>; })}</div><div className="management-modal__actions"><Button variant="default" disabled={uploading} onClick={props.onCancel} type="button">Cancel</Button><Button disabled={loading || uploading || selectedItem === undefined} onClick={() => { if (selectedItem !== undefined) props.onSelect(selectedItem.id, selectedItem.mediaType, selectedItem); }} type="button">Use selected asset</Button></div></section></Tabs.Panel><Tabs.Panel value="upload"><form className="asset-picker__upload" onSubmit={upload}><TextInput label="Asset file" disabled={uploading} accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,.ttf,.otf,.woff,.woff2" onChange={(event) => { importedFile.current = null; setError(null); setFile(event.currentTarget.files?.[0] ?? null); }} type="file" /><p className="asset-picker__limits">{allowedTypes(compatibleMediaTypes)}</p><TextInput label="Display name" disabled={uploading} maxLength={160} onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder={file?.name ?? "Asset name"} value={displayName} /><TextInput label="Tags" disabled={uploading} list="asset-picker-tags" onChange={(event) => setTags(event.currentTarget.value)} placeholder="seasonal, follower" value={tags} /><datalist id="asset-picker-tags">{allTags.map((tag) => <option key={tag} value={tag} />)}</datalist><div className="management-modal__actions"><Button variant="default" disabled={uploading} onClick={props.onCancel} type="button">Cancel</Button><Button disabled={loading || uploading || file === null} loading={uploading} type="submit">Upload and use</Button></div></form></Tabs.Panel></Tabs></div></ModalSurface>;
}

function allowedTypes(types: readonly AssetMediaType[]): string {
  const values: string[] = [];
  if (types.includes("font")) values.push("TTF, OTF, WOFF, or WOFF2 up to 10 MiB");
  if (types.includes("image")) values.push("PNG, JPG, or WebP up to 10 MiB");
  if (types.includes("gif")) values.push("GIF up to 25 MiB");
  if (types.includes("video")) values.push("MP4 or WebM up to 100 MiB");
  if (types.includes("audio")) values.push("MP3, WAV, OGG, or WebM audio up to 25 MiB");
  return `${values.join("; ")}.`;
}
