import {
  applyScreenEffectEdit,
  copyScreenEffectVariant,
  createScreenEffectAuthoringState,
  createScreenEffectDocument,
  createVideoAudioSettings,
  isStreamerBotSubscriptionAvailable,
  isScreenEffectAuthoringDirty,
  reconcileScreenEffectSaved,
  redoScreenEffectEdit,
  revertScreenEffectEdits,
  screenEffectDocumentSchema,
  undoScreenEffectEdit,
  type AssetLibraryItem,
  type EffectBinding,
  type EffectVariant,
  type ScreenEffectAuthoringState,
  type ScreenEffectDocument,
  type StreamerBotSubscriptionCatalog,
  type TwitchCustomReward
} from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetApi } from "../assets/asset-api.js";
import { AssetPicker } from "../assets/AssetPicker.js";
import { AssetPreview } from "../assets/AssetPreview.js";
import type { AudioApi } from "../audio/audio-api.js";
import { MediaAudioControls } from "../audio/MediaAudioControls.js";
import { ModalSurface } from "../foundation/ModalSurface.js";
import type { ManagementApi, TwitchConnectionStatusView } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import { updateEffectVariant } from "./effect-editor-state.js";
import type { ScreenEffectsApi } from "./screen-effects-api.js";
import "./screen-effects.css";

export interface ScreenEffectEditorProps {
  readonly api: ScreenEffectsApi;
  readonly assetApi: AssetApi;
  readonly audioApi: AudioApi;
  readonly managementApi: ManagementApi;
  readonly effectId: string;
  readonly create: boolean;
  readonly onBack: () => void;
  readonly generateId?: (prefix: string) => string;
}

type PickerTarget = "visual" | "sound" | null;

interface EditorContext {
  readonly assets: readonly AssetLibraryItem[];
  readonly routeNames: ReadonlyMap<string, string>;
  readonly twitch: TwitchConnectionStatusView | null;
  readonly rewards: readonly TwitchCustomReward[];
  readonly streamerBot: StreamerBotSubscriptionCatalog | null;
  readonly failures: readonly EditorContextFailure[];
}

interface EditorContextFailure {
  readonly source: string;
  readonly detail: string;
}

const emptyContext: EditorContext = {
  assets: [],
  routeNames: new Map(),
  twitch: null,
  rewards: [],
  streamerBot: null,
  failures: []
};
const visualMediaTypes = ["image", "gif", "video"] as const;
const soundMediaTypes = ["audio"] as const;

