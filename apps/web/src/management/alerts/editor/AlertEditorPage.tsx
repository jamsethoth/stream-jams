import {
  getAlertEditorAffectedProfileIds,
  type ActionableManagementError,
  type AlertEditorDocument,
  type AlertLayer,
  type AlertSetDetail,
  type AssetMediaType,
  type TargetProfileId
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import { AssetPicker } from "../../assets/AssetPicker.js";
import { ManagementErrorBanner } from "../../foundation/ManagementErrorBanner.js";
import { ModalSurface } from "../../foundation/ModalSurface.js";
import { StatusBadge } from "../../foundation/StatusBadge.js";
import type { ManagementApi } from "../../management-api.js";
import { useDirtyNavigationSource } from "../../navigation/dirty-navigation.js";
import { AlertCanvas } from "./AlertCanvas.js";
import {
  addLayer,
  applyEditorUpdate,
  createEditorState,
  deleteLayer,
  duplicateLayer,
  isEditorDirty,
  markEditorSaved,
  redoEditorUpdate,
  reorderLayer,
  revertEditorChanges,
  toggleLayerVisible,
  undoEditorUpdate,
  updateLayer,
  updateLayerGeometry,
  type AlertEditorState
} from "./editor-state.js";
import "./alert-editor-page.css";

export type AlertEditorPageApi = Pick<
  ManagementApi,
  | "getAlertEditorDocument"
  | "getAlertSet"
  | "getAssetChangeImpact"
  | "listAssetLibraryItems"
  | "deleteAsset"
  | "updateAssetMetadata"
  | "saveAlertEditorDocument"
  | "sendAlertEditorTest"
>;

export interface AlertEditorPageProps {
  readonly alertId: string;
  readonly assetApi: AssetApi;
  readonly managementApi: AlertEditorPageApi;
  readonly onBack: () => void;
  readonly onOpenAlert: (alertId: string, profileId: TargetProfileId) => void;
  readonly targetProfileId?: string | undefined;
}

type InspectorTab = "layers" | "alert" | "event";
type PickerState = { readonly layerId: string | null; readonly type: "image" | "video" | "audio" };
type SaveWarningState = {
  readonly rejectNavigation?: (cause: unknown) => void;
  readonly resolveNavigation?: (saved: boolean) => void;
};

export function AlertEditorPage(props: AlertEditorPageProps) {
  const [editor, setEditor] = useState<AlertEditorState | null>(null);
  const [setDetail, setSetDetail] = useState<AlertSetDetail | null>(null);
  const [profileId, setProfileId] = useState<TargetProfileId>(props.targetProfileId === "vertical" ? "vertical" : "landscape");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>("layers");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(100);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [sampleDraft, setSampleDraft] = useState("{}");
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeTts, setIncludeTts] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewRunId, setPreviewRunId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [saveWarning, setSaveWarning] = useState<SaveWarningState | null>(null);

  useEffect(() => {
    let active = true;
    setEditor(null);
    setSetDetail(null);
    setError(null);
    void props.managementApi.getAlertEditorDocument(props.alertId).then(async (document) => {
      const loadedSetDetail = await props.managementApi.getAlertSet(document.setId);
      if (!active) return;
      setEditor(createEditorState(document));
      setSelectedLayerId(document.layers[0]?.id ?? null);
      const firstSample = document.samplePayloads[0] ?? null;
      setSampleId(firstSample?.id ?? null);
      setSampleDraft(JSON.stringify(firstSample?.payload ?? {}, null, 2));
      setSetDetail(loadedSetDetail);
    }).catch((cause: unknown) => {
      if (active) setError(actionableError("The alert editor could not be opened", cause, "Return to Alerts and choose the alert again."));
    });
    return () => { active = false; };
  }, [props.alertId, props.managementApi]);

  const save = useCallback(async (confirmLiveImpact = false) => {
    if (editor === null) return;
    const submittedDocument = editor.document;
    setBusy(true);
    setError(null);
    try {
      const saved = await props.managementApi.saveAlertEditorDocument(
        props.alertId,
        submittedDocument,
        confirmLiveImpact
      );
      setEditor((current) => {
        if (current === null) return null;
        return current.document === submittedDocument
          ? markEditorSaved({ ...current, document: saved })
          : { ...current, savedDocument: saved };
      });
      setNotice("Alert saved.");
    } catch (cause) {
      setError(actionableError("The alert was not saved", cause, "Review the selected profile and highlighted fields, then try again."));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [editor, props.alertId, props.managementApi]);

  const requiresLiveImpactConfirmation = useCallback(async () => {
    if (editor === null || !isEditorDirty(editor) || affectedProfileIds(editor).length === 0) return false;
    try {
      const latestSetDetail = await props.managementApi.getAlertSet(editor.document.setId);
      setSetDetail(latestSetDetail);
      return latestSetDetail.overview.active;
    } catch (cause) {
      setError(actionableError(
        "The alert set status could not be checked",
        cause,
        "Confirm the local service is running, then try saving again."
      ));
      throw cause;
    }
  }, [editor, props.managementApi]);

  const discard = useCallback(() => {
    setEditor((current) => current === null ? null : revertEditorChanges(current));
    setError(null);
    setNotice("Unsaved changes reverted.");
  }, []);

  const saveForNavigation = useCallback(async () => {
    if (await requiresLiveImpactConfirmation()) {
      return new Promise<boolean>((resolve, reject) => setSaveWarning({
        rejectNavigation: reject,
        resolveNavigation: resolve
      }));
    }
    await save(false);
    return true;
  }, [requiresLiveImpactConfirmation, save]);

  useDirtyNavigationSource({
    id: `alert-editor:${props.alertId}`,
    dirty: editor !== null && isEditorDirty(editor),
    summary: editor !== null && hasLiveSaveImpact(editor, setDetail)
      ? `This active alert has unsaved changes that can affect ${affectedProfileLabels(editor).join(" and ")} live output.`
      : "This alert has unsaved layer or profile changes.",
    save: saveForNavigation,
    discard
  });

  const document = editor?.document ?? null;
  const selectedLayer = document?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const profile = document?.targetProfiles.find((candidate) => candidate.id === profileId) ?? null;
  const samplePayload = useMemo(() => parseSample(sampleDraft), [sampleDraft]);
  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (setDetail?.inventory ?? []).filter((alert) => query === "" || `${alert.name} ${alert.eventType}`.toLowerCase().includes(query));
  }, [search, setDetail]);

  function updateDocument(update: (document: AlertEditorDocument) => AlertEditorDocument) {
    setEditor((current) => current === null ? null : applyEditorUpdate(current, update));
    setPreview(false);
    setNotice(null);
  }

  function chooseSample(nextSampleId: string) {
    if (document === null) return;
    const sample = document.samplePayloads.find((candidate) => candidate.id === nextSampleId);
    if (sample === undefined) return;
    setSampleId(sample.id);
    setSampleDraft(JSON.stringify(sample.payload, null, 2));
    setSampleError(null);
    setPreview(false);
  }

  function previewLocally() {
    if (samplePayload === null) {
      setSampleError("Enter a valid JSON object before previewing.");
      return;
    }
    setPreview(true);
    setPreviewRunId((current) => current + 1);
    setNotice("Local preview is running.");
  }

  async function sendTest() {
    if (document === null || samplePayload === null || profile === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.managementApi.sendAlertEditorTest(props.alertId, {
        document,
        targetProfileId: profileId,
        samplePayload,
        includeAudio,
        includeTts
      });
      setNotice(`Queued on ${profileLabel(profileId)}. Reference ${result.referenceId}.`);
    } catch (cause) {
      setError(actionableError("The alert test was not sent", cause, `Connect and review the ${profileLabel(profileId)} output, then try again.`));
    } finally {
      setBusy(false);
    }
  }

  async function requestSave() {
    try {
      if (await requiresLiveImpactConfirmation()) {
        setSaveWarning({});
        return;
      }
      await save(false);
    } catch {
      // Save and status-check failures are rendered through the page error banner.
    }
  }

  function cancelSaveWarning() {
    saveWarning?.resolveNavigation?.(false);
    setSaveWarning(null);
  }

  async function confirmSaveWarning() {
    const pendingWarning = saveWarning;
    try {
      await save(true);
      setSaveWarning(null);
      pendingWarning?.resolveNavigation?.(true);
    } catch (cause) {
      setSaveWarning(null);
      pendingWarning?.rejectNavigation?.(cause);
    }
  }

  function addSimpleLayer(type: "text" | "tts") {
    if (document === null) return;
    const id = nextLayerId(document, type);
    const layer = type === "text"
      ? { ...layerBase(id, "Text", type, document.layers.length), template: "{userName}" }
      : { ...layerBase(id, "Text to speech", type, document.layers.length), template: "{userName}" };
    updateDocument((current) => addLayer(current, layer, type === "text" ? defaultGeometryByProfile() : {}));
    setSelectedLayerId(id);
    setTab("layers");
  }

  function applyAsset(assetId: string) {
    if (picker === null || document === null) return;
    if (picker.layerId !== null) {
      updateDocument((current) => updateLayer(current, picker.layerId!, (layer) =>
        "assetId" in layer ? { ...layer, assetId } : layer));
      setPicker(null);
      return;
    }
    const id = nextLayerId(document, picker.type);
    const order = document.layers.length;
    const layer: AlertLayer = picker.type === "image"
      ? { ...layerBase(id, "Image", "image", order), assetId }
      : picker.type === "video"
        ? { ...layerBase(id, "Video or GIF", "video", order), assetId }
        : { ...layerBase(id, "Audio", "audio", order), assetId, volume: 1 };
    updateDocument((current) => addLayer(current, layer, picker.type === "audio" ? {} : defaultGeometryByProfile()));
    setSelectedLayerId(id);
    setTab("layers");
    setPicker(null);
  }

  if (document === null || editor === null || profile === null) {
    return error === null
      ? <p className="management-empty" role="status">Loading alert editor...</p>
      : <div className="alert-editor-page alert-editor-page--load-error"><button className="alert-editor-page__back" onClick={props.onBack} type="button">Back to alerts</button><ManagementErrorBanner error={error} /></div>;
  }

  const canSend = profile.enabled && profile.reviewState === "ready" && samplePayload !== null && !busy;
  return (
    <div className="alert-editor-page">
      <header className="alert-editor-page__header">
        <div>
          <button className="alert-editor-page__back" onClick={props.onBack} type="button">Back to alerts</button>
          <div className="alert-editor-page__title-row">
            <h2>{document.name}</h2>
            <StatusBadge label={isEditorDirty(editor) ? "Unsaved" : "Saved"} tone={isEditorDirty(editor) ? "warning" : "positive"} />
            <StatusBadge label={document.enabled ? "Alert enabled" : "Alert disabled"} tone={document.enabled ? "info" : "neutral"} />
          </div>
          <p>{formatEventType(document.eventType)} / {document.kind === "default" ? "Default alert" : "Variation"}</p>
        </div>
        <div className="alert-editor-page__header-actions">
          <button className="button button--secondary" disabled={!isEditorDirty(editor) || busy} onClick={discard} type="button">Revert</button>
          <button className="button button--secondary" onClick={previewLocally} type="button">Preview</button>
          <button className="button button--secondary" disabled={!canSend} onClick={() => void sendTest()} type="button">Send test</button>
          <button className="button button--primary" disabled={!isEditorDirty(editor) || busy} onClick={() => void requestSave()} type="button">Save</button>
        </div>
      </header>

      {error === null ? null : <ManagementErrorBanner error={error} />}
      {notice === null ? null : <p className="alert-editor-page__notice" role="status">{notice}</p>}

      <div className="alert-editor-page__workspace">
        <aside className="alert-editor-page__alerts" aria-label="Alerts in selected set">
          <div className="alert-editor-page__panel-heading">
            <div><strong>{setDetail?.overview.name ?? "Alert set"}</strong><span>{setDetail?.inventory.length ?? 0} alerts</span></div>
          </div>
          <label className="alert-editor-page__search"><span>Search alerts</span><input aria-label="Search alerts" onChange={(event) => setSearch(event.currentTarget.value)} type="search" value={search} /></label>
          <nav aria-label="Alert editor selection">
            {visibleAlerts.map((alert) => (
              <button
                aria-current={alert.id === document.id ? "page" : undefined}
                key={alert.id}
                onClick={() => props.onOpenAlert(alert.id, profileId)}
                type="button"
              >
                <span>{alert.name}</span>
                <small>{formatEventType(alert.eventType)} / {alert.enabled ? "Enabled" : "Disabled"}</small>
              </button>
            ))}
          </nav>
          {visibleAlerts.length === 0 ? <p className="alert-editor-page__empty">No matching alerts.</p> : null}
        </aside>

        <main className="alert-editor-page__stage">
          <div className="alert-editor-page__stage-toolbar">
            <div aria-label="Target profile" className="alert-editor-page__segments">
              {document.targetProfiles.map((candidate) => (
                <button aria-pressed={candidate.id === profileId} key={candidate.id} onClick={() => setProfileId(candidate.id)} type="button">
                  {profileLabel(candidate.id)}
                  {candidate.reviewState === "needs-review" ? <span>Needs review</span> : candidate.enabled ? <span>Active</span> : <span>Off</span>}
                </button>
              ))}
            </div>
            <div className="alert-editor-page__canvas-tools">
              <button aria-label="Undo" className="button button--secondary button--compact" disabled={editor.past.length === 0} onClick={() => setEditor(undoEditorUpdate(editor))} type="button">Undo</button>
              <button aria-label="Redo" className="button button--secondary button--compact" disabled={editor.future.length === 0} onClick={() => setEditor(redoEditorUpdate(editor))} type="button">Redo</button>
              <button aria-label="Zoom out" className="button button--secondary button--compact" disabled={zoom <= 50} onClick={() => setZoom((current) => Math.max(50, current - 25))} type="button">-</button>
              <output aria-label="Canvas zoom">{zoom}%</output>
              <button aria-label="Zoom in" className="button button--secondary button--compact" disabled={zoom >= 150} onClick={() => setZoom((current) => Math.min(150, current + 25))} type="button">+</button>
              <button className="button button--secondary button--compact" onClick={() => setZoom(100)} type="button">100%</button>
            </div>
          </div>
          {profile.reviewState === "needs-review" ? (
            <div className="alert-editor-page__profile-warning" role="status">
              <strong>Needs review</strong>
              <span>This generated layout is editable but cannot be sent live until you mark it reviewed and enable it.</span>
            </div>
          ) : null}
          <AlertCanvas
            assetApi={props.assetApi}
            document={document}
            onGeometryChange={(layerId, geometry) => updateDocument((current) => updateLayerGeometry(current, profileId, layerId, geometry))}
            onSelectLayer={(layerId) => { setSelectedLayerId(layerId); setTab("layers"); }}
            preview={preview}
            previewRunId={previewRunId}
            profileId={profileId}
            samplePayload={samplePayload ?? {}}
            selectedLayerId={selectedLayerId}
            zoom={zoom}
          />
        </main>

        <aside className="alert-editor-page__inspector" aria-label="Alert inspector">
          <div className="alert-editor-page__tabs" role="tablist" aria-label="Inspector sections">
            {(["layers", "alert", "event"] as const).map((value) => (
              <button aria-selected={tab === value} key={value} onClick={() => setTab(value)} role="tab" type="button">{capitalize(value)}</button>
            ))}
          </div>
          {tab === "layers" ? (
            <LayerInspector
              document={document}
              onAddAsset={(type) => setPicker({ layerId: null, type })}
              onAddSimple={addSimpleLayer}
              onChange={updateDocument}
              onChooseAsset={(layer) => setPicker({ layerId: layer.id, type: layer.type as "image" | "video" | "audio" })}
              onSelect={setSelectedLayerId}
              profileId={profileId}
              selectedLayer={selectedLayer}
            />
          ) : tab === "alert" ? (
            <AlertInspector document={document} onChange={updateDocument} profileId={profileId} />
          ) : (
            <EventInspector
              document={document}
              includeAudio={includeAudio}
              includeTts={includeTts}
              onIncludeAudio={setIncludeAudio}
              onIncludeTts={setIncludeTts}
              onPreview={previewLocally}
              onSample={chooseSample}
              onSampleDraft={(value) => {
                setSampleDraft(value);
                setSampleError(parseSample(value) === null ? "Sample payload must be a valid JSON object." : null);
                setPreview(false);
              }}
              onSend={() => void sendTest()}
              sampleDraft={sampleDraft}
              sampleError={sampleError}
              sampleId={sampleId}
              sendDisabled={!canSend}
            />
          )}
        </aside>
      </div>

      <AssetPicker
        assetApi={props.assetApi}
        compatibleMediaTypes={picker === null ? [] : compatibleMediaTypes(picker.type)}
        managementApi={props.managementApi}
        onCancel={() => setPicker(null)}
        onSelect={applyAsset}
        open={picker !== null}
        selectedAssetId={picker?.layerId === null || picker?.layerId === undefined ? null : assetIdForLayer(document, picker.layerId)}
      />
      <ModalSurface labelledBy="active-alert-save-warning-title" onCancel={cancelSaveWarning} open={saveWarning !== null}>
        <div className="alert-editor-page__save-warning">
          <div>
            <h2 id="active-alert-save-warning-title">Save changes to active alert?</h2>
            <p>This alert belongs to the active set. Saving can change live output immediately.</p>
          </div>
          <dl>
            <div><dt>Event</dt><dd>{formatEventType(document.eventType)} events</dd></div>
            <div><dt>Profiles</dt><dd>{affectedProfileLabels(editor).join(", ") || "None"}</dd></div>
          </dl>
          <div className="management-modal__actions">
            <button className="button button--secondary" disabled={busy} onClick={cancelSaveWarning} type="button">Cancel</button>
            <button className="button button--primary" disabled={busy} onClick={() => void confirmSaveWarning()} type="button">Save changes</button>
          </div>
        </div>
      </ModalSurface>
    </div>
  );
}

