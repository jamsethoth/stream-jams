import { Button, Checkbox, NativeSelect, Table, TextInput } from "@mantine/core";
import {
  type ActionableManagementError,
  type AssetChangeImpact,
  type AssetLibraryItem,
  type AssetMediaType
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { DirtyNavigationDialog } from "../foundation/DirtyNavigationDialog.js";
import { FocusFallback } from "../foundation/FocusFallback.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { ManagementModalSurface as ModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { formatBytes, formatCount, formatDate } from "../foundation/formatters.js";
import { formatIdentifierLabel } from "../foundation/presentation-labels.js";
import { useDirtyNavigationSource, type DirtyNavigationSaveResult } from "../navigation/dirty-navigation.js";
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
  const [libraryError, setLibraryError] = useState<ActionableManagementError | null>(null);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState<"all" | AssetMediaType>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | AssetLibraryItem["health"]>("all");
  const [moduleFilter, setModuleFilter] = useState<"all" | "alerts" | "screen-effects" | "timers" | "music">("all");
  const [setFilter, setSetFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [tagFilters, setTagFilters] = useState<readonly string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [tags, setTags] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | ActionableManagementError | null>(null);
  const [replacement, setReplacement] = useState<ReplacementState | null>(null);
  const [deleteItem, setDeleteItem] = useState<AssetLibraryItem | null>(null);
  const hasLoadedItems = useRef(false);
  const mutationPending = useRef(false);
  const libraryHeadingRef = useRef<HTMLHeadingElement>(null);
  const moreFiltersRef = useRef<HTMLElement>(null);
  const [replacementError, setReplacementError] = useState<ActionableManagementError | null>(null);
  const [deleteError, setDeleteError] = useState<ActionableManagementError | null>(null);
  const draftOwner = useRef<string | null>(null);
  const dirtyDraft = useRef(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await managementApi.listAssetLibraryItems();
      setItems(loaded);
      setSelectedId((current) => loaded.some((item) => item.id === current) ? current : (loaded[0]?.id ?? null));
      hasLoadedItems.current = true;
      setInitialLoadFailed(false);
      setLibraryError(null);
    } catch (loadError) {
      if (!hasLoadedItems.current) setInitialLoadFailed(true);
      setLibraryError(actionableError(loadError, "Asset library could not be loaded", "Retry. If the problem continues, open Diagnostics and search the reference ID."));
    } finally {
      setLoading(false);
    }
  }, [managementApi]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (draftOwner.current === selected?.id && dirtyDraft.current) return;
    draftOwner.current = selected?.id ?? null;
    setDisplayName(selected?.displayName ?? "");
    setTags(selected?.tags.join(", ") ?? "");
  }, [selected]);

  const normalizedTags = useMemo(() => parseTags(tags), [tags]);
  const metadataDirty = selected !== null
    && (displayName !== selected.displayName || JSON.stringify(normalizedTags) !== JSON.stringify(selected.tags));
  dirtyDraft.current = metadataDirty;

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
  const activeSecondaryFilterCount = [usageFilter, healthFilter, moduleFilter, setFilter, eventFilter]
    .filter((value) => value !== "all").length + tagFilters.length;
  const filtered = useMemo(() => items.filter((item) => {
    const query = search.trim().toLowerCase();
    const textMatch = query === "" || [item.displayName, item.originalFileName, item.mimeType, ...item.tags]
      .some((value) => value.toLowerCase().includes(query));
    const usageCount = totalUsageCount(item);
    const usageMatch = usageFilter === "all" || (usageFilter === "used" ? usageCount > 0 : usageCount === 0);
    return textMatch
      && (mediaType === "all" || item.mediaType === mediaType)
      && usageMatch
      && (healthFilter === "all" || item.health === healthFilter)
      && (moduleFilter === "all" || (moduleFilter === "alerts"
        ? item.usage.totalUsageCount > 0
        : (item.moduleUsages ?? []).some((usage) => usage.moduleId === moduleFilter)))
      && (setFilter === "all" || item.usage.usages.some((usage) => usage.setId === setFilter))
      && (eventFilter === "all" || item.usage.usages.some((usage) => usage.eventType === eventFilter))
      && tagFilters.every((tag) => item.tags.includes(tag));
  }), [eventFilter, healthFilter, items, mediaType, moduleFilter, search, setFilter, tagFilters, usageFilter]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((item) => item.id === selectedId)) {
      requestAssetSelection(filtered[0]!.id);
    }
  }, [filtered, requestAssetSelection, selectedId]);

  const persistMetadata = useCallback(async (navigation = false): Promise<DirtyNavigationSaveResult> => {
    if (selected === null || libraryError !== null || mutationPending.current) return false;
    mutationPending.current = true;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const updated = await managementApi.updateAssetMetadata(selected.id, {
        displayName: displayName.trim(),
        tags: normalizedTags
      });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      // Adopt the server-normalized values; the dirty-draft guard would otherwise keep the submitted text.
      dirtyDraft.current = false;
      setDisplayName(updated.displayName);
      setTags(updated.tags.join(", "));
      setNotice({ tone: "success", message: "Asset details saved." });
      setError(null);
      return true;
    } catch (saveError) {
      const failure = actionableError(saveError, "Asset details were not saved", "Review the display name and tags, then retry.");
      if (!navigation) setError(failure);
      return { saved: false, error: failure };
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }, [displayName, libraryError, managementApi, normalizedTags, selected]);
  const saveBeforeNavigation = useCallback(() => persistMetadata(true), [persistMetadata]);

  const discardMetadata = useCallback(() => {
    setDisplayName(selected?.displayName ?? "");
    setTags(selected?.tags.join(", ") ?? "");
  }, [selected]);

  useDirtyNavigationSource({
    id: "asset-metadata",
    dirty: metadataDirty,
    summary: "Asset details have unsaved changes.",
    save: saveBeforeNavigation,
    discard: discardMetadata
  });

  function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistMetadata();
  }

  async function saveAndContinueSelection() {
    if (pendingSelectedId === null || mutationPending.current) return;
    setSelectionError(null);
    const result = await saveBeforeNavigation();
    if (result !== true) {
      setSelectionError(typeof result === "object" ? result.error : "Asset details were not saved. Review the display name and tags, then retry.");
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
    if (replacement?.file === null || replacement === null || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    setReplacementError(null);
    setNotice(null);
    try {
      const validation = await validateAssetFile(replacement.file);
      if (!validation.accepted || validation.mediaType === null) {
        setReplacementError(uploadError(validation.reason));
        return;
      }
      const impact = await managementApi.getAssetChangeImpact(replacement.item.id, validation.mediaType);
      setReplacement({ ...replacement, impact });
      setError(null);
    } catch (impactError) {
      setReplacementError(actionableError(impactError, "Replacement impact could not be checked", "Retry before changing this global asset."));
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  async function confirmReplacement() {
    if (replacement?.file === null || replacement?.impact === null || replacement === null || mutationPending.current) return;
    mutationPending.current = true;
    setReplacementError(null);
    setBusy(true);
    setNotice(null);
    try {
      await assetApi.replaceAsset(replacement.item.id, replacement.file, true);
      setReplacement(null);
      setNotice({ tone: "success", message: "Asset replaced everywhere it is used." });
      await loadItems();
    } catch (replaceError) {
      setReplacementError(actionableError(replaceError, "Asset file was not replaced", "Review the file format and affected usages, then retry."));
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteItem === null || totalUsageCount(deleteItem) > 0 || mutationPending.current) return;
    mutationPending.current = true;
    setDeleteError(null);
    const assetId = deleteItem.id;
    setBusy(true);
    setNotice(null);
    try {
      await managementApi.deleteAsset(assetId);
      setItems(current => current.filter(item => item.id !== assetId));
      setDeleteItem(null);
      setNotice({ tone: "success", message: "Unused asset deleted." });
      await loadItems();
    } catch (deleteError) {
      setDeleteError(actionableError(deleteError, "Asset was not deleted", "Refresh usage details and remove every alert reference before retrying."));
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  if (!hasLoadedItems.current && loading) return <p className="management-empty" role="status">Loading asset library...</p>;
  if (initialLoadFailed && libraryError !== null) return <section aria-label="Asset library" className="asset-library"><ManagementErrorBanner error={libraryError} /><Button onClick={() => void loadItems()} type="button">Retry loading assets</Button></section>;

  return (
    <div className="asset-library" aria-labelledby="asset-library-title">
      <div className="asset-library__toolbar">
        <div>
          <h2 ref={libraryHeadingRef} tabIndex={-1} id="asset-library-title">Asset library</h2>
          <p>{formatCount(items.length, { one: "reusable media asset", other: "reusable media assets" })}</p>
        </div>
        <Button disabled={busy || libraryError !== null} onClick={() => setPickerOpen(true)} type="button">Add asset</Button>
      </div>

      {libraryError === null ? null : <div><ManagementErrorBanner error={libraryError} /><p role="status">Showing last loaded asset details. Refresh before making another change.</p><Button disabled={loading} variant="default" onClick={() => void loadItems()}>Retry loading assets</Button></div>}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}

      <div className="asset-library__primary-filters" aria-label="Primary asset filters">
        <TextInput className="asset-library__search" label="Search assets" onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} />
        <FilterSelect label="Type" onChange={setMediaType} value={mediaType} options={["all", "image", "gif", "video", "audio", "font"]} />
      </div>
      <details className="asset-library__filter-disclosure">
        <summary ref={moreFiltersRef}>More filters {activeSecondaryFilterCount > 0 ? <span aria-label={`${activeSecondaryFilterCount} active secondary filters`}>{activeSecondaryFilterCount}</span> : null}</summary>
        <div className="asset-library__filters" aria-label="Asset filters">
          <FilterSelect label="Usage" onChange={setUsageFilter} value={usageFilter} options={["all", "used", "unused"]} />
          <FilterSelect label="Health" onChange={setHealthFilter} value={healthFilter} options={["all", "available", "missing", "broken"]} />
          <FilterSelect label="Module" onChange={setModuleFilter} value={moduleFilter} options={["all", "alerts", "screen-effects", "timers", "music"]} />
          <NativeSelect label="Set" onChange={(event) => setSetFilter(event.currentTarget.value)} value={setFilter} data={[{ value: "all", label: "All" }, ...setOptions]} />
          <NativeSelect label="Event" onChange={(event) => setEventFilter(event.currentTarget.value)} value={eventFilter} data={[{ value: "all", label: "All" }, ...eventOptions]} />
        </div>
        {allTags.length === 0 ? null : <fieldset className="asset-library__tag-filters"><legend>Tags (match all)</legend>{allTags.map((tag) => <Checkbox key={tag} label={tag} checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} />)}</fieldset>}
        <FocusFallback visible={activeSecondaryFilterCount > 0} target={() => moreFiltersRef.current} />
        {activeSecondaryFilterCount === 0 ? null : <Button variant="default" size="compact-sm" onClick={() => { setUsageFilter("all"); setHealthFilter("all"); setModuleFilter("all"); setSetFilter("all"); setEventFilter("all"); setTagFilters([]); }} type="button">Clear filters</Button>}
      </details>

      {loading ? <p className="management-empty">Loading asset library...</p> : null}
      {!loading && items.length === 0 ? <div className="management-empty"><strong>No assets imported yet.</strong><p>Add media here or from an alert layer without leaving that editing flow.</p></div> : null}
      {!loading && items.length > 0 && filtered.length === 0 ? <div className="management-empty"><strong>No assets match these filters.</strong><p>Clear one or more filters to broaden the results.</p></div> : null}

      {filtered.length > 0 ? <div className="asset-library__workspace">
        <div className="asset-library__table-wrap">
          <Table className="asset-library__table">
            <Table.Thead><Table.Tr><Table.Th><span className="asset-library__sr-only">Preview</span></Table.Th><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Usage</Table.Th><Table.Th>Health</Table.Th><Table.Th>Updated</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{filtered.map((item) => <Table.Tr aria-selected={item.id === selectedId} key={item.id} onClick={() => requestAssetSelection(item.id)}>
              <Table.Td data-label="Preview"><AssetPreview assetApi={assetApi} compact item={item} /></Table.Td>
              <Table.Td data-label="Name"><Button variant="transparent" className="asset-library__row-action" onClick={(event) => { event.stopPropagation(); requestAssetSelection(item.id); }} type="button">{item.displayName}</Button><small>{item.originalFileName}</small></Table.Td>
              <Table.Td data-label="Type">{formatLabel(item.mediaType)}</Table.Td><Table.Td data-label="Usage">{formatCount(totalUsageCount(item), { one: "use", other: "uses" })}</Table.Td><Table.Td data-label="Health"><StatusBadge label={formatLabel(item.health)} tone={healthTone(item.health)} /></Table.Td><Table.Td data-label="Updated">{formatDate(item.updatedAt)}</Table.Td>
            </Table.Tr>)}</Table.Tbody>
          </Table>
        </div>
        {selected === null ? null : <div className="asset-library__details" aria-label={`${selected.displayName} details`} role="region">
          <div className="asset-library__preview"><AssetPreview assetApi={assetApi} item={selected} /></div>
          <div className="asset-library__detail-heading"><div><h3>{selected.displayName}</h3><p>{selected.originalFileName}</p></div><StatusBadge label={formatLabel(selected.health)} tone={healthTone(selected.health)} /></div>
          <dl className="asset-library__facts"><div><dt>Type</dt><dd>{formatLabel(selected.mediaType)}</dd></div><div><dt>Size</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div><div><dt>Dimensions</dt><dd>{selected.width === null || selected.height === null ? "Not available" : `${selected.width} x ${selected.height}`}</dd></div><div><dt>Duration</dt><dd>{selected.durationMs === null ? "Not available" : formatDuration(selected.durationMs)}</dd></div><div><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl>
          <form className="asset-library__metadata" onSubmit={saveMetadata}>{error === null ? null : <ManagementErrorBanner error={error} />}<TextInput label="Display name" withAsterisk={false} disabled={busy || libraryError !== null} maxLength={160} onChange={(event) => setDisplayName(event.currentTarget.value)} required value={displayName} /><TextInput label="Tags" disabled={busy || libraryError !== null} description="Comma-separated; tags are matched without case." list="asset-library-tags" onChange={(event) => setTags(event.currentTarget.value)} value={tags} /><datalist id="asset-library-tags">{allTags.map(tag => <option key={tag} value={tag} />)}</datalist><Button disabled={busy || libraryError !== null || displayName.trim() === ""} type="submit">Save asset details</Button></form>
          <section className="asset-library__usage" aria-labelledby="asset-usage-title"><div><h4 id="asset-usage-title">Used by</h4><span>{formatCount(totalUsageCount(selected), { one: "saved use", other: "saved uses" })}</span></div>{totalUsageCount(selected) === 0 ? <p>Not currently linked to a module.</p> : <ul>{selected.usage.usages.map((usage) => <li key={`${usage.setId ?? "unassigned"}-${usage.alertId}`}><a href={usageHref(usage)}>{usage.alertName}</a><span>Alerts / {usage.setName ?? "Unassigned set"} / {formatLabel(usage.eventType)} / {usage.targetProfileIds.length === 0 ? "No profiles" : usage.targetProfileIds.map(formatLabel).join(", ")}</span></li>)}{(selected.moduleUsages ?? []).map((usage) => <li key={`${usage.moduleId}-${usage.ownerId}-${usage.variantId ?? "default"}-${usage.usageRole ?? "media"}`}><a href={moduleUsageHref(usage.moduleId, usage.ownerId)}>{usage.ownerName}</a><span>{formatLabel(usage.moduleId)}{usage.usageRole === undefined ? "" : ` / ${formatLabel(usage.usageRole)}`}</span></li>)}</ul>}</section>
          <div className="asset-library__actions"><Button variant="default" disabled={busy || libraryError !== null} onClick={() => { setReplacementError(null); setReplacement({ item: selected, file: null, impact: null }); }} type="button">Replace file</Button><Button aria-describedby={totalUsageCount(selected) > 0 ? `asset-delete-help-${selected.id}` : undefined} variant="light" color="red" disabled={busy || libraryError !== null || totalUsageCount(selected) > 0} onClick={() => { setDeleteError(null); setDeleteItem(selected); }} type="button">Delete asset</Button></div>
          {totalUsageCount(selected) > 0 ? <p className="asset-library__delete-help" id={`asset-delete-help-${selected.id}`}>Remove {formatCount(totalUsageCount(selected), { one: "saved use", other: "saved uses" })} before deleting this asset.</p> : null}
        </div>}
      </div> : null}

      <DirtyNavigationDialog
        pending={busy}
        error={selectionError}
        onDismissError={() => setSelectionError(null)}
        onCancel={() => { setPendingSelectedId(null); setSelectionError(null); }}
        onDiscard={discardAndContinueSelection}
        onSave={() => void saveAndContinueSelection()}
        open={pendingSelectedId !== null}
        saveAvailable
        saveLabel="Save and continue"
        summary="Asset details have unsaved changes."
        title="Switch assets with unsaved changes?"
      />
      <AssetPicker assetApi={assetApi} compatibleMediaTypes={["image", "gif", "video", "audio", "font"]} managementApi={managementApi} onCancel={() => setPickerOpen(false)} onSelect={() => { setPickerOpen(false); void loadItems(); }} open={pickerOpen} />
      <ReplacementDialog error={replacementError} restoreFocusFallbackRef={libraryHeadingRef} busy={busy} onCancel={() => setReplacement(null)} onConfirm={confirmReplacement} onFileChange={(file) => { setReplacementError(null); setReplacement((current) => current === null ? null : { ...current, file, impact: null }); }} onReview={reviewReplacement} state={replacement} />
      <DestructiveConfirmationDialog actionLabel="Delete asset" consequences="The file and its metadata will be removed permanently." onCancel={() => setDeleteItem(null)} onConfirm={confirmDelete} pending={busy} error={deleteError} targetId={deleteItem?.id ?? "none"} restoreFocusFallbackRef={libraryHeadingRef} open={deleteItem !== null} recovery={null} scope={deleteItem?.displayName ?? "Selected asset"} title={`Delete ${deleteItem?.displayName ?? "asset"}?`} />
    </div>
  );
}

function ReplacementDialog(props: { readonly error: ActionableManagementError | null; readonly restoreFocusFallbackRef: import("react").RefObject<HTMLElement | null>; readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => Promise<void>; readonly onFileChange: (file: File | null) => void; readonly onReview: () => Promise<void>; readonly state: ReplacementState | null }) {
  const reviewed = props.state?.impact !== null && props.state?.impact !== undefined;
  const title = reviewed ? `Replace ${props.state?.item.displayName}?` : `Choose replacement for ${props.state?.item.displayName ?? "asset"}`;
  return <ModalSurface labelledBy="asset-replacement-title" onCancel={props.onCancel} open={props.state !== null} pending={props.busy} restoreFocusFallbackRef={props.restoreFocusFallbackRef}><div className="asset-library__modal"><header><p className="management-eyebrow">Global asset change</p><ManagementModalTitle>{title}</ManagementModalTitle><p>The stable asset ID stays the same, so every linked module will resolve to the new file.</p></header>{props.error === null ? null : <ManagementErrorBanner error={props.error} />}{reviewed ? <><dl className="management-confirmation-details"><div><dt>Affected usages</dt><dd>{(props.state?.impact?.usage.totalUsageCount ?? 0) + (props.state?.impact?.owners.filter(owner => owner.moduleId !== "alerts").length ?? 0)}</dd></div><div><dt>Replacement file</dt><dd>{props.state?.file?.name}</dd></div></dl><ul className="asset-library__impact-usages">{props.state?.impact?.usage.usages.map(usage => <li key={usage.alertId}>{props.busy ? <span>{usage.alertName}</span> : <a href={usageHref(usage)}>{usage.alertName}</a>}</li>)}{props.state?.impact?.owners.filter(owner => owner.moduleId !== "alerts").map(owner => <li key={`${owner.moduleId}-${owner.ownerId}-${owner.variantId}-${owner.usageRole}`}>{props.busy ? <span>{owner.ownerName}</span> : <a href={moduleUsageHref(owner.moduleId, owner.ownerId)}>{owner.ownerName}</a>} / {formatLabel(owner.moduleId)}{owner.usageRole === undefined ? "" : ` / ${formatLabel(owner.usageRole)}`}</li>)}</ul>{props.state?.impact?.warnings.map((warning) => <p className="asset-library__warning" key={warning}>{warning}</p>)}</> : <TextInput label="Replacement file" disabled={props.busy} accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,.ttf,.otf,.woff,.woff2" onChange={(event) => props.onFileChange(event.currentTarget.files?.[0] ?? null)} type="file" />}<div className="management-modal__actions"><Button variant="default" disabled={props.busy} onClick={props.onCancel} type="button">Cancel</Button>{reviewed ? <Button disabled={props.busy} onClick={props.onConfirm} type="button">Replace everywhere</Button> : <Button disabled={props.busy || props.state?.file === null} onClick={props.onReview} type="button">Review replacement</Button>}</div></div></ModalSurface>;
}

function FilterSelect<T extends string>({ label, onChange, options, value }: { readonly label: string; readonly onChange: (value: T) => void; readonly options: readonly T[]; readonly value: T }) {
  return <NativeSelect label={label} onChange={(event) => onChange(event.currentTarget.value as T)} value={value} data={options.map(option => ({ value: option, label: formatLabel(option) }))} />;
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

function totalUsageCount(item: AssetLibraryItem): number {
  return item.usage.totalUsageCount + (item.moduleUsages?.length ?? 0);
}

function moduleUsageHref(moduleId: string, ownerId: string): string {
  if (moduleId === "screen-effects") return `/manage/modules/screen-effects/editor/${encodeURIComponent(ownerId)}`;
  if (moduleId === "music") return "/manage/modules/music";
  if (moduleId === "timers") return `/manage/modules/timers?ownerId=${encodeURIComponent(ownerId)}`;
  return "/manage/modules";
}

function healthTone(health: AssetLibraryItem["health"]): "positive" | "warning" | "negative" { return health === "available" ? "positive" : health === "missing" ? "warning" : "negative"; }
function formatLabel(value: string): string { return formatIdentifierLabel(value); }
function formatDuration(value: number): string { return `${(value / 1000).toFixed(1)} s`; }