export function ScreenEffectEditor(props: ScreenEffectEditorProps) {
  const generateIdRef = useRef(props.generateId ?? defaultId);
  const generateId = generateIdRef.current;
  const [state, setState] = useState<ScreenEffectAuthoringState | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [context, setContext] = useState<EditorContext>(emptyContext);
  const [loading, setLoading] = useState(true);
  const [contextRetrying, setContextRetrying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [persisted, setPersisted] = useState(!props.create);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const documentRequest = props.create
      ? Promise.resolve(createScreenEffectDocument({
        id: props.effectId,
        name: "New Screen Effect",
        defaultVariantId: generateId("variant")
      }))
      : props.api.get(props.effectId);
    void Promise.all([
      documentRequest,
      loadEditorContext(props.managementApi, props.audioApi)
    ]).then(([document, loadedContext]) => {
      if (!active) return;
      setState(createScreenEffectAuthoringState(document));
      setPersisted(!props.create);
      setSelectedVariantId(document.variants[0]?.id ?? null);
      setContext(loadedContext);
      setError(null);
    }).catch((loadError: unknown) => {
      if (active) setError(message(loadError, "The Screen Effect editor could not be opened."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [generateId, props.api, props.audioApi, props.create, props.effectId, props.managementApi]);

  const document = state?.document ?? null;
  const selectedVariant = document?.variants.find((variant) => variant.id === selectedVariantId)
    ?? document?.variants[0]
    ?? null;
  const validation = document === null ? null : screenEffectDocumentSchema.safeParse(document);
  const dirty = state !== null && isScreenEffectAuthoringDirty(state);

  const edit = useCallback((update: (document: ScreenEffectDocument) => ScreenEffectDocument) => {
    setState((current) => current === null ? null : applyScreenEffectEdit(current, update));
    setNotice(null);
  }, []);

  const retryEditorContext = useCallback(async () => {
    setContextRetrying(true);
    try {
      setContext(await loadEditorContext(props.managementApi, props.audioApi, context));
    } finally {
      setContextRetrying(false);
    }
  }, [context, props.audioApi, props.managementApi]);

  const save = useCallback(async (confirmLiveImpact = false) => {
    if (state === null) return false;
    const parsed = screenEffectDocumentSchema.safeParse(state.document);
    if (!parsed.success) {
      setError(firstValidationMessage(parsed.error));
      return false;
    }
    if (!confirmLiveImpact && (state.savedDocument.enabled || parsed.data.enabled)) {
      setSaveConfirmationOpen(true);
      return false;
    }
    setBusy(true);
    try {
      const saved = persisted
        ? await props.api.update(props.effectId, parsed.data, confirmLiveImpact)
        : await props.api.create(parsed.data);
      setState((current) => current === null
        ? null
        : reconcileScreenEffectSaved(current, parsed.data, saved));
      setPersisted(true);
      setNotice("Screen Effect saved.");
      setError(null);
      setSaveConfirmationOpen(false);
      return true;
    } catch (saveError) {
      setError(message(saveError, "The Screen Effect was not saved. The draft is still here."));
      return false;
    } finally {
      setBusy(false);
    }
  }, [persisted, props.api, props.effectId, state]);

  const discard = useCallback(() => {
    setState((current) => current === null ? null : revertScreenEffectEdits(current));
    setError(null);
  }, []);

  const saveForNavigation = useCallback(() => save(false), [save]);

  useDirtyNavigationSource({
    id: `screen-effect-editor:${props.effectId}`,
    dirty,
    summary: "Screen Effect draft changes are unsaved.",
    save: saveForNavigation,
    discard
  });

  if (loading) return <p role="status">Loading Screen Effect editor…</p>;
  if (document === null || state === null || selectedVariant === null) {
    return <div className="management-card"><h2>The Screen Effect editor could not be opened</h2><p role="alert">{error ?? "The saved definition is unavailable."}</p><button onClick={props.onBack} type="button">Back to Screen Effects</button></div>;
  }

  return <div className="screen-effect-editor">
    <EditorHeader
      busy={busy}
      canRedo={state.future.length > 0}
      canSave={validation?.success === true && dirty}
      canUndo={state.past.length > 0}
      onBack={props.onBack}
      onPreview={() => setPreviewOpen(true)}
      onRedo={() => setState((current) => current === null ? null : redoScreenEffectEdit(current))}
      onSave={() => void save(false)}
      onTest={() => setTestOpen(true)}
      onUndo={() => setState((current) => current === null ? null : undoScreenEffectEdit(current))}
      testDisabled={!persisted || dirty || !document.enabled}
    />
    {notice === null ? null : <p role="status">{notice}</p>}
    {error === null ? null : <p role="alert">{error}</p>}
    {context.failures.length === 0 ? null : (
      <section className="screen-effect-editor__context-error" role="alert">
        <strong>Some editor context could not be loaded.</strong>
        <ul>{context.failures.map((failure) => (
          <li key={failure.source}><strong>{failure.source}:</strong> {failure.detail}</li>
        ))}</ul>
        <p>Data that loaded successfully remains available. Retry before relying on missing assets, routes, or trigger choices.</p>
        <button
          className="button button--secondary"
          disabled={contextRetrying}
          onClick={() => void retryEditorContext()}
          type="button"
        >{contextRetrying ? "Retrying editor context…" : "Retry editor context"}</button>
      </section>
    )}
    {validation?.success === false ? <p className="screen-effect-editor__validation" role="status">Draft needs attention: {firstValidationMessage(validation.error)}</p> : null}
    <div className="screen-effect-editor__workspace">
      <DocumentPanel document={document} edit={edit} isNew={!persisted} />
      <VariantPanel
        context={context}
        document={document}
        edit={edit}
        generateId={generateId}
        onOpenPicker={setPicker}
        onSelectVariant={setSelectedVariantId}
        selected={selectedVariant}
      />
    </div>
    <TriggerPanel context={context} document={document} edit={edit} generateId={generateId} />
    <AssetPicker
      assetApi={props.assetApi}
      compatibleMediaTypes={picker === "sound" ? soundMediaTypes : visualMediaTypes}
      managementApi={props.managementApi}
      onCancel={() => setPicker(null)}
      onSelect={(assetId, mediaType) => {
        const target = picker;
        setPicker(null);
        if (target === "visual" && mediaType !== "audio") {
          edit((current) => updateEffectVariant(current, selectedVariant.id, (variant) => ({
            ...variant,
            visual: mediaType === "video"
              ? { mediaType, assetId, layout: defaultLayout(), ...createVideoAudioSettings() }
              : { mediaType, assetId, layout: defaultLayout() },
            visualOutputs: { ...variant.visualOutputs, browserSource: true }
          })));
        }
        if (target === "sound" && mediaType === "audio") {
          edit((current) => updateEffectVariant(current, selectedVariant.id, (variant) => ({
            ...variant,
            sound: { assetId, volume: 1 }
          })));
        }
      }}
      open={picker !== null}
      selectedAssetId={(picker === "visual" ? selectedVariant.visual?.assetId : selectedVariant.sound?.assetId) ?? null}
    />
    <PreviewDialog
      assetApi={props.assetApi}
      assets={context.assets}
      onClose={() => setPreviewOpen(false)}
      open={previewOpen}
      variant={selectedVariant}
    />
    <LiveTestDialog
      api={props.api}
      document={document}
      onClose={() => setTestOpen(false)}
      onError={setError}
      onNotice={setNotice}
      open={testOpen}
      routeNames={context.routeNames}
      variant={selectedVariant}
    />
    <ModalSurface labelledBy="screen-effect-save-impact-title" onCancel={() => setSaveConfirmationOpen(false)} open={saveConfirmationOpen}>
      <div><h2 id="screen-effect-save-impact-title">Save live Screen Effect changes?</h2><p>Saving changes live admission. Current and queued occurrences keep their exact saved snapshot.</p><div className="management-modal__actions"><button className="button button--secondary" onClick={() => setSaveConfirmationOpen(false)} type="button">Cancel</button><button disabled={busy} onClick={() => void save(true)} type="button">Save live changes</button></div></div>
    </ModalSurface>
  </div>;
}

function EditorHeader(props: {
  readonly busy: boolean;
  readonly canRedo: boolean;
  readonly canSave: boolean;
  readonly canUndo: boolean;
  readonly onBack: () => void;
  readonly onPreview: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onTest: () => void;
  readonly onUndo: () => void;
  readonly testDisabled: boolean;
}) {
  return <header className="screen-effect-editor__header">
    <div><p className="management-eyebrow">Screen Effects</p><h1>Effect editor</h1><p>One visual, one optional sound, trusted triggers, and explicit destinations.</p></div>
    <div className="screen-effect-editor__actions">
      <button className="button button--secondary" onClick={props.onBack} type="button">Back</button>
      <button disabled={!props.canUndo} onClick={props.onUndo} type="button">Undo</button>
      <button disabled={!props.canRedo} onClick={props.onRedo} type="button">Redo</button>
      <button className="button button--secondary" onClick={props.onPreview} type="button">Preview silently</button>
      <button disabled={props.testDisabled} onClick={props.onTest} type="button">Live Test…</button>
      <button disabled={props.busy || !props.canSave} onClick={props.onSave} type="button">Save</button>
    </div>
  </header>;
}

function DocumentPanel({ document, edit, isNew }: {
  readonly document: ScreenEffectDocument;
  readonly edit: (update: (document: ScreenEffectDocument) => ScreenEffectDocument) => void;
  readonly isNew: boolean;
}) {
  return <section aria-labelledby="effect-details-title" className="management-card">
    <h2 id="effect-details-title">Effect details</h2>
    <label>Name<input aria-label="Effect name" maxLength={120} onChange={(event) => { const value = event.currentTarget.value; edit((current) => ({ ...current, name: value })); }} value={document.name} /></label>
    <label>Description<textarea aria-label="Effect description" maxLength={2000} onChange={(event) => { const value = emptyToNull(event.currentTarget.value); edit((current) => ({ ...current, description: value })); }} value={document.description ?? ""} /></label>
    <label>Category<input aria-label="Effect category" maxLength={80} onChange={(event) => { const value = emptyToNull(event.currentTarget.value); edit((current) => ({ ...current, category: value })); }} value={document.category ?? ""} /></label>
    <div className="screen-effects-fields-inline">
      <label>Priority<input aria-label="Effect priority" onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => edit((current) => ({ ...current, priority: value })))} step={1} type="number" value={document.priority} /></label>
      <label>Cooldown (seconds)<input aria-label="Effect cooldown" max={86400} min={0} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => edit((current) => ({ ...current, cooldownSeconds: value })))} step={1} type="number" value={document.cooldownSeconds} /></label>
    </div>
    <label className="screen-effects-check"><input checked={document.enabled} disabled={isNew} onChange={(event) => { const enabled = event.currentTarget.checked; edit((current) => ({ ...current, enabled })); }} type="checkbox" />Enabled</label>
    {isNew ? <p>New effects are saved disabled. Save valid media first, then enable from the inventory.</p> : null}
  </section>;
}