function hasLiveSaveImpact(editor: AlertEditorState, setDetail: AlertSetDetail | null): boolean {
  if (setDetail?.overview.active !== true || !isEditorDirty(editor)) return false;
  return affectedProfileIds(editor).length > 0;
}

function affectedProfileIds(editor: AlertEditorState): TargetProfileId[] {
  return [...getAlertEditorAffectedProfileIds(editor.savedDocument, editor.document)];
}

function affectedProfileLabels(editor: AlertEditorState): string[] {
  return affectedProfileIds(editor).map(profileLabel);
}

function LayerInspector({
  document,
  onAddAsset,
  onAddSimple,
  onChange,
  onChooseAsset,
  onSelect,
  profileId,
  selectedLayer
}: {
  readonly document: AlertEditorDocument;
  readonly onAddAsset: (type: "image" | "video" | "audio") => void;
  readonly onAddSimple: (type: "text" | "tts") => void;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onChooseAsset: (layer: AlertLayer) => void;
  readonly onSelect: (layerId: string) => void;
  readonly profileId: TargetProfileId;
  readonly selectedLayer: AlertLayer | null;
}) {
  const layout = selectedLayer === null ? undefined : document.targetProfiles.find((profile) => profile.id === profileId)?.layerLayouts.find((candidate) => candidate.layerId === selectedLayer.id);
  return (
    <div className="alert-editor-inspector">
      <section>
        <div className="alert-editor-inspector__heading"><h3>Layers</h3><span>{document.layers.length}</span></div>
        <div className="alert-editor-inspector__add-row" aria-label="Add layer">
          <button onClick={() => onAddSimple("text")} type="button">Text</button>
          <button onClick={() => onAddAsset("image")} type="button">Image</button>
          <button onClick={() => onAddAsset("video")} type="button">Video/GIF</button>
          <button onClick={() => onAddAsset("audio")} type="button">Audio</button>
          <button onClick={() => onAddSimple("tts")} type="button">TTS</button>
        </div>
        <div className="alert-editor-inspector__layer-list">
          {document.layers.map((layer) => (
            <div className={selectedLayer?.id === layer.id ? "is-selected" : undefined} key={layer.id}>
              <button onClick={() => onSelect(layer.id)} type="button"><span>{layer.name}</span><small>{layerTypeLabel(layer.type)}</small></button>
              <button aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} onClick={() => onChange((current) => toggleLayerVisible(current, layer.id))} type="button">{layer.visible ? "On" : "Off"}</button>
            </div>
          ))}
        </div>
      </section>
      {selectedLayer === null ? <p className="alert-editor-page__empty">Select a layer to edit it.</p> : (
        <section className="alert-editor-inspector__controls">
          <h3>{selectedLayer.name}</h3>
          <label><span>Layer name</span><input onChange={(event) => { const value = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, name: value }))); }} value={selectedLayer.name} /></label>
          {(selectedLayer.type === "text" || selectedLayer.type === "tts") ? (
            <label><span>{selectedLayer.type === "text" ? "Message template" : "TTS template"}</span><textarea aria-label={selectedLayer.type === "text" ? "Message template" : "TTS template"} onChange={(event) => { const value = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => layer.type === selectedLayer.type ? { ...layer, template: value } : layer)); }} value={selectedLayer.template} /></label>
          ) : null}
          {(selectedLayer.type === "image" || selectedLayer.type === "video" || selectedLayer.type === "audio") ? (
            <div className="alert-editor-inspector__asset"><span>Asset</span><code>{selectedLayer.assetId}</code><button className="button button--secondary button--compact" onClick={() => onChooseAsset(selectedLayer)} type="button">Choose asset</button></div>
          ) : null}
          {selectedLayer.type === "audio" ? (
            <label><span>Volume {Math.round(selectedLayer.volume * 100)}%</span><input max="1" min="0" onChange={(event) => { const value = Number(event.currentTarget.value); onChange((current) => updateLayer(current, selectedLayer.id, (layer) => layer.type === "audio" ? { ...layer, volume: value } : layer)); }} step="0.05" type="range" value={selectedLayer.volume} /></label>
          ) : null}
          {layout === undefined ? null : (
            <fieldset className="alert-editor-inspector__geometry">
              <legend>Position and size</legend>
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field}><span>{field.toUpperCase()}</span><input min="0" onChange={(event) => { const value = Number(event.currentTarget.value); onChange((current) => updateLayerGeometry(current, profileId, selectedLayer.id, { [field]: value })); }} type="number" value={layout[field]} /></label>
              ))}
            </fieldset>
          )}
          <fieldset className="alert-editor-inspector__animation"><legend>Animation preset</legend><label><span>Entrance</span><select onChange={(event) => { const entrance = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, entrance } }))); }} value={selectedLayer.animation.entrance}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-up">Slide up</option></select></label><label><span>Exit</span><select onChange={(event) => { const exit = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, exit } }))); }} value={selectedLayer.animation.exit}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-down">Slide down</option></select></label></fieldset>
          <div className="alert-editor-inspector__actions">
            <button className="button button--secondary button--compact" disabled={selectedLayer.order === 0} onClick={() => onChange((current) => reorderLayer(current, selectedLayer.id, selectedLayer.order - 1))} type="button">Move up</button>
            <button className="button button--secondary button--compact" disabled={selectedLayer.order === document.layers.length - 1} onClick={() => onChange((current) => reorderLayer(current, selectedLayer.id, selectedLayer.order + 1))} type="button">Move down</button>
            <button className="button button--secondary button--compact" onClick={() => onChange((current) => duplicateLayer(current, selectedLayer.id, nextLayerId(current, selectedLayer.type)))} type="button">Duplicate</button>
            <button className="button button--danger-quiet button--compact" onClick={() => onChange((current) => deleteLayer(current, selectedLayer.id))} type="button">Delete</button>
          </div>
        </section>
      )}
    </div>
  );
}

