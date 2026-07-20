import {
  type ActionableManagementError,
  type AssetChangeImpact,
  type AssetLibraryItem,
  type AssetMediaType
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { DirtyNavigationDialog } from "../foundation/DirtyNavigationDialog.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { formatBytes, formatCount, formatDate } from "../foundation/formatters.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { AssetPicker } from "./AssetPicker.js";
import { AssetPreview } from "./AssetPreview.js";
import {
  actionableError,
  parseTags,
  uploadError,
  validateAssetFile,
  type AssetLibraryManagementApi
} from "./asset-library-utils.js";
import type { AssetApi } from "./asset-api.js";
import "./asset-library.css";

export type { AssetApi } from "./asset-api.js";

export type { AssetLibraryManagementApi } from "./asset-library-utils.js";

export interface AssetManagerProps {
  readonly assetApi: AssetApi;
  readonly managementApi: AssetLibraryManagementApi;
}

interface ReplacementState {
  readonly item: AssetLibraryItem;
  readonly file: File | null;
  readonly impact: AssetChangeImpact | null;
}

export function AssetManager({ assetApi, managementApi }: AssetManagerProps) {
  const [items, setItems] = useState<readonly AssetLibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState<"all" | AssetMediaType>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | AssetLibraryItem["health"]>("all");
  const [moduleFilter, setModuleFilter] = useState<"all" | "alerts">("all");
  const [setFilter, setSetFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [tagFilters, setTagFilters] = useState<readonly string[]>([]);
  const [compactFilters, setCompactFilters] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [tags, setTags] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<ReplacementState | null>(null);
  const [deleteItem, setDeleteItem] = useState<AssetLibraryItem | null>(null);
  const hasLoadedItems = useRef(false);

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 700px)");
    if (media === undefined) return;
    const update = () => setCompactFilters(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await managementApi.listAssetLibraryItems();
      setItems(loaded);
      setSelectedId((current) => loaded.some((item) => item.id === current) ? current : (loaded[0]?.id ?? null));
      hasLoadedItems.current = true;
      setInitialLoadFailed(false);
      setError(null);
    } catch (loadError) {
      if (!hasLoadedItems.current) setInitialLoadFailed(true);
      setError(actionableError(loadError, "Asset library could not be loaded", "Retry. If the problem continues, open Diagnostics and search the reference ID."));
    } finally {
      setLoading(false);
    }
  }, [managementApi]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    setDisplayName(selected?.displayName ?? "");
    setTags(selected?.tags.join(", ") ?? "");
  }, [selected]);

  const normalizedTags = useMemo(() => parseTags(tags), [tags]);
  const metadataDirty = selected !== null
    && (displayName !== selected.displayName || JSON.stringify(normalizedTags) !== JSON.stringify(selected.tags));

  const requestAssetSelection = useCallback((nextId: string) => {
    if (nextId === selectedId) return;
    if (metadataDirty) {
      setSelectionError(null);
      setPendingSelectedId(nextId);
      return;
    }
    setSelectedId(nextId);
  }, [metadataDirty, selectedId]);

  const allTags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);
  const setOptions = useMemo(() => uniqueUsageOptions(items, "set"), [items]);
  const eventOptions = useMemo(() => uniqueUsageOptions(items, "event"), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const query = search.trim().toLowerCase();
    const textMatch = query === "" || [item.displayName, item.originalFileName, item.mimeType, ...item.tags]
      .some((value) => value.toLowerCase().includes(query));
    const usageMatch = usageFilter === "all" || (usageFilter === "used" ? item.usage.totalUsageCount > 0 : item.usage.totalUsageCount === 0);
    return textMatch
      && (mediaType === "all" || item.mediaType === mediaType)
      && usageMatch
      && (healthFilter === "all" || item.health === healthFilter)
      && (moduleFilter === "all" || item.usage.totalUsageCount > 0)
      && (setFilter === "all" || item.usage.usages.some((usage) => usage.setId === setFilter))
      && (eventFilter === "all" || item.usage.usages.some((usage) => usage.eventType === eventFilter))
      && tagFilters.every((tag) => item.tags.includes(tag));
  }), [eventFilter, healthFilter, items, mediaType, moduleFilter, search, setFilter, tagFilters, usageFilter]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((item) => item.id === selectedId)) {
      requestAssetSelection(filtered[0]!.id);
    }
  }, [filtered, requestAssetSelection, selectedId]);

  const persistMetadata = useCallback(async (): Promise<boolean> => {
    if (selected === null) return false;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await managementApi.updateAssetMetadata(selected.id, {
        displayName: displayName.trim(),
        tags: normalizedTags
      });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice({ tone: "success", message: "Asset details saved." });
      setError(null);
      return true;
    } catch (saveError) {
      setError(actionableError(saveError, "Asset details were not saved", "Review the display name and tags, then retry."));
      return false;
    } finally {
      setBusy(false);
    }
  }, [displayName, managementApi, normalizedTags, selected]);

  const discardMetadata = useCallback(() => {
    setDisplayName(selected?.displayName ?? "");
    setTags(selected?.tags.join(", ") ?? "");
  }, [selected]);

  useDirtyNavigationSource({
    id: "asset-metadata",
    dirty: metadataDirty,
    summary: "Asset details have unsaved changes.",
    save: persistMetadata,
    discard: discardMetadata
  });

  function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistMetadata();
  }

  async function saveAndContinueSelection() {
    if (pendingSelectedId === null) return;
    setSelectionError(null);
    if (!await persistMetadata()) {
      setSelectionError("Asset details were not saved. Review the display name and tags, then retry.");
      return;
    }
    setSelectedId(pendingSelectedId);
    setPendingSelectedId(null);
  }

  function discardAndContinueSelection() {
    if (pendingSelectedId === null) return;
    discardMetadata();
    setSelectedId(pendingSelectedId);
    setPendingSelectedId(null);
    setSelectionError(null);
  }

  async function reviewReplacement() {
    if (replacement?.file === null || replacement === null) return;
    setNotice(null);
    const validation = await validateAssetFile(replacement.file);
    if (!validation.accepted || validation.mediaType === null) {
      setError(uploadError(validation.reason));
      return;
    }
    setBusy(true);
    try {
      const impact = await managementApi.getAssetChangeImpact(replacement.item.id, validation.mediaType);
      setReplacement({ ...replacement, impact });
      setError(null);
    } catch (impactError) {
      setError(actionableError(impactError, "Replacement impact could not be checked", "Retry before changing this global asset."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReplacement() {
    if (replacement?.file === null || replacement?.impact === null || replacement === null) return;
    setBusy(true);
    setNotice(null);
    try {
      await assetApi.replaceAsset(replacement.item.id, replacement.file, true);
      setReplacement(null);
      setNotice({ tone: "success", message: "Asset replaced everywhere it is used." });
      await loadItems();
    } catch (replaceError) {
      setError(actionableError(replaceError, "Asset file was not replaced", "Review the file format and affected usages, then retry."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteItem === null) return;
    const assetId = deleteItem.id;
    setBusy(true);
    setNotice(null);
    try {
      await managementApi.deleteAsset(assetId);
      setDeleteItem(null);
      setNotice({ tone: "success", message: "Unused asset deleted." });
      await loadItems();
    } catch (deleteError) {
      setError(actionableError(deleteError, "Asset was not deleted", "Refresh usage details and remove every alert reference before retrying."));
    } finally {
      setBusy(false);
    }
  }

  if (!hasLoadedItems.current && loading) return <p className="management-empty" role="status">Loading asset library...</p>;
  if (initialLoadFailed && error !== null) return <section aria-label="Asset library" className="asset-library"><ManagementErrorBanner error={error} /><button onClick={() => void loadItems()} type="button">Retry loading assets</button></section>;

  return (
    <div className="asset-library" aria-labelledby="asset-library-title">
      <div className="asset-library__toolbar">
        <div>
          <h2 id="asset-library-title">Asset library</h2>
          <p>{formatCount(items.length, { one: "reusable media asset", other: "reusable media assets" })}</p>
        </div>
        <button onClick={() => setPickerOpen(true)} type="button">Add asset</button>
      </div>

      {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      <details className="asset-library__filter-disclosure" onToggle={(event) => { if (compactFilters) setFiltersExpanded(event.currentTarget.open); }} open={!compactFilters || filtersExpanded}>
        <summary>Filters</summary>
        <div className="asset-library__filters" aria-label="Asset filters">
          <label className="asset-library__search"><span>Search assets</span><input onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} /></label>
          <FilterSelect label="Type" onChange={setMediaType} value={mediaType} options={["all", "image", "gif", "video", "audio"]} />
          <FilterSelect label="Usage" onChange={setUsageFilter} value={usageFilter} options={["all", "used", "unused"]} />
          <FilterSelect label="Health" onChange={setHealthFilter} value={healthFilter} options={["all", "available", "missing", "broken"]} />
          <FilterSelect label="Module" onChange={setModuleFilter} value={moduleFilter} options={["all", "alerts"]} />
          <label><span>Set</span><select onChange={(event) => setSetFilter(event.currentTarget.value)} value={setFilter}><option value="all">All</option>{setOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Event</span><select onChange={(event) => setEventFilter(event.currentTarget.value)} value={eventFilter}><option value="all">All</option>{eventOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        {allTags.length === 0 ? null : <fieldset className="asset-library__tag-filters"><legend>Tags (match all)</legend>{allTags.map((tag) => <label key={tag}><input checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} type="checkbox" />{tag}</label>)}</fieldset>}
      </details>

      {loading ? <p className="management-empty">Loading asset library...</p> : null}
      {!loading && items.length === 0 ? <div className="management-empty"><strong>No assets imported yet.</strong><p>Add media here or from an alert layer without leaving that editing flow.</p></div> : null}
      {!loading && items.length > 0 && filtered.length === 0 ? <div className="management-empty"><strong>No assets match these filters.</strong><p>Clear one or more filters to broaden the results.</p></div> : null}

      {filtered.length > 0 ? <div className="asset-library__workspace">
        <div className="asset-library__table-wrap">
          <table className="asset-library__table">
            <thead><tr><th><span className="asset-library__sr-only">Preview</span></th><th>Name</th><th>Type</th><th>Usage</th><th>Health</th><th>Updated</th></tr></thead>
            <tbody>{filtered.map((item) => <tr aria-selected={item.id === selectedId} key={item.id} onClick={() => requestAssetSelection(item.id)}>
              <td data-label="Preview"><AssetPreview assetApi={assetApi} compact item={item} /></td>
              <td data-label="Name"><button className="asset-library__row-action" onClick={(event) => { event.stopPropagation(); requestAssetSelection(item.id); }} type="button">{item.displayName}</button><small>{item.originalFileName}</small></td>
              <td data-label="Type">{formatLabel(item.mediaType)}</td><td data-label="Usage">{formatCount(item.usage.totalUsageCount, { one: "use", other: "uses" })}</td><td data-label="Health"><StatusBadge label={formatLabel(item.health)} tone={healthTone(item.health)} /></td><td data-label="Updated">{formatDate(item.updatedAt)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {selected === null ? null : <div className="asset-library__details" aria-label={`${selected.displayName} details`} role="region">
          <div className="asset-library__preview"><AssetPreview assetApi={assetApi} item={selected} /></div>
          <div className="asset-library__detail-heading"><div><h3>{selected.displayName}</h3><p>{selected.originalFileName}</p></div><StatusBadge label={formatLabel(selected.health)} tone={healthTone(selected.health)} /></div>
          <dl className="asset-library__facts"><div><dt>Type</dt><dd>{formatLabel(selected.mediaType)}</dd></div><div><dt>Size</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div><div><dt>Dimensions</dt><dd>{selected.width === null || selected.height === null ? "Not available" : `${selected.width} x ${selected.height}`}</dd></div><div><dt>Duration</dt><dd>{selected.durationMs === null ? "Not available" : formatDuration(selected.durationMs)}</dd></div><div><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl>
          <form className="asset-library__metadata" onSubmit={saveMetadata}><label><span>Display name</span><input maxLength={160} onChange={(event) => setDisplayName(event.currentTarget.value)} required value={displayName} /></label><label><span>Tags</span><input aria-describedby="asset-tag-help" onChange={(event) => setTags(event.currentTarget.value)} value={tags} /></label><small id="asset-tag-help">Comma-separated; tags are matched without case.</small><button disabled={busy || displayName.trim() === ""} type="submit">Save asset details</button></form>
          <section className="asset-library__usage" aria-labelledby="asset-usage-title"><div><h4 id="asset-usage-title">Used by</h4><span>{formatCount(selected.usage.totalUsageCount, { one: "alert context", other: "alert contexts" })}</span></div>{selected.usage.usages.length === 0 ? <p>Not currently linked to an alert.</p> : <ul>{selected.usage.usages.map((usage) => <li key={`${usage.setId ?? "unassigned"}-${usage.alertId}`}><a href={usageHref(usage)}>{usage.alertName}</a><span>{usage.setName ?? "Unassigned set"} / {formatLabel(usage.eventType)} / {usage.targetProfileIds.length === 0 ? "No profiles" : usage.targetProfileIds.map(formatLabel).join(", ")}</span></li>)}</ul>}</section>
          <div className="asset-library__actions"><button className="button button--secondary" onClick={() => setReplacement({ item: selected, file: null, impact: null })} type="button">Replace file</button><button aria-describedby={selected.usage.totalUsageCount > 0 ? `asset-delete-help-${selected.id}` : undefined} className="button button--danger-quiet" disabled={selected.usage.totalUsageCount > 0} onClick={() => setDeleteItem(selected)} type="button">Delete asset</button></div>
          {selected.usage.totalUsageCount > 0 ? <p className="asset-library__delete-help" id={`asset-delete-help-${selected.id}`}>Remove {formatCount(selected.usage.totalUsageCount, { one: "alert use", other: "alert uses" })} before deleting this asset.</p> : null}
        </div>}
      </div> : null}

      <DirtyNavigationDialog
        error={selectionError}
        onCancel={() => { setPendingSelectedId(null); setSelectionError(null); }}
        onDiscard={discardAndContinueSelection}
        onSave={() => void saveAndContinueSelection()}
        open={pendingSelectedId !== null}
        saveAvailable
        saveLabel="Save and continue"
        summary="Asset details have unsaved changes."
        title="Switch assets with unsaved changes?"
      />
      <AssetPicker assetApi={assetApi} compatibleMediaTypes={["image", "gif", "video", "audio"]} managementApi={managementApi} onCancel={() => setPickerOpen(false)} onSelect={() => { setPickerOpen(false); void loadItems(); }} open={pickerOpen} />
      <ReplacementDialog busy={busy} onCancel={() => setReplacement(null)} onConfirm={confirmReplacement} onFileChange={(file) => setReplacement((current) => current === null ? null : { ...current, file, impact: null })} onReview={reviewReplacement} state={replacement} />
      <DestructiveConfirmationDialog actionLabel="Delete asset" consequences="The file and its metadata will be removed permanently." onCancel={() => setDeleteItem(null)} onConfirm={() => void confirmDelete()} open={deleteItem !== null} recovery={null} scope={deleteItem?.displayName ?? "Selected asset"} title={`Delete ${deleteItem?.displayName ?? "asset"}?`} />
    </div>
  );
}

function ReplacementDialog(props: { readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => void; readonly onFileChange: (file: File | null) => void; readonly onReview: () => void; readonly state: ReplacementState | null }) {
  const reviewed = props.state?.impact !== null && props.state?.impact !== undefined;
  const title = reviewed ? `Replace ${props.state?.item.displayName}?` : `Choose replacement for ${props.state?.item.displayName ?? "asset"}`;
  return <ModalSurface labelledBy="asset-replacement-title" onCancel={props.onCancel} open={props.state !== null}><div className="asset-library__modal"><header><p className="management-eyebrow">Global asset change</p><h2 id="asset-replacement-title">{title}</h2><p>The stable asset ID stays the same, so every linked alert will resolve to the new file.</p></header>{reviewed ? <><dl className="management-confirmation-details"><div><dt>Affected usages</dt><dd>{props.state?.impact?.usage.totalUsageCount ?? 0}</dd></div><div><dt>Replacement file</dt><dd>{props.state?.file?.name}</dd></div></dl>{props.state?.impact?.warnings.map((warning) => <p className="asset-library__warning" key={warning}>{warning}</p>)}</> : <label className="management-field"><span>Replacement file</span><input accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={(event) => props.onFileChange(event.currentTarget.files?.[0] ?? null)} type="file" /></label>}<div className="management-modal__actions"><button className="button button--secondary" disabled={props.busy} onClick={props.onCancel} type="button">Cancel</button>{reviewed ? <button disabled={props.busy} onClick={props.onConfirm} type="button">Replace everywhere</button> : <button disabled={props.busy || props.state?.file === null} onClick={props.onReview} type="button">Review replacement</button>}</div></div></ModalSurface>;
}

function FilterSelect<T extends string>({ label, onChange, options, value }: { readonly label: string; readonly onChange: (value: T) => void; readonly options: readonly T[]; readonly value: T }) {
  return <label><span>{label}</span><select onChange={(event) => onChange(event.currentTarget.value as T)} value={value}>{options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}</select></label>;
}

function uniqueUsageOptions(items: readonly AssetLibraryItem[], kind: "set" | "event") {
  const options = new Map<string, string>();
  for (const usage of items.flatMap((item) => item.usage.usages)) {
    if (kind === "set" && usage.setId !== null) options.set(usage.setId, usage.setName ?? usage.setId);
    if (kind === "event") options.set(usage.eventType, formatLabel(usage.eventType));
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function usageHref(usage: AssetLibraryItem["usage"]["usages"][number]): string {
  const params = new URLSearchParams();
  if (usage.setId !== null) params.set("set", usage.setId);
  params.set("event", usage.eventType);
  const profile = usage.targetProfileIds[0];
  if (profile !== undefined) params.set("profile", profile);
  return `/manage/modules/alerts/editor/${encodeURIComponent(usage.alertId)}?${params.toString()}`;
}

function healthTone(health: AssetLibraryItem["health"]): "positive" | "warning" | "negative" { return health === "available" ? "positive" : health === "missing" ? "warning" : "negative"; }
function formatLabel(value: string): string { return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
function formatDuration(value: number): string { return `${(value / 1000).toFixed(1)} s`; }