function VariantPanel(props: {
  readonly context: EditorContext;
  readonly document: ScreenEffectDocument;
  readonly edit: (update: (document: ScreenEffectDocument) => ScreenEffectDocument) => void;
  readonly generateId: (prefix: string) => string;
  readonly onOpenPicker: (target: PickerTarget) => void;
  readonly onSelectVariant: (id: string) => void;
  readonly selected: EffectVariant;
}) {
  const { context, document, edit, generateId, selected } = props;
  const visualAsset = selected.visual === null ? null : context.assets.find((item) => item.id === selected.visual?.assetId) ?? null;
  const soundAsset = selected.sound === null ? null : context.assets.find((item) => item.id === selected.sound?.assetId) ?? null;
  const update = (change: (variant: EffectVariant) => EffectVariant) => edit((current) =>
    updateEffectVariant(current, selected.id, change)
  );
  return <section aria-labelledby="effect-variant-title" className="management-card screen-effect-variant">
    <header className="screen-effects-section-header"><div><h2 id="effect-variant-title">Variants</h2><p>Enabled weighted variants are chosen by weight; otherwise the enabled default is used.</p></div><button className="button button--secondary" disabled={screenEffectDocumentSchema.safeParse(document).success === false || document.variants.length >= 50} onClick={() => {
      const id = generateId("variant");
      edit((current) => copyScreenEffectVariant(current, selected.id, { id, name: `${selected.name} copy` }));
      props.onSelectVariant(id);
    }} type="button">Copy variant</button></header>
    <div aria-label="Effect variants" className="screen-effect-variant-tabs" role="tablist">{document.variants.map((variant) => <button aria-selected={variant.id === selected.id} key={variant.id} onClick={() => props.onSelectVariant(variant.id)} role="tab" type="button">{variant.name}</button>)}</div>
    <div className="screen-effects-fields-inline">
      <label>Variant name<input aria-label="Variant name" maxLength={120} onChange={(event) => { const name = event.currentTarget.value; update((variant) => ({ ...variant, name })); }} value={selected.name} /></label>
      <label>Kind<select aria-label="Variant kind" disabled={selected.kind === "default"} onChange={(event) => { const kind = event.currentTarget.value as "weighted"; update((variant) => ({ ...variant, kind })); }} value={selected.kind}><option value="default">Default</option><option value="weighted">Weighted</option></select></label>
      <label>Weight<input aria-label="Variant weight" disabled={selected.kind === "default"} max={10000} min={1} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, weight: value })))} type="number" value={selected.weight} /></label>
      <label>Duration (seconds)<input aria-label="Variant duration" max={120} min={1} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, durationMs: value * 1000 })))} type="number" value={selected.durationMs / 1000} /></label>
    </div>
    <label className="screen-effects-check"><input checked={selected.enabled} disabled={selected.kind === "default"} onChange={(event) => { const enabled = event.currentTarget.checked; update((variant) => ({ ...variant, enabled })); }} type="checkbox" />Variant enabled</label>
    <MediaPanel asset={visualAsset} onChoose={() => props.onOpenPicker("visual")} onRemove={() => update((variant) => ({ ...variant, visual: null }))} selected={selected} update={update} />
    <SoundPanel asset={soundAsset} onChoose={() => props.onOpenPicker("sound")} onRemove={() => update((variant) => ({ ...variant, sound: null }))} selected={selected} update={update} />
    <DestinationPanel routeNames={context.routeNames} selected={selected} update={update} />
    <AnimationPanel selected={selected} update={update} />
  </section>;
}