function AlertInspector({ document, onChange, profileId }: { readonly document: AlertEditorDocument; readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void; readonly profileId: TargetProfileId }) {
  const profile = document.targetProfiles.find((candidate) => candidate.id === profileId)!;
  return (
    <div className="alert-editor-inspector alert-editor-inspector__controls">
      <h3>Alert settings</h3>
      <label><span>Alert name</span><input onChange={(event) => { const name = event.currentTarget.value; onChange((current) => ({ ...current, name })); }} value={document.name} /></label>
      <label><span>Duration (milliseconds)</span><input min="100" onChange={(event) => { const durationMs = Number(event.currentTarget.value); onChange((current) => ({ ...current, durationMs })); }} type="number" value={document.durationMs} /></label>
      <label className="alert-editor-inspector__check"><input checked={document.enabled} onChange={(event) => { const enabled = event.currentTarget.checked; onChange((current) => ({ ...current, enabled })); }} type="checkbox" /><span>Alert enabled</span></label>
      <section className="alert-editor-inspector__profile-state">
        <div><strong>{profileLabel(profileId)} profile</strong><StatusBadge label={profile.reviewState === "ready" ? "Reviewed" : "Needs review"} tone={profile.reviewState === "ready" ? "positive" : "warning"} /></div>
        {profile.reviewState === "needs-review" ? <button className="button button--secondary" onClick={() => onChange((current) => updateProfile(current, profileId, { reviewState: "ready" }))} type="button">Mark profile reviewed</button> : null}
        <label className="alert-editor-inspector__check"><input checked={profile.enabled} disabled={profile.reviewState !== "ready"} onChange={(event) => { const enabled = event.currentTarget.checked; onChange((current) => updateProfile(current, profileId, { enabled })); }} type="checkbox" /><span>Use this profile for live alerts</span></label>
      </section>
      <dl className="alert-editor-inspector__facts"><div><dt>Provider type</dt><dd>{document.providerKind}</dd></div><div><dt>Event</dt><dd>{formatEventType(document.eventType)}</dd></div><div><dt>Conditions</dt><dd>{document.conditions.length}</dd></div></dl>
    </div>
  );
}

