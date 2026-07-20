import {
  createAlertTemplateContext,
  getAlertEditorAffectedProfileIds,
  validateAlertSamplePayload,
  type ActionableManagementError,
  type AlertEditorDocument,
  type AlertLayer,
  type AlertSetDetail,
  type AssetMediaType,
  type RegisteredProviderView,
  type TargetProfileId
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AssetApi } from "../../assets/asset-api.js";
import { AssetPicker } from "../../assets/AssetPicker.js";
import { Breadcrumbs } from "../../foundation/Breadcrumbs.js";
import { ManagementErrorBanner } from "../../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../../foundation/ManagementToast.js";
import { ModalSurface } from "../../foundation/ModalSurface.js";
import { StatusBadge } from "../../foundation/StatusBadge.js";
import type { ManagementApi } from "../../management-api.js";
import { useDirtyNavigationSource } from "../../navigation/dirty-navigation.js";
import { AlertCanvas, type CanvasBackground } from "./AlertCanvas.js";
import {
  addLayer,
  applyEditorUpdate,
  copyAlertDesign,
  copyProfileLayout,
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
  type AlertEditorState,
  type CanvasViewState
} from "./editor-state.js";
import "./alert-editor-page.css";

export type AlertEditorPageApi = Pick<
  ManagementApi,
  | "getAlertEditorDocument"
  | "getAlertSet"
  | "listRegisteredProviders"
  | "getAssetChangeImpact"
  | "listAssetLibraryItems"
  | "deleteAsset"
  | "updateAssetMetadata"
  | "saveAlertEditorDocument"
  | "sendAlertEditorTest"
> & Partial<Pick<ManagementApi, "reportAlertEditorError">>;

export interface AlertEditorPageProps {
  readonly alertId: string;
  readonly assetApi: AssetApi;
  readonly managementApi: AlertEditorPageApi;
  readonly onBack: (setId: string | undefined) => void;
  readonly onOpenAlert: (alertId: string, profileId: TargetProfileId) => void;
  readonly targetProfileId?: string | undefined;
}

type InspectorTab = "layers" | "alert" | "event";
type PickerState = { readonly layerId: string | null; readonly type: "image" | "video" | "audio" };
type EditorCondition = AlertEditorDocument["conditions"][number];
type ReportableActionError = ActionableManagementError & { readonly referenceId: string };
type SaveWarningState = {
  readonly rejectNavigation?: (cause: unknown) => void;
  readonly resolveNavigation?: (saved: boolean) => void;
};