function MediaPanel({ asset, onChoose, onRemove, selected, update }: {
  readonly asset: AssetLibraryItem | null;
  readonly onChoose: () => void;
  readonly onRemove: () => void;
  readonly selected: EffectVariant;
  readonly update: (change: (variant: EffectVariant) => EffectVariant) => void;
}) {
  const visual = selected.visual;
  return <fieldset className="screen-effect-media">
    <legend>Visual</legend>
    <p>{visual === null ? "No visual selected." : asset === null ? `Unavailable ${visual.mediaType} asset (${visual.assetId})` : `${asset.displayName} · ${visual.mediaType}`}</p>
    <div>
      <button className="button button--secondary" onClick={onChoose} type="button">Choose visual asset</button>
      {visual === null ? null : <button className="button button--secondary" onClick={onRemove} type="button">Remove visual</button>}
    </div>
    {visual === null ? null : <>
      <LayoutFields selected={selected} update={update} />
      <div className="screen-effects-fields-inline">
        <label className="screen-effects-check"><input checked={selected.visualOutputs.browserSource} onChange={(event) => { const browserSource = event.currentTarget.checked; update((variant) => ({ ...variant, visualOutputs: { ...variant.visualOutputs, browserSource } })); }} type="checkbox" />OBS Browser Source</label>
        <label className="screen-effects-check"><input checked={selected.visualOutputs.desktop} onChange={(event) => { const desktop = event.currentTarget.checked; update((variant) => ({ ...variant, visualOutputs: { ...variant.visualOutputs, desktop } })); }} type="checkbox" />Desktop overlay</label>
      </div>
      {visual.mediaType === "video" ? <MediaAudioControls
        checkboxClassName="screen-effects-check"
        hasSeparateAudio={selected.sound !== null}
        onChange={(value) => update((variant) => ({
          ...variant,
          visual: variant.visual?.mediaType === "video" ? { ...variant.visual, ...value } : variant.visual
        }))}
        value={{ playEmbeddedAudio: visual.playEmbeddedAudio, audioVolume: visual.audioVolume }}
      /> : null}
    </>}
  </fieldset>;
}