function EventInspector(props: {
  readonly document: AlertEditorDocument;
  readonly includeAudio: boolean;
  readonly includeTts: boolean;
  readonly onIncludeAudio: (value: boolean) => void;
  readonly onIncludeTts: (value: boolean) => void;
  readonly onPreview: () => void;
  readonly onSample: (sampleId: string) => void;
  readonly onSampleDraft: (value: string) => void;
  readonly onSend: () => void;
  readonly sampleDraft: string;
  readonly sampleError: string | null;
  readonly sampleId: string | null;
  readonly sendDisabled: boolean;
}) {
  return (
    <div className="alert-editor-inspector alert-editor-inspector__controls">
      <h3>Event sample</h3>
      <label><span>Sample payload</span><select onChange={(event) => props.onSample(event.currentTarget.value)} value={props.sampleId ?? ""}>{props.document.samplePayloads.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label>
      <label><span>Session payload (JSON)</span><textarea aria-invalid={props.sampleError !== null} onChange={(event) => props.onSampleDraft(event.currentTarget.value)} rows={12} value={props.sampleDraft} /></label>
      {props.sampleError === null ? <p>Session edits are used only for preview and testing.</p> : <p className="alert-editor-inspector__field-error" role="alert">{props.sampleError}</p>}
      <fieldset className="alert-editor-inspector__audio"><legend>Test playback</legend><label className="alert-editor-inspector__check"><input checked={props.includeAudio} onChange={(event) => props.onIncludeAudio(event.currentTarget.checked)} type="checkbox" /><span>Include audio</span></label><label className="alert-editor-inspector__check"><input checked={props.includeTts} onChange={(event) => props.onIncludeTts(event.currentTarget.checked)} type="checkbox" /><span>Include TTS</span></label></fieldset>
      <div className="alert-editor-inspector__actions"><button className="button button--secondary" onClick={props.onPreview} type="button">Preview</button><button className="button button--primary" disabled={props.sendDisabled} onClick={props.onSend} type="button">Send test</button></div>
    </div>
  );
}

const animation = { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };

function layerBase<T extends AlertLayer["type"]>(id: string, name: string, type: T, order: number) {
  return { id, name, type, visible: true, order, animation };
}

function defaultGeometryByProfile() {
  return {
    landscape: { x: 610, y: 720, width: 700, height: 160 },
    vertical: { x: 190, y: 1180, width: 700, height: 160 }
  } as const;
}

function nextLayerId(document: AlertEditorDocument, type: AlertLayer["type"]): string {
  let suffix = document.layers.length + 1;
  while (document.layers.some((layer) => layer.id === `layer-${type}-${suffix}`)) suffix += 1;
  return `layer-${type}-${suffix}`;
}

function updateProfile(document: AlertEditorDocument, profileId: TargetProfileId, update: { readonly enabled?: boolean; readonly reviewState?: "ready" | "needs-review" }): AlertEditorDocument {
  return { ...document, targetProfiles: document.targetProfiles.map((profile) => profile.id === profileId ? { ...profile, ...update } : profile) };
}

function parseSample(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function compatibleMediaTypes(type: PickerState["type"]): readonly AssetMediaType[] {
  return type === "image" ? ["image"] : type === "video" ? ["gif", "video"] : ["audio"];
}

function assetIdForLayer(document: AlertEditorDocument, layerId: string): string | null {
  const layer = document.layers.find((candidate) => candidate.id === layerId);
  return layer !== undefined && "assetId" in layer ? layer.assetId : null;
}

function layerTypeLabel(type: AlertLayer["type"]): string {
  return type === "tts" ? "TTS" : type === "video" ? "Video/GIF" : capitalize(type);
}

function formatEventType(value: string): string {
  return value.split("_").map(capitalize).join(" ");
}

function profileLabel(profileId: TargetProfileId): string {
  return profileId === "landscape" ? "Landscape" : "Vertical";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function actionableError(summary: string, cause: unknown, nextStep: string): ActionableManagementError {
  const message = cause instanceof Error ? cause.message : "The request failed for an unknown reason.";
  const referenceMatch = /(?:reference|id)[: ]+([A-Za-z0-9_-]+)/iu.exec(message);
  return {
    summary,
    cause: message,
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId: referenceMatch?.[1] ?? null,
    correction: null
  };
}