export function AlertEditorPage(props: AlertEditorPageProps) {
  const [editor, setEditor] = useState<AlertEditorState | null>(null);
  const [setDetail, setSetDetail] = useState<AlertSetDetail | null>(null);
  const [loadedSetId, setLoadedSetId] = useState<string | undefined>(undefined);
  const [ttsProviders, setTtsProviders] = useState<readonly RegisteredProviderView[]>([]);
  const [ttsProvidersLoaded, setTtsProvidersLoaded] = useState(false);
  const [ttsProviderError, setTtsProviderError] = useState<ActionableManagementError | null>(null);
  const [profileId, setProfileId] = useState<TargetProfileId>(props.targetProfileId === "vertical" ? "vertical" : "landscape");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>("layers");
  const [search, setSearch] = useState("");
  const [canvasViews, setCanvasViews] = useState<Partial<Record<TargetProfileId, CanvasViewState>>>({});
  const [fitRequestId, setFitRequestId] = useState(0);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasBackground, setCanvasBackground] = useState<CanvasBackground>({ mode: "checkerboard", color: "#1a1e23" });
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [sampleDraft, setSampleDraft] = useState("{}");
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sendIncludeAudio, setSendIncludeAudio] = useState(true);
  const [sendIncludeTts, setSendIncludeTts] = useState(true);
  const [previewIncludeAudio, setPreviewIncludeAudio] = useState(false);
  const [previewIncludeTts, setPreviewIncludeTts] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  const [previewRunId, setPreviewRunId] = useState(0);
  const previewFrameRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [saveWarning, setSaveWarning] = useState<SaveWarningState | null>(null);
  const [copyDesignOpen, setCopyDesignOpen] = useState(false);
  const [copyDesignSourceId, setCopyDesignSourceId] = useState("");
  const [pendingProfileId, setPendingProfileId] = useState<TargetProfileId | null>(null);
  const [profileCopy, setProfileCopy] = useState<{ readonly sourceId: TargetProfileId; readonly targetId: TargetProfileId } | null>(null);
  const tabRefs = useRef<Record<InspectorTab, HTMLButtonElement | null>>({
    layers: null,
    alert: null,
    event: null
  });
  const activeTtsProvider = ttsProviders.find((provider) => provider.active) ?? null;

  useEffect(() => {
    let active = true;
    setEditor(null);
    setSetDetail(null);
    setLoadedSetId(undefined);
    setError(null);
    setTtsProviders([]);
    setTtsProvidersLoaded(false);
    setTtsProviderError(null);
    void props.managementApi.getAlertEditorDocument(props.alertId).then(async (document) => {
      if (!active) return;
      setLoadedSetId(document.setId);
      const loadedSetDetail = await props.managementApi.getAlertSet(document.setId);
      if (!active) return;
      setEditor(createEditorState(document));
      setProfileId(props.targetProfileId === "vertical" ? "vertical" : "landscape");
      setCanvasViews({});
      setSelectedLayerId(document.layers[0]?.id ?? null);
      const firstSample = document.samplePayloads[0] ?? null;
      setSampleId(firstSample?.id ?? null);
      setSampleDraft(JSON.stringify(firstSample?.payload ?? {}, null, 2));
      setSampleError(firstSample === null ? "No sample payload is available." : validateAlertSamplePayload(document.eventType, firstSample.payload));
      setSetDetail(loadedSetDetail);
    }).catch((cause: unknown) => {
      if (active) setError(actionableError("The alert editor could not be opened", cause, "Return to Alerts and choose the alert again."));
    });
    void props.managementApi.listRegisteredProviders("tts").then((providers) => {
      if (!active) return;
      setTtsProviders(providers);
      setTtsProvidersLoaded(true);
    }).catch((cause: unknown) => {
      if (!active) return;
      setTtsProviderError(actionableError(
        "TTS providers could not be loaded",
        cause,
        "Open TTS providers to review the active connection, then reload the editor."
      ));
      setTtsProvidersLoaded(true);
    });
    return () => { active = false; };
  }, [props.alertId, props.managementApi, props.targetProfileId]);

  const showActionError = useCallback((nextError: ReportableActionError) => {
    setNotice(null);
    setError(nextError);
    const report = props.managementApi.reportAlertEditorError;
    if (report === undefined || !nextError.referenceId.startsWith("ui_")) return;
    void report(props.alertId, { setId: loadedSetId ?? null, error: nextError }).catch((cause: unknown) => {
      console.error(`[${nextError.referenceId}] Alert editor error could not be recorded in Diagnostics.`, cause);
    });
  }, [loadedSetId, props.alertId, props.managementApi]);

  useEffect(() => {
    if (!previewPlaying || editor === null) return;
    const durationMs = editor.document.durationMs;
    const startedAt = performance.now() - previewElapsedMs;
    const tick = (timestamp: number) => {
      const nextElapsedMs = Math.min(durationMs, Math.max(0, Math.round(timestamp - startedAt)));
      setPreviewElapsedMs(nextElapsedMs);
      if (nextElapsedMs >= durationMs) {
        setPreviewPlaying(false);
        previewFrameRef.current = null;
        return;
      }
      previewFrameRef.current = requestAnimationFrame(tick);
    };
    previewFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    };
  }, [editor, previewPlaying, previewRunId]);

  const save = useCallback(async (confirmLiveImpact = false) => {
    if (editor === null) return;
    if (hasEnabledTts(editor.document) && activeTtsProvider === null) {
      showActionError(missingActiveTtsProviderError());
      throw new Error("An active TTS provider is required before enabled TTS layers can be saved.");
    }
    const submittedDocument = applyActiveTtsProvider(editor.document, activeTtsProvider);
    setBusy(true);
    setError(null);
    setNotice(null);
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
      setNotice({ tone: "success", message: "Alert saved." });
    } catch (cause) {
      showActionError(actionableError("The alert was not saved", cause, "Review the selected profile and highlighted fields, then try again."));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [activeTtsProvider, editor, props.alertId, props.managementApi, showActionError]);

  const requiresLiveImpactConfirmation = useCallback(async () => {
    if (editor === null || !isEditorDirty(editor) || affectedProfileIds(editor).length === 0) return false;
    try {
      const latestSetDetail = await props.managementApi.getAlertSet(editor.document.setId);
      setSetDetail(latestSetDetail);
      return latestSetDetail.overview.active;
    } catch (cause) {
      showActionError(actionableError(
        "The alert set status could not be checked",
        cause,
        "Confirm the local service is running, then try saving again."
      ));
      throw cause;
    }
  }, [editor, props.managementApi, showActionError]);

  const discard = useCallback(() => {
    setEditor((current) => current === null ? null : revertEditorChanges(current));
    setError(null);
    setNotice({ tone: "success", message: "Unsaved changes reverted." });
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
  const storedCanvasView = canvasViews[profileId];
  const canvasView = storedCanvasView ?? DEFAULT_CANVAS_VIEW;
  const documentConditionError = document === null ? null : alertDocumentConditionError(document);
  const samplePayload = useMemo(() => parseSample(sampleDraft), [sampleDraft]);
  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (setDetail?.inventory ?? []).filter((alert) => query === "" || `${alert.name} ${alert.eventType}`.toLowerCase().includes(query));
  }, [search, setDetail]);
  const validationIssues = useMemo(() => (setDetail?.overview.validationIssues ?? []).filter((issue) =>
    (issue.alertId === null || issue.alertId === props.alertId) &&
    (issue.targetProfileId === null || issue.targetProfileId === profileId)
  ), [profileId, props.alertId, setDetail]);

  function updateDocument(update: (document: AlertEditorDocument) => AlertEditorDocument) {
    setEditor((current) => current === null ? null : applyEditorUpdate(current, update));
    setPreview(false);
    setPreviewPlaying(false);
    setPreviewElapsedMs(0);
    setNotice(null);
  }

  const updateCurrentCanvasView = useCallback((next: CanvasViewState) => {
    setCanvasViews((current) => ({ ...current, [profileId]: next }));
  }, [profileId]);

  function requestProfileSwitch(nextProfileId: TargetProfileId) {
    if (nextProfileId === profileId) return;
    if (editor !== null && isEditorDirty(editor)) {
      setPendingProfileId(nextProfileId);
      return;
    }
    setProfileId(nextProfileId);
  }

  function discardAndSwitchProfile() {
    if (pendingProfileId === null) return;
    const nextProfileId = pendingProfileId;
    discard();
    setPendingProfileId(null);
    setProfileId(nextProfileId);
  }

  async function saveAndSwitchProfile() {
    if (pendingProfileId === null) return;
    const nextProfileId = pendingProfileId;
    setPendingProfileId(null);
    try {
      if (await saveForNavigation()) setProfileId(nextProfileId);
    } catch {
      // Save failures remain visible through the editor error banner.
    }
  }

  function requestProfileCopy() {
    if (editor === null) return;
    const sourceId = profileId === "landscape" ? "vertical" : "landscape";
    const request = { sourceId, targetId: profileId } as const;
    if (profileLayoutChanged(editor.savedDocument, editor.document, profileId)) {
      setProfileCopy(request);
      return;
    }
    applyProfileCopy(request);
  }

  function applyProfileCopy(request = profileCopy) {
    if (request === null) return;
    updateDocument((current) => copyProfileLayout(current, request.sourceId, request.targetId));
    setProfileCopy(null);
    setNotice({ tone: "warning", message: `${profileLabel(request.sourceId)} layout copied to ${profileLabel(request.targetId)}.`, detail: "Review the generated layout before enabling it." });
  }

  function chooseSample(nextSampleId: string) {
    if (document === null) return;
    const sample = document.samplePayloads.find((candidate) => candidate.id === nextSampleId);
    if (sample === undefined) return;
    setSampleId(sample.id);
    setSampleDraft(JSON.stringify(sample.payload, null, 2));
    setSampleError(validateAlertSamplePayload(document.eventType, sample.payload));
    setPreview(false);
    setPreviewPlaying(false);
    setPreviewElapsedMs(0);
  }

  function previewLocally() {
    if (samplePayload === null || document === null) {
      setSampleError("Sample payload must be a valid JSON object.");
      return;
    }
    const validationError = validateAlertSamplePayload(document.eventType, samplePayload);
    if (validationError !== null) {
      setSampleError(validationError);
      return;
    }
    setPreview(true);
    setPreviewPlaying(true);
    setPreviewElapsedMs(0);
    setPreviewRunId((current) => current + 1);
    setNotice({ tone: "success", message: "Local preview is running." });
    void playPreviewMedia(document, samplePayload);
  }

  async function playPreviewMedia(currentDocument: AlertEditorDocument, payload: Record<string, unknown>) {
    try {
      const templateContext = createAlertTemplateContext({ eventType: currentDocument.eventType, samplePayload: payload });
      if (previewIncludeAudio) {
        const audioLayers = currentDocument.layers.filter(
          (layer): layer is Extract<AlertLayer, { type: "audio" }> => layer.visible && layer.type === "audio"
        );
        await Promise.all(audioLayers.map(async (layer) => {
          const blob = await props.assetApi.getAssetFile(layer.assetId);
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = layer.volume;
          await audio.play();
          window.setTimeout(() => URL.revokeObjectURL(url), currentDocument.durationMs + 1_000);
        }));
      }
      if (previewIncludeTts) {
        if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
          throw new Error("This browser does not provide local speech synthesis.");
        }
        speechSynthesis.cancel();
        currentDocument.layers.filter(
          (layer): layer is Extract<AlertLayer, { type: "tts" }> => layer.visible && layer.type === "tts" && layer.enabled
        ).forEach((layer) => {
          speechSynthesis.speak(new SpeechSynthesisUtterance(renderTemplateValue(layer.template, templateContext)));
        });
      }
    } catch (cause) {
      showActionError(actionableError("Local preview media could not be played", cause, "Check the selected audio asset and browser audio permissions, then replay the preview."));
    }
  }

  async function sendTest() {
    if (document === null || samplePayload === null || profile === null) return;
    if (sendIncludeTts && hasEnabledTts(document) && activeTtsProvider === null) {
      showActionError(missingActiveTtsProviderError());
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await props.managementApi.sendAlertEditorTest(props.alertId, {
        document: applyActiveTtsProvider(document, activeTtsProvider),
        targetProfileId: profileId,
        samplePayload,
        includeAudio: sendIncludeAudio,
        includeTts: sendIncludeTts
      });
      setNotice({ tone: "success", message: `Queued on ${profileLabel(profileId)}. Reference ${result.referenceId}.` });
    } catch (cause) {
      showActionError(actionableError("The alert test was not sent", cause, `Connect and review the ${profileLabel(profileId)} output, then try again.`));
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
    const defaultVariable = document.templateVariables?.[0]?.key;
    const defaultTemplate = defaultVariable === undefined ? "" : `{${defaultVariable}}`;
    const layer = type === "text"
      ? { ...layerBase(id, "Text", type, document.layers.length), template: defaultTemplate }
      : {
          ...layerBase(id, "Text to speech", type, document.layers.length),
          enabled: activeTtsProvider !== null,
          providerId: activeTtsProvider?.kind ?? "browser-speech",
          template: defaultTemplate
        };
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

  function handleInspectorTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: InspectorTab) {
    const tabs: readonly InspectorTab[] = ["layers", "alert", "event"];
    const currentIndex = tabs.indexOf(currentTab);
    let nextTab: InspectorTab | undefined;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextTab = tabs[(currentIndex + 1) % tabs.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        break;
      case "Home":
        nextTab = tabs[0];
        break;
      case "End":
        nextTab = tabs[tabs.length - 1];
        break;
      default:
        return;
    }

    if (nextTab === undefined) {
      return;
    }
    event.preventDefault();
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  async function applyCopiedDesign() {
    if (copyDesignSourceId === "") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const source = await props.managementApi.getAlertEditorDocument(copyDesignSourceId);
      updateDocument((target) => copyAlertDesign(source, target));
      setSelectedLayerId(source.layers[0]?.id ?? null);
      setCopyDesignOpen(false);
      setNotice({ tone: "warning", message: "Design copied.", detail: "Review the result, then Save to keep it." });
    } catch (cause) {
      showActionError(actionableError("The alert design was not copied", cause, "Choose another alert or return to Alerts and review the source."));
    } finally {
      setBusy(false);
    }
  }

  if (document === null || editor === null || profile === null) {
    return error === null
      ? <p className="management-empty" role="status">Loading alert editor...</p>
      : <div className="alert-editor-page alert-editor-page--load-error"><button className="alert-editor-page__back" onClick={() => props.onBack(loadedSetId)} type="button">Back to alerts</button><ManagementErrorBanner error={error} /></div>;
  }

  const ttsLiveBlocked = hasEnabledTts(document) && activeTtsProvider === null;
  const canSend = profile.enabled && profile.reviewState === "ready" && samplePayload !== null && sampleError === null && documentConditionError === null && (!sendIncludeTts || !ttsLiveBlocked) && !busy;
  return (
    <div className="alert-editor-page">
      <header className="alert-editor-page__header">
        <div>
          <button className="alert-editor-page__back" onClick={() => props.onBack(document.setId)} type="button">Back to alerts</button>
          <Breadcrumbs items={["Alerts", setDetail?.overview.name ?? "Alert set", document.name]} />
          <div className="alert-editor-page__title-row">
            <h2>{document.name}</h2>
            <StatusBadge label={isEditorDirty(editor) ? "Unsaved" : "Saved"} tone={isEditorDirty(editor) ? "warning" : "positive"} />
            <StatusBadge label={document.enabled ? "Alert enabled" : "Alert disabled"} tone={document.enabled ? "info" : "neutral"} />
          </div>
          <p>{formatEventType(document.eventType)} / {document.kind === "default" ? "Default alert" : "Variation"}</p>
        </div>
        <div className="alert-editor-page__header-actions">
          <button className="button button--secondary" disabled={!isEditorDirty(editor) || busy} onClick={discard} type="button">Revert</button>
          <button className="button button--secondary" disabled={samplePayload === null || sampleError !== null || documentConditionError !== null} onClick={previewLocally} type="button">Preview</button>
          {preview ? <button className="button button--secondary" onClick={() => previewPlaying ? setPreviewPlaying(false) : previewLocally()} type="button">{previewPlaying ? "Pause preview" : "Replay preview"}</button> : null}
          {preview ? <label className="alert-editor-page__preview-position"><span>{previewPlaying ? "Preview playing" : "Preview paused"}</span><input aria-label="Preview position" max={document.durationMs} min="0" onChange={(event) => { setPreviewPlaying(false); setPreviewElapsedMs(Math.max(0, Math.min(document.durationMs, Number(event.currentTarget.value)))); }} step="100" type="range" value={previewElapsedMs} /></label> : null}
          <button className="button button--secondary" disabled={!canSend} onClick={() => void sendTest()} type="button">Send test</button>
          <button className="button button--primary" disabled={!isEditorDirty(editor) || documentConditionError !== null || ttsLiveBlocked || busy} onClick={() => void requestSave()} type="button">Save</button>
        </div>
      </header>

      <section aria-labelledby="alert-editor-screen-guard-title" className="alert-editor-page__screen-guard">
        <h3 id="alert-editor-screen-guard-title">Alert editor requires a larger screen</h3>
        <p>Open this alert on a screen wider than 700px to edit layers and layouts.</p>
      </section>

      {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
      {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
      {documentConditionError === null ? null : <p className="alert-editor-page__condition-error" role="alert">Event condition needs correction: {documentConditionError} Open Event settings to fix it before saving or sending a test.</p>}
      {validationIssues.length === 0 ? null : (
        <section aria-label="Validation issues" className="alert-editor-page__validation">
          <div>
            <strong>Validation issues</strong>
            <span>{profileLabel(profileId)} profile and set-wide checks</span>
          </div>
          <ul>
            {validationIssues.map((issue) => (
              <li className={`alert-editor-page__validation-issue alert-editor-page__validation-issue--${issue.severity}`} key={issue.id}>
                <span className="alert-editor-page__validation-severity">{issue.severity === "blocker" ? "Blocker" : "Warning"}</span>
                <div><strong>{issue.message}</strong><span>{issue.nextStep}</span></div>
                {issue.referenceId === null ? null : <code>{issue.referenceId}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                <button aria-pressed={candidate.id === profileId} key={candidate.id} onClick={() => requestProfileSwitch(candidate.id)} type="button">
                  {profileLabel(candidate.id)}
                  {candidate.reviewState === "needs-review" ? <span>Needs review</span> : candidate.enabled ? <span>Active</span> : <span>Off</span>}
                </button>
              ))}
            </div>
            <div className="alert-editor-page__canvas-tools">
              <button aria-label="Undo" className="button button--secondary button--compact" disabled={editor.past.length === 0} onClick={() => setEditor(undoEditorUpdate(editor))} type="button">Undo</button>
              <button aria-label="Redo" className="button button--secondary button--compact" disabled={editor.future.length === 0} onClick={() => setEditor(redoEditorUpdate(editor))} type="button">Redo</button>
              <button aria-label="Toggle safe area and center guides" aria-pressed={showSafeArea} className="button button--secondary button--compact" onClick={() => setShowSafeArea((current) => !current)} type="button">Guides</button>
              <button aria-label="Toggle canvas grid" aria-pressed={showGrid} className="button button--secondary button--compact" onClick={() => setShowGrid((current) => !current)} type="button">Grid</button>
              <label className="alert-editor-page__canvas-background"><span>Canvas background</span><select aria-label="Canvas background" onChange={(event) => { const mode = event.currentTarget.value as CanvasBackground["mode"]; setCanvasBackground((current) => ({ ...current, mode })); }} value={canvasBackground.mode}><option value="checkerboard">Checkerboard</option><option value="neutral">Neutral</option><option value="test">Test color</option></select></label>
              {canvasBackground.mode === "test" ? <label className="alert-editor-page__test-background"><span>Test background color</span><input aria-label="Test background color" onChange={(event) => setCanvasBackground({ mode: "test", color: event.currentTarget.value })} type="color" value={canvasBackground.color} /></label> : null}
              <button aria-label="Zoom out" className="button button--secondary button--compact" disabled={canvasView.zoom <= 25} onClick={() => updateCurrentCanvasView({ ...canvasView, zoom: Math.max(25, canvasView.zoom - 25) })} type="button">-</button>
              <output aria-label="Canvas zoom">{canvasView.zoom}%</output>
              <button aria-label="Zoom in" className="button button--secondary button--compact" disabled={canvasView.zoom >= 150} onClick={() => updateCurrentCanvasView({ ...canvasView, zoom: Math.min(150, canvasView.zoom + 25) })} type="button">+</button>
              <button className="button button--secondary button--compact" onClick={() => setFitRequestId((current) => current + 1)} type="button">Fit</button>
              <button className="button button--secondary button--compact" onClick={() => updateCurrentCanvasView({ zoom: 100, scrollLeft: 0, scrollTop: 0 })} type="button">100%</button>
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
            background={canvasBackground}
            document={document}
            fitRequestId={fitRequestId}
            onGeometryChange={(layerId, geometry) => updateDocument((current) => updateLayerGeometry(current, profileId, layerId, geometry))}
            onSelectLayer={(layerId) => { setSelectedLayerId(layerId); setTab("layers"); }}
            onViewStateChange={updateCurrentCanvasView}
            preview={preview}
            previewElapsedMs={previewElapsedMs}
            previewRunId={previewRunId}
            profileId={profileId}
            samplePayload={samplePayload ?? {}}
            selectedLayerId={selectedLayerId}
            showGrid={showGrid}
            showSafeArea={showSafeArea}
            {...(storedCanvasView === undefined ? {} : { viewState: storedCanvasView })}
          />
        </main>

        <aside className="alert-editor-page__inspector" aria-label="Alert inspector">
          <div className="alert-editor-page__tabs" role="tablist" aria-label="Inspector sections">
            {(["layers", "alert", "event"] as const).map((value) => (
              <button
                aria-controls={`alert-editor-panel-${value}`}
                aria-selected={tab === value}
                id={`alert-editor-tab-${value}`}
                key={value}
                onClick={() => setTab(value)}
                onKeyDown={(event) => handleInspectorTabKeyDown(event, value)}
                ref={(element) => { tabRefs.current[value] = element; }}
                role="tab"
                tabIndex={tab === value ? 0 : -1}
                type="button"
              >
                {capitalize(value)}
              </button>
            ))}
          </div>
          <div
            aria-labelledby={`alert-editor-tab-${tab}`}
            id={`alert-editor-panel-${tab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {tab === "layers" ? (
              <LayerInspector
                activeTtsProvider={activeTtsProvider}
                document={document}
                onAddAsset={(type) => setPicker({ layerId: null, type })}
                onAddSimple={addSimpleLayer}
                onChange={updateDocument}
                onChooseAsset={(layer) => setPicker({ layerId: layer.id, type: layer.type as "image" | "video" | "audio" })}
                onSelect={setSelectedLayerId}
                profileId={profileId}
                selectedLayer={selectedLayer}
                ttsProviderError={ttsProviderError}
                ttsProvidersLoaded={ttsProvidersLoaded}
              />
            ) : tab === "alert" ? (
              <AlertInspector document={document} onChange={updateDocument} onCopyDesign={() => {
                setCopyDesignSourceId(visibleAlerts.find((alert) => alert.id !== document.id)?.id ?? "");
                setCopyDesignOpen(true);
              }} onCopyProfileLayout={requestProfileCopy} profileId={profileId} />
            ) : (
              <EventInspector
                document={document}
                previewIncludeAudio={previewIncludeAudio}
                previewIncludeTts={previewIncludeTts}
                sendIncludeAudio={sendIncludeAudio}
                sendIncludeTts={sendIncludeTts}
                onPreviewIncludeAudio={setPreviewIncludeAudio}
                onPreviewIncludeTts={setPreviewIncludeTts}
                onSendIncludeAudio={setSendIncludeAudio}
                onSendIncludeTts={setSendIncludeTts}
                onChange={updateDocument}
                onPreview={previewLocally}
                onResetSample={() => sampleId === null ? undefined : chooseSample(sampleId)}
                onSample={chooseSample}
                onSampleDraft={(value) => {
                  setSampleDraft(value);
                  const parsed = parseSample(value);
                  setSampleError(parsed === null ? "Sample payload must be a valid JSON object." : validateAlertSamplePayload(document.eventType, parsed));
                  setPreview(false);
                  setPreviewPlaying(false);
                  setPreviewElapsedMs(0);
                }}
                onSend={() => void sendTest()}
                sampleDraft={sampleDraft}
                sampleError={sampleError}
                sampleId={sampleId}
                sendDisabled={!canSend}
              />
            )}
          </div>
          {(["layers", "alert", "event"] as const).filter((value) => value !== tab).map((value) => (
            <div
              aria-labelledby={`alert-editor-tab-${value}`}
              hidden
              id={`alert-editor-panel-${value}`}
              key={value}
              role="tabpanel"
            />
          ))}
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
      <ModalSurface labelledBy="copy-alert-design-title" onCancel={() => setCopyDesignOpen(false)} open={copyDesignOpen}>
        <div className="alert-editor-page__save-warning">
          <div><h2 id="copy-alert-design-title">Copy design from another alert?</h2><p>Layers, assets, animation, and both profile layouts will replace the current design. Matching, enablement, identity, and sample data stay unchanged.</p></div>
          <label><span>Source alert</span><select autoFocus onChange={(event) => setCopyDesignSourceId(event.currentTarget.value)} value={copyDesignSourceId}><option value="">Choose an alert</option>{(setDetail?.inventory ?? []).filter((alert) => alert.id !== document.id).map((alert) => <option key={alert.id} value={alert.id}>{alert.name} ({formatEventType(alert.eventType)})</option>)}</select></label>
          <div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => setCopyDesignOpen(false)} type="button">Cancel</button><button className="button button--primary" disabled={busy || copyDesignSourceId === ""} onClick={() => void applyCopiedDesign()} type="button">Copy design</button></div>
        </div>
      </ModalSurface>
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
      <ModalSurface labelledBy="profile-switch-warning-title" onCancel={() => setPendingProfileId(null)} open={pendingProfileId !== null}>
        <div className="alert-editor-page__save-warning">
          <div><h2 id="profile-switch-warning-title">Switch profiles with unsaved changes?</h2><p>Choose whether to save or discard the current alert changes before opening {pendingProfileId === null ? "the other profile" : profileLabel(pendingProfileId)}.</p></div>
          <div className="management-modal__actions"><button className="button button--secondary" disabled={busy} onClick={() => setPendingProfileId(null)} type="button">Cancel</button><button className="button button--danger-quiet" disabled={busy} onClick={discardAndSwitchProfile} type="button">Discard and switch</button><button className="button button--primary" disabled={busy} onClick={() => void saveAndSwitchProfile()} type="button">Save and switch</button></div>
        </div>
      </ModalSurface>
      <ModalSurface labelledBy="profile-copy-warning-title" onCancel={() => setProfileCopy(null)} open={profileCopy !== null}>
        <div className="alert-editor-page__save-warning">
          <div><h2 id="profile-copy-warning-title">Replace edited {profileCopy === null ? "target" : profileLabel(profileCopy.targetId)} layout?</h2><p>Your unsaved target-profile layout changes will be replaced by a scaled copy. The copied profile will be disabled and marked Needs review.</p></div>
          <div className="management-modal__actions"><button className="button button--secondary" onClick={() => setProfileCopy(null)} type="button">Cancel</button><button className="button button--primary" onClick={() => applyProfileCopy()} type="button">Replace layout</button></div>
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
  activeTtsProvider,
  document,
  onAddAsset,
  onAddSimple,
  onChange,
  onChooseAsset,
  onSelect,
  profileId,
  selectedLayer,
  ttsProviderError,
  ttsProvidersLoaded
}: {
  readonly activeTtsProvider: RegisteredProviderView | null;
  readonly document: AlertEditorDocument;
  readonly onAddAsset: (type: "image" | "video" | "audio") => void;
  readonly onAddSimple: (type: "text" | "tts") => void;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onChooseAsset: (layer: AlertLayer) => void;
  readonly onSelect: (layerId: string) => void;
  readonly profileId: TargetProfileId;
  readonly selectedLayer: AlertLayer | null;
  readonly ttsProviderError: ActionableManagementError | null;
  readonly ttsProvidersLoaded: boolean;
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
              {layer.type === "tts" ? null : <button aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} onClick={() => onChange((current) => toggleLayerVisible(current, layer.id))} type="button">{layer.visible ? "On" : "Off"}</button>}
            </div>
          ))}
        </div>
      </section>
      {selectedLayer === null ? <p className="alert-editor-page__empty">Select a layer to edit it.</p> : (
        <section className="alert-editor-inspector__controls">
          <h3>{selectedLayer.name}</h3>
          <label><span>Layer name</span><input onChange={(event) => { const value = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, name: value }))); }} value={selectedLayer.name} /></label>
          {selectedLayer.type === "tts" ? (
            <fieldset>
              <legend>Live TTS</legend>
              {activeTtsProvider !== null ? (
                <div aria-label="Active TTS provider">
                  <span>Active provider</span>
                  <strong>{activeTtsProvider.name}</strong>
                  <p>{formatTtsProviderKind(activeTtsProvider.kind)} is used for live TTS.</p>
                </div>
              ) : !ttsProvidersLoaded ? (
                <p role="status">Loading active TTS provider...</p>
              ) : (
                <div>
                  <p role="alert">{ttsProviderError === null
                    ? "An active TTS provider is required before this layer can be used live."
                    : `${ttsProviderError.summary}. ${ttsProviderError.nextStep}`}</p>
                  <a href="/manage/tts-providers">Set up a TTS provider</a>
                </div>
              )}
              <label>
                <span>Use TTS for this alert</span>
                <input
                  aria-label="Enable TTS for this alert"
                  checked={selectedLayer.enabled}
                  disabled={!selectedLayer.enabled && activeTtsProvider === null}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    if (enabled && activeTtsProvider === null) return;
                    onChange((current) => updateLayer(current, selectedLayer.id, (layer) => layer.type === "tts"
                      ? { ...layer, enabled, ...(enabled ? { providerId: activeTtsProvider!.kind } : {}) }
                      : layer));
                  }}
                  type="checkbox"
                />
              </label>
            </fieldset>
          ) : null}
          {(selectedLayer.type === "text" || selectedLayer.type === "tts") ? (
            <>
              <label><span>{selectedLayer.type === "text" ? "Message template" : "TTS template"}</span><textarea aria-label={selectedLayer.type === "text" ? "Message template" : "TTS template"} onChange={(event) => { const value = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => layer.type === selectedLayer.type ? { ...layer, template: value } : layer)); }} value={selectedLayer.template} /></label>
              <div aria-label="Template variables" className="alert-editor-inspector__variables">
                <span>Insert variable</span>
                <div>{(document.templateVariables ?? []).map((variable) => <button aria-label={`Insert {${variable.key}}`} className="button button--secondary button--compact" key={variable.key} onClick={() => onChange((current) => updateLayer(current, selectedLayer.id, (layer) => layer.type === selectedLayer.type ? { ...layer, template: `${layer.template}{${variable.key}}` } : layer))} title={variable.description} type="button">{variable.label}</button>)}</div>
              </div>
            </>
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
          <fieldset className="alert-editor-inspector__animation">
            <legend>Animation preset</legend>
            <label><span>Entrance</span><select onChange={(event) => { const entrance = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, entrance } }))); }} value={selectedLayer.animation.entrance}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-up">Slide up</option></select></label>
            <label><span>Exit</span><select onChange={(event) => { const exit = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, exit } }))); }} value={selectedLayer.animation.exit}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-down">Slide down</option></select></label>
            <label><span>Animation duration (milliseconds)</span><input aria-label="Animation duration (milliseconds)" min="0" onChange={(event) => { const durationMs = Number(event.currentTarget.value); onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, durationMs } }))); }} type="number" value={selectedLayer.animation.durationMs} /></label>
            <label><span>Animation delay (milliseconds)</span><input aria-label="Animation delay (milliseconds)" min="0" onChange={(event) => { const delayMs = Number(event.currentTarget.value); onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, delayMs } }))); }} type="number" value={selectedLayer.animation.delayMs} /></label>
            <label><span>Animation easing</span><select aria-label="Animation easing" onChange={(event) => { const easing = event.currentTarget.value; onChange((current) => updateLayer(current, selectedLayer.id, (layer) => ({ ...layer, animation: { ...layer.animation, easing } }))); }} value={selectedLayer.animation.easing}><option value="linear">Linear</option><option value="ease">Ease</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in out</option></select></label>
          </fieldset>
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

function AlertInspector({ document, onChange, onCopyDesign, onCopyProfileLayout, profileId }: {
  readonly document: AlertEditorDocument;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onCopyDesign: () => void;
  readonly onCopyProfileLayout: () => void;
  readonly profileId: TargetProfileId;
}) {
  const profile = document.targetProfiles.find((candidate) => candidate.id === profileId)!;
  return (
    <div className="alert-editor-inspector alert-editor-inspector__controls">
      <h3>Alert settings</h3>
      <label><span>Alert name</span><input onChange={(event) => { const name = event.currentTarget.value; onChange((current) => ({ ...current, name })); }} value={document.name} /></label>
      <label><span>Duration (milliseconds)</span><input min="100" onChange={(event) => { const durationMs = Number(event.currentTarget.value); onChange((current) => ({ ...current, durationMs })); }} type="number" value={document.durationMs} /></label>
      <label className="alert-editor-inspector__check"><input checked={document.enabled} onChange={(event) => { const enabled = event.currentTarget.checked; onChange((current) => ({ ...current, enabled })); }} type="checkbox" /><span>Alert enabled</span></label>
      <button className="button button--secondary" onClick={onCopyDesign} type="button">Copy design from...</button>
      <button className="button button--secondary" onClick={onCopyProfileLayout} type="button">Copy layout from {profileId === "landscape" ? "Vertical" : "Landscape"}</button>
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
  readonly previewIncludeAudio: boolean;
  readonly previewIncludeTts: boolean;
  readonly sendIncludeAudio: boolean;
  readonly sendIncludeTts: boolean;
  readonly onChange: (update: (document: AlertEditorDocument) => AlertEditorDocument) => void;
  readonly onPreviewIncludeAudio: (value: boolean) => void;
  readonly onPreviewIncludeTts: (value: boolean) => void;
  readonly onSendIncludeAudio: (value: boolean) => void;
  readonly onSendIncludeTts: (value: boolean) => void;
  readonly onPreview: () => void;
  readonly onResetSample: () => void;
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
      <h3>Matching and playback</h3>
      <p>Rule controls are shared by the default and every variation for this event.</p>
      <ConditionList
        conditions={props.document.conditions}
        eventType={props.document.eventType}
        heading="Rule conditions"
        onChange={(conditions) => props.onChange((document) => ({ ...document, conditions: [...conditions] }))}
      />
      {props.document.kind === "variation" ? (
        <>
          <ConditionList
            conditions={props.document.variantConditions}
            eventType={props.document.eventType}
            heading="Variation conditions"
            onChange={(variantConditions) => props.onChange((document) => ({ ...document, variantConditions: [...variantConditions] }))}
          />
          <label><span>Variation weight</span><input min="1" onChange={(event) => { const weight = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, weight })); }} type="number" value={props.document.weight} /></label>
          <label><span>Variation priority</span><input onChange={(event) => { const priority = event.currentTarget.value === "" ? null : Number(event.currentTarget.value); props.onChange((document) => ({ ...document, priority })); }} placeholder="Use default priority" type="number" value={props.document.priority ?? ""} /></label>
        </>
      ) : null}
      <label><span>Cooldown (seconds)</span><input min="0" onChange={(event) => { const cooldownSeconds = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, cooldownSeconds })); }} type="number" value={props.document.cooldownSeconds} /></label>
      <label><span>Rule priority</span><input onChange={(event) => { const rulePriority = Number(event.currentTarget.value); props.onChange((document) => ({ ...document, rulePriority })); }} type="number" value={props.document.rulePriority} /></label>
      <h3>Event sample</h3>
      <label><span>Sample payload</span><select onChange={(event) => props.onSample(event.currentTarget.value)} value={props.sampleId ?? ""}>{props.document.samplePayloads.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label>
      <label><span>Session payload (JSON)</span><textarea aria-invalid={props.sampleError !== null} onChange={(event) => props.onSampleDraft(event.currentTarget.value)} rows={12} value={props.sampleDraft} /></label>
      {props.sampleError === null ? <p>Session edits are used only for preview and testing.</p> : <p className="alert-editor-inspector__field-error" role="alert">{props.sampleError}</p>}
      <button className="button button--secondary" onClick={props.onResetSample} type="button">Reset sample</button>
      <fieldset className="alert-editor-inspector__audio"><legend>Local preview</legend><label className="alert-editor-inspector__check"><input checked={props.previewIncludeAudio} onChange={(event) => props.onPreviewIncludeAudio(event.currentTarget.checked)} type="checkbox" /><span>Preview audio</span></label><label className="alert-editor-inspector__check"><input checked={props.previewIncludeTts} onChange={(event) => props.onPreviewIncludeTts(event.currentTarget.checked)} type="checkbox" /><span>Preview TTS</span></label></fieldset>
      <fieldset className="alert-editor-inspector__audio"><legend>Send test</legend><label className="alert-editor-inspector__check"><input checked={props.sendIncludeAudio} onChange={(event) => props.onSendIncludeAudio(event.currentTarget.checked)} type="checkbox" /><span>Send audio</span></label><label className="alert-editor-inspector__check"><input checked={props.sendIncludeTts} onChange={(event) => props.onSendIncludeTts(event.currentTarget.checked)} type="checkbox" /><span>Send TTS</span></label></fieldset>
      <div className="alert-editor-inspector__actions"><button className="button button--secondary" disabled={props.sampleError !== null} onClick={props.onPreview} type="button">Replay preview</button><button className="button button--primary" disabled={props.sendDisabled} onClick={props.onSend} type="button">Send test</button></div>
    </div>
  );
}

interface ConditionDefinition {
  readonly field: string;
  readonly label: string;
  readonly operator: EditorCondition["operator"];
  readonly defaultValue: string | number;
  readonly minimum?: number;
  readonly options?: readonly { readonly label: string; readonly value: string }[];
}

function ConditionList({ conditions, eventType, heading, onChange }: {
  readonly conditions: readonly EditorCondition[];
  readonly eventType: AlertEditorDocument["eventType"];
  readonly heading: string;
  readonly onChange: (conditions: readonly EditorCondition[]) => void;
}) {
  const definitions = conditionDefinitions(eventType);
  const available = definitions.filter((definition) => !conditions.some((condition) => condition.field === definition.field));
  return (
    <fieldset className="alert-editor-inspector__conditions">
      <legend>{heading}</legend>
      {conditions.length === 0 ? <p>No conditions. Every matching {formatEventType(eventType).toLowerCase()} event is eligible.</p> : null}
      {conditions.map((condition, index) => {
        const knownDefinition = definitions.find((candidate) => candidate.field === condition.field);
        const definition = knownDefinition
          ?? { field: condition.field, label: condition.field, operator: condition.operator, defaultValue: condition.value as string | number };
        const validationMessage = knownDefinition === undefined ? null : conditionValidationMessage(definition, condition.value);
        return (
          <div className="alert-editor-inspector__condition" key={`${condition.field}-${index}`}>
            {knownDefinition === undefined ? (
              <div className="alert-editor-inspector__unknown-condition"><strong>{condition.field}</strong><code>{condition.operator} {JSON.stringify(condition.value)}</code></div>
            ) : (
              <label>
                <span>{definition.label}</span>
                {definition.options === undefined ? (
                <input aria-invalid={validationMessage !== null} aria-label={`${heading} ${definition.label}`} min={definition.minimum} onChange={(event) => onChange(replaceCondition(conditions, index, { ...condition, value: Number(event.currentTarget.value) }))} type="number" value={typeof condition.value === "number" ? condition.value : 0} />
                ) : (
                  <select aria-label={`${heading} ${definition.label}`} onChange={(event) => onChange(replaceCondition(conditions, index, { ...condition, value: event.currentTarget.value }))} value={String(condition.value)}>{definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                )}
              </label>
            )}
            <button aria-label={`Remove ${definition.label} from ${heading}`} className="button button--danger-quiet button--compact" onClick={() => onChange(conditions.filter((_, candidateIndex) => candidateIndex !== index))} type="button">Remove</button>
            {validationMessage === null ? null : <p className="alert-editor-inspector__field-error" role="alert">{validationMessage}</p>}
          </div>
        );
      })}
      {available.length === 0 ? null : (
        <div className="alert-editor-inspector__condition-actions">
          {available.map((definition) => (
            <button className="button button--secondary button--compact" key={definition.field} onClick={() => onChange([...conditions, { field: definition.field, operator: definition.operator, value: definition.defaultValue }])} type="button">Add {definition.label.toLowerCase()}</button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function conditionDefinitions(eventType: AlertEditorDocument["eventType"]): readonly ConditionDefinition[] {
  const ingestProvider: ConditionDefinition = {
    field: "ingestProvider",
    label: "Ingest provider restriction",
    operator: "equals",
    defaultValue: "twitch",
    options: [
      { label: "Direct Twitch", value: "twitch" },
      { label: "Streamer.bot", value: "streamerbot" }
    ]
  };
  switch (eventType) {
    case "raid":
      return [{ field: "raidViewers", label: "Raid viewer minimum", operator: "min", defaultValue: 10, minimum: 1 }, ingestProvider];
    case "cheer":
      return [{ field: "cheerAmount", label: "Cheer bits minimum", operator: "min", defaultValue: 100, minimum: 1 }, ingestProvider];
    case "subscription":
      return [{ field: "tier", label: "Subscription tier", operator: "equals", defaultValue: "1000", options: subscriptionTierOptions }, ingestProvider];
    case "resubscription":
      return [
        { field: "tier", label: "Subscription tier", operator: "equals", defaultValue: "1000", options: subscriptionTierOptions },
        { field: "tenureMonths", label: "Subscription months minimum", operator: "min", defaultValue: 2, minimum: 1 },
        ingestProvider
      ];
    case "gift_subscription":
      return [{ field: "tier", label: "Gift tier", operator: "equals", defaultValue: "1000", options: subscriptionTierOptions }, ingestProvider];
    case "community_gift":
      return [
        { field: "tier", label: "Gift tier", operator: "equals", defaultValue: "1000", options: subscriptionTierOptions },
        { field: "amount", label: "Gift count minimum", operator: "min", defaultValue: 5, minimum: 1 },
        ingestProvider
      ];
    case "hype_train_start":
    case "hype_train_progress":
    case "hype_train_end":
      return [
        { field: "level", label: "Level minimum", operator: "min", defaultValue: 1, minimum: 1 },
        { field: "progress", label: "Progress minimum", operator: "min", defaultValue: 100, minimum: 0 },
        { field: "total", label: "Total minimum", operator: "min", defaultValue: 100, minimum: 0 },
        ingestProvider
      ];
    case "poll_start":
    case "poll_progress":
      return [{ field: "totalVotes", label: "Total votes minimum", operator: "min", defaultValue: 10, minimum: 0 }, ingestProvider];
    case "poll_end":
      return [
        { field: "totalVotes", label: "Total votes minimum", operator: "min", defaultValue: 10, minimum: 0 },
        { field: "status", label: "Terminal status", operator: "equals", defaultValue: "completed", options: pollTerminalStatusOptions },
        ingestProvider
      ];
    case "prediction_start":
    case "prediction_progress":
    case "prediction_lock":
      return [
        { field: "totalPoints", label: "Total points minimum", operator: "min", defaultValue: 1_000, minimum: 0 },
        { field: "totalUsers", label: "Participant minimum", operator: "min", defaultValue: 10, minimum: 0 },
        ingestProvider
      ];
    case "prediction_end":
      return [
        { field: "totalPoints", label: "Total points minimum", operator: "min", defaultValue: 1_000, minimum: 0 },
        { field: "totalUsers", label: "Participant minimum", operator: "min", defaultValue: 10, minimum: 0 },
        { field: "status", label: "Terminal status", operator: "equals", defaultValue: "resolved", options: predictionTerminalStatusOptions },
        ingestProvider
      ];
    case "stream_online":
      return [{ field: "streamType", label: "Stream type", operator: "equals", defaultValue: "live", options: streamTypeOptions }, ingestProvider];
    case "stream_offline":
      return [ingestProvider];
    default:
      return [ingestProvider];
  }
}

const subscriptionTierOptions = [
  { label: "Prime", value: "prime" },
  { label: "Tier 1", value: "1000" },
  { label: "Tier 2", value: "2000" },
  { label: "Tier 3", value: "3000" }
] as const;

const pollTerminalStatusOptions = [
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
  { label: "Terminated", value: "terminated" }
] as const;

const predictionTerminalStatusOptions = [
  { label: "Resolved", value: "resolved" },
  { label: "Canceled", value: "canceled" }
] as const;

const streamTypeOptions = [
  { label: "Live", value: "live" },
  { label: "Watch party", value: "watch_party" },
  { label: "Premiere", value: "premiere" },
  { label: "Rerun", value: "rerun" }
] as const;

function replaceCondition(
  conditions: readonly EditorCondition[],
  index: number,
  condition: EditorCondition
): readonly EditorCondition[] {
  return conditions.map((candidate, candidateIndex) => candidateIndex === index ? condition : candidate);
}

function conditionValidationMessage(
  definition: Pick<ConditionDefinition, "label" | "minimum">,
  value: EditorCondition["value"]
): string | null {
  return definition.minimum !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < definition.minimum)
    ? `${definition.label} must be ${definition.minimum} or greater.`
    : null;
}

function alertDocumentConditionError(document: AlertEditorDocument): string | null {
  for (const condition of [...document.conditions, ...document.variantConditions]) {
    const definition = conditionDefinitions(document.eventType).find((candidate) => candidate.field === condition.field);
    if (definition === undefined) continue;
    const message = conditionValidationMessage(definition, condition.value);
    if (message !== null) return message;
  }
  return null;
}

const DEFAULT_CANVAS_VIEW: CanvasViewState = { zoom: 100, scrollLeft: 0, scrollTop: 0 };

function profileLayoutChanged(
  savedDocument: AlertEditorDocument,
  document: AlertEditorDocument,
  profileId: TargetProfileId
): boolean {
  const saved = savedDocument.targetProfiles.find((profile) => profile.id === profileId)?.layerLayouts ?? [];
  const current = document.targetProfiles.find((profile) => profile.id === profileId)?.layerLayouts ?? [];
  return saved.length !== current.length || saved.some((layout, index) => {
    const candidate = current[index];
    return candidate === undefined
      || layout.layerId !== candidate.layerId
      || layout.x !== candidate.x
      || layout.y !== candidate.y
      || layout.width !== candidate.width
      || layout.height !== candidate.height
      || layout.zIndex !== candidate.zIndex;
  });
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

function renderTemplateValue(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{([^{}]+)\}/gu, (_match, path: string) => {
    const value = path.trim().split(".").reduce<unknown>((current, segment) =>
      typeof current === "object" && current !== null ? (current as Record<string, unknown>)[segment] : undefined, values);
    return value === null || value === undefined || typeof value === "object" ? "" : String(value);
  });
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

function hasEnabledTts(document: AlertEditorDocument): boolean {
  return document.layers.some((layer) => layer.type === "tts" && layer.enabled);
}

function applyActiveTtsProvider(
  document: AlertEditorDocument,
  activeProvider: RegisteredProviderView | null
): AlertEditorDocument {
  if (activeProvider === null) return document;
  return {
    ...document,
    layers: document.layers.map((layer) => layer.type === "tts" && layer.enabled
      ? { ...layer, providerId: activeProvider.kind }
      : layer)
  };
}

function formatTtsProviderKind(kind: RegisteredProviderView["kind"]): string {
  return kind === "speakerbot" ? "Speaker.bot" : kind === "browser-speech" ? "Browser Speech" : capitalize(kind);
}

function missingActiveTtsProviderError(): ReportableActionError {
  return {
    ...actionableError(
      "Enabled TTS has no active provider",
      new Error("No active TTS provider is registered."),
      "Open TTS providers, validate a provider, and set it active before saving or sending TTS."
    ),
    correction: { label: "Open TTS providers", route: "/manage/tts-providers" }
  };
}

function actionableError(summary: string, cause: unknown, nextStep: string): ReportableActionError {
  const message = cause instanceof Error ? cause.message : "The request failed for an unknown reason.";
  const referenceId = /\b(?:ref|err)[_-][A-Za-z0-9_-]+\b/u.exec(message)?.[0]
    ?? `ui_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  return {
    summary,
    cause: message,
    nextStep,
    severity: "error",
    occurredAt: new Date().toISOString(),
    referenceId,
    correction: null
  };
}