function LayoutFields({ selected, update }: {
  readonly selected: EffectVariant;
  readonly update: (change: (variant: EffectVariant) => EffectVariant) => void;
}) {
  if (selected.visual === null) return null;
  return <div className="screen-effects-fields-inline">
    {(["x", "y", "width", "height"] as const).map((field) => <label key={field}>{field.toUpperCase()}<input aria-label={`Visual ${field}`} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, visual: variant.visual === null ? null : { ...variant.visual, layout: { ...variant.visual.layout, [field]: value } } })))} type="number" value={selected.visual!.layout[field]} /></label>)}
  </div>;
}

function SoundPanel({ asset, onChoose, onRemove, selected, update }: {
  readonly asset: AssetLibraryItem | null;
  readonly onChoose: () => void;
  readonly onRemove: () => void;
  readonly selected: EffectVariant;
  readonly update: (change: (variant: EffectVariant) => EffectVariant) => void;
}) {
  return <fieldset>
    <legend>Separate sound</legend>
    <p>{selected.sound === null ? "No separate sound selected." : asset === null ? `Unavailable audio asset (${selected.sound.assetId})` : asset.displayName}</p>
    <div>
      <button className="button button--secondary" onClick={onChoose} type="button">Choose sound asset</button>
      {selected.sound === null ? null : <button className="button button--secondary" onClick={onRemove} type="button">Remove sound</button>}
    </div>
    {selected.sound === null ? null : <label>Sound volume<input aria-label="Sound volume" max={1} min={0} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, sound: variant.sound === null ? null : { ...variant.sound, volume: value } })))} step={0.01} type="number" value={selected.sound.volume} /></label>}
  </fieldset>;
}

function DestinationPanel({ routeNames, selected, update }: {
  readonly routeNames: ReadonlyMap<string, string>;
  readonly selected: EffectVariant;
  readonly update: (change: (variant: EffectVariant) => EffectVariant) => void;
}) {
  const hasAudio = selected.sound !== null || (selected.visual?.mediaType === "video" && selected.visual.playEmbeddedAudio);
  return <fieldset>
    <legend>Audio destinations</legend>
    <p>Soundtrack and separate sound share these explicit destinations.</p>
    <label className="screen-effects-check"><input checked={selected.outputs.browserSource} disabled={!hasAudio} onChange={(event) => { const browserSource = event.currentTarget.checked; update((variant) => ({ ...variant, outputs: { ...variant.outputs, browserSource } })); }} type="checkbox" />OBS Browser Source audio</label>
    {[...routeNames].map(([routeId, name]) => <label className="screen-effects-check" key={routeId}><input checked={selected.outputs.deviceRouteIds.includes(routeId)} disabled={!hasAudio} onChange={(event) => { const checked = event.currentTarget.checked; update((variant) => ({
      ...variant,
      outputs: { ...variant.outputs, deviceRouteIds: checked ? [...variant.outputs.deviceRouteIds, routeId] : variant.outputs.deviceRouteIds.filter((id) => id !== routeId) }
    })); }} type="checkbox" />{name}</label>)}
    {selected.outputs.deviceRouteIds.filter((id) => !routeNames.has(id)).map((id) => <p key={id}>Unavailable audio route: {id}</p>)}
    {routeNames.size === 0 ? <p>No named device routes are available. Configure them in Settings.</p> : null}
  </fieldset>;
}

function AnimationPanel({ selected, update }: {
  readonly selected: EffectVariant;
  readonly update: (change: (variant: EffectVariant) => EffectVariant) => void;
}) {
  return <fieldset>
    <legend>Animation</legend>
    <label className="screen-effects-check"><input checked={selected.animation !== null} onChange={(event) => { const checked = event.currentTarget.checked; update((variant) => ({ ...variant, animation: checked ? defaultAnimation() : null })); }} type="checkbox" />Use a preset animation</label>
    {selected.animation === null ? null : <div className="screen-effects-fields-inline">
      <label>Entrance<select aria-label="Animation entrance" onChange={(event) => { const entrance = event.currentTarget.value; update((variant) => ({ ...variant, animation: variant.animation === null ? null : { ...variant.animation, entrance } })); }} value={selected.animation.entrance}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-up">Slide up</option></select></label>
      <label>Exit<select aria-label="Animation exit" onChange={(event) => { const exit = event.currentTarget.value; update((variant) => ({ ...variant, animation: variant.animation === null ? null : { ...variant.animation, exit } })); }} value={selected.animation.exit}><option value="none">None</option><option value="fade">Fade</option><option value="scale">Scale</option><option value="slide-down">Slide down</option></select></label>
      <label>Animation duration (ms)<input aria-label="Animation duration" max={120000} min={0} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, animation: variant.animation === null ? null : { ...variant.animation, durationMs: value } })))} type="number" value={selected.animation.durationMs} /></label>
      <label>Animation delay (ms)<input aria-label="Animation delay" max={120000} min={0} onChange={(event) => updateNumber(event.currentTarget.valueAsNumber, (value) => update((variant) => ({ ...variant, animation: variant.animation === null ? null : { ...variant.animation, delayMs: value } })))} type="number" value={selected.animation.delayMs} /></label>
    </div>}
  </fieldset>;
}

function TriggerPanel({ context, document, edit, generateId }: {
  readonly context: EditorContext;
  readonly document: ScreenEffectDocument;
  readonly edit: (update: (document: ScreenEffectDocument) => ScreenEffectDocument) => void;
  readonly generateId: (prefix: string) => string;
}) {
  function add(binding: EffectBinding) {
    edit((current) => ({ ...current, bindings: [...current.bindings, binding] }));
  }
  return <section aria-labelledby="effect-triggers-title" className="management-card screen-effect-triggers">
    <header><h2 id="effect-triggers-title">Trusted triggers</h2><p>Only saved Twitch rewards and explicitly configured Streamer.bot subscriptions can trigger effects.</p></header>
    <ul>{document.bindings.map((binding) => <li key={binding.id}>
      <span>{bindingLabel(binding)}</span>
      <strong>{bindingAvailable(binding, context) ? "Configured" : "Unavailable — review event source setup"}</strong>
      <button className="button button--secondary" onClick={() => edit((current) => ({ ...current, bindings: current.bindings.filter((item) => item.id !== binding.id) }))} type="button">Remove trigger</button>
    </li>)}</ul>
    {document.bindings.length === 0 ? <p>No trigger configured. The effect can only be previewed or explicitly tested.</p> : null}
    <AddTriggerControls add={add} context={context} generateId={generateId} />
    <a href="/manage/event-sources">Review event source and subscription setup</a>
  </section>;
}

function AddTriggerControls({ add, context, generateId }: {
  readonly add: (binding: EffectBinding) => void;
  readonly context: EditorContext;
  readonly generateId: (prefix: string) => string;
}) {
  const [rewardId, setRewardId] = useState("");
  const [streamerSelection, setStreamerSelection] = useState("");
  const streamerBot = context.streamerBot;
  const streamerOptions = streamerBot === null ? [] : streamerBot.selected.flatMap((selection) =>
    selection.eventTypes.flatMap((eventType) =>
      isStreamerBotSubscriptionAvailable(streamerBot, selection.sourceKey, eventType)
        ? [{
            value: JSON.stringify([selection.sourceKey, eventType]),
            label: `${selection.sourceKey} / ${eventType}`,
            sourceKey: selection.sourceKey,
            eventType
          }]
        : []
    )
  );
  return <div className="screen-effect-trigger-adders">
    <label>Twitch reward<select aria-label="Twitch reward" onChange={(event) => setRewardId(event.currentTarget.value)} value={rewardId}><option value="">Choose a configured reward</option>{context.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.title}</option>)}</select></label>
    <button disabled={rewardId === "" || context.twitch?.connected !== true} onClick={() => {
      if (context.twitch?.connected !== true || rewardId === "") return;
      add({ id: generateId("binding"), kind: "twitch-reward", broadcasterId: context.twitch.account.accountId, rewardId });
      setRewardId("");
    }} type="button">Add reward trigger</button>
    <label>Streamer.bot event<select aria-label="Streamer.bot event" onChange={(event) => setStreamerSelection(event.currentTarget.value)} value={streamerSelection}><option value="">Choose a configured subscription</option>{streamerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <button disabled={streamerSelection === "" || context.streamerBot === null} onClick={() => {
      const option = streamerOptions.find((candidate) => candidate.value === streamerSelection);
      if (option === undefined || context.streamerBot === null) return;
      add({ id: generateId("binding"), kind: "streamerbot-event", providerId: context.streamerBot.providerId, sourceKey: option.sourceKey, eventType: option.eventType });
      setStreamerSelection("");
    }} type="button">Add Streamer.bot trigger</button>
  </div>;
}

function PreviewDialog({ assetApi, assets, onClose, open, variant }: {
  readonly assetApi: AssetApi;
  readonly assets: readonly AssetLibraryItem[];
  readonly onClose: () => void;
  readonly open: boolean;
  readonly variant: EffectVariant;
}) {
  const visual = variant.visual === null ? null : assets.find((item) => item.id === variant.visual?.assetId) ?? null;
  return <ModalSurface labelledBy="screen-effect-preview-title" onCancel={onClose} open={open}>
    <div className="screen-effect-preview">
      <p className="management-eyebrow">Local silent preview</p>
      <h2 id="screen-effect-preview-title">{variant.name}</h2>
      <p>This bounded preview never sends provider events, device sound, or Browser Source audio.</p>
      <div aria-label="1920 by 1080 preview canvas" className="screen-effect-preview__canvas">
        {visual === null ? <p>{variant.visual === null ? "This variant has no visual." : "The selected visual asset is unavailable."}</p> : <AssetPreview assetApi={assetApi} item={visual} />}
      </div>
      {variant.sound === null && !(variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio) ? <p>Silent selection.</p> : <p>Audio is intentionally suppressed in Preview.</p>}
      <div className="management-modal__actions"><button onClick={onClose} type="button">Close preview</button></div>
    </div>
  </ModalSurface>;
}

function LiveTestDialog({ api, document, onClose, onError, onNotice, open, routeNames, variant }: {
  readonly api: ScreenEffectsApi;
  readonly document: ScreenEffectDocument;
  readonly onClose: () => void;
  readonly onError: (message: string | null) => void;
  readonly onNotice: (message: string | null) => void;
  readonly open: boolean;
  readonly routeNames: ReadonlyMap<string, string>;
  readonly variant: EffectVariant;
}) {
  const [busy, setBusy] = useState(false);
  const destinations = useMemo(() => effectDestinationNames(variant, routeNames), [routeNames, variant]);
  async function send() {
    setBusy(true);
    try {
      const result = await api.test(document.id, variant.id, true);
      if (result.status === "queued") {
        onNotice(`Live Test queued as ${result.occurrenceId ?? "a new occurrence"}. Pause or DND may hold it; review Operator for authoritative state.`);
        onError(null);
        onClose();
      } else {
        onError(`Live Test was not queued: ${result.status.replace("-", " ")}.`);
      }
    } catch (testError) {
      onError(message(testError, "The live Screen Effect test did not start."));
    } finally {
      setBusy(false);
    }
  }
  return <ModalSurface labelledBy="screen-effect-live-test-title" onCancel={onClose} open={open}>
    <div>
      <p className="management-eyebrow">Explicit live output</p>
      <h2 id="screen-effect-live-test-title">Send live Screen Effect test?</h2>
      <p>The saved {variant.name} variant is used exactly; weighted selection is not rerun.</p>
      <p>Selected destinations (current connection and device readiness are checked when you confirm):</p>
      {destinations.length === 0 ? <p role="alert">No destination is selected.</p> : <ul>{destinations.map((destination) => <li key={destination}>{destination}</li>)}</ul>}
      <div className="management-modal__actions"><button className="button button--secondary" onClick={onClose} type="button">Cancel</button><button disabled={busy || destinations.length === 0} onClick={() => void send()} type="button">Confirm live test</button></div>
    </div>
  </ModalSurface>;
}

async function loadEditorContext(
  managementApi: ManagementApi,
  audioApi: AudioApi,
  previous: EditorContext = emptyContext
): Promise<EditorContext> {
  const [assetsResult, audioResult, twitchStatusResult, streamerResult] = await Promise.allSettled([
    managementApi.listAssetLibraryItems(),
    audioApi.getStatus(),
    managementApi.getTwitchStatus(),
    loadStreamerBotContext(managementApi)
  ]);
  let rewardsResult: PromiseSettledResult<readonly TwitchCustomReward[]> | null = null;
  if (twitchStatusResult.status === "fulfilled") {
    if (twitchStatusResult.value.connected) {
      const [rewardEnvelopeResult] = await Promise.allSettled([managementApi.getTwitchCustomRewards()]);
      rewardsResult = rewardEnvelopeResult.status === "fulfilled"
        ? { status: "fulfilled", value: rewardEnvelopeResult.value.rewards }
        : rewardEnvelopeResult;
    } else {
      rewardsResult = { status: "fulfilled", value: [] };
    }
  }
  const failures = [
    toContextFailure("Asset library", assetsResult, "The asset library could not be loaded."),
    toContextFailure("Audio outputs", audioResult, "Audio output routes could not be loaded."),
    toContextFailure("Twitch connection", twitchStatusResult, "Twitch connection status could not be loaded."),
    ...(rewardsResult === null
      ? []
      : [toContextFailure("Twitch rewards", rewardsResult, "Twitch rewards could not be loaded.")]),
    toContextFailure("Streamer.bot events", streamerResult, "Streamer.bot subscriptions could not be loaded.")
  ].filter((failure): failure is EditorContextFailure => failure !== null);
  return {
    assets: assetsResult.status === "fulfilled" ? assetsResult.value : previous.assets,
    routeNames: new Map(audioResult.status === "fulfilled"
      ? audioResult.value.routes.map((status) => [status.route.id, status.route.name] as const)
      : previous.routeNames),
    twitch: twitchStatusResult.status === "fulfilled" ? twitchStatusResult.value : previous.twitch,
    rewards: rewardsResult?.status === "fulfilled" ? rewardsResult.value : previous.rewards,
    streamerBot: streamerResult.status === "fulfilled" ? streamerResult.value : previous.streamerBot,
    failures
  };
}

function toContextFailure(
  source: string,
  result: PromiseSettledResult<unknown>,
  fallback: string
): EditorContextFailure | null {
  return result.status === "fulfilled"
    ? null
    : { source, detail: message(result.reason, fallback) };
}

async function loadStreamerBotContext(managementApi: ManagementApi): Promise<StreamerBotSubscriptionCatalog | null> {
  const providers = await managementApi.listRegisteredProviders("event-source");
  const provider = providers.find((candidate) => candidate.kind === "streamerbot" && candidate.active);
  return provider === undefined ? null : managementApi.getStreamerBotSubscriptions(provider.id);
}

function bindingLabel(binding: EffectBinding): string {
  return binding.kind === "twitch-reward"
    ? `Twitch reward ${binding.rewardId}`
    : `Streamer.bot ${binding.sourceKey} / ${binding.eventType}`;
}

function bindingAvailable(binding: EffectBinding, context: EditorContext): boolean {
  if (binding.kind === "twitch-reward") {
    return context.twitch?.connected === true
      && context.twitch.account.accountId === binding.broadcasterId
      && context.rewards.some((reward) => reward.id === binding.rewardId);
  }
  return context.streamerBot?.providerId === binding.providerId
    && isStreamerBotSubscriptionAvailable(context.streamerBot, binding.sourceKey, binding.eventType);
}

function effectDestinationNames(variant: EffectVariant, routeNames: ReadonlyMap<string, string>): string[] {
  const names: string[] = [];
  if (variant.visual !== null && variant.visualOutputs.browserSource) names.push("OBS Browser Source visual");
  if (variant.visual !== null && variant.visualOutputs.desktop) names.push("Desktop overlay visual");
  const hasAudio = variant.sound !== null || (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio);
  if (hasAudio && variant.outputs.browserSource) names.push("OBS Browser Source audio");
  if (hasAudio) {
    for (const routeId of variant.outputs.deviceRouteIds) {
      names.push(routeNames.get(routeId) ?? `Unavailable audio route ${routeId}`);
    }
  }
  return names;
}

function defaultLayout() {
  return { x: 0, y: 0, width: 1920, height: 1080, zIndex: 0 };
}

function defaultAnimation() {
  return { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };
}

function defaultId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function updateNumber(value: number, update: (value: number) => void): void {
  if (Number.isFinite(value)) update(value);
}

function firstValidationMessage(error: { readonly issues: readonly { readonly message: string }[] }): string {
  return error.issues[0]?.message ?? "Resolve the highlighted draft values before saving.";
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== "" ? error.message : fallback;
}
