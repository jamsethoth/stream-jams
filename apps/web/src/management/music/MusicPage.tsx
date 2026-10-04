import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import { createMusicViewAppearance, fitMusicComponentLayout, musicModuleConfigSchema, musicPublicAssetReferenceSchema, projectMusicWidget, type AssetLibraryItem, type MusicAssetResolver, type MusicCssConfig, type MusicModuleConfig, type MusicProfileConfig, type MusicSnapshot, type OverlayOutputView } from "@stream-jams/core";
import type { MusicCssValidationResult } from "@stream-jams/core/music-style-policy";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { AssetApi } from "../assets/asset-api.js";
import { useMediaPreviewGroup } from "../assets/use-media-preview-group.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { actionableError, type AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import type { MusicApi } from "./music-api.js";
import type { ManagementApi } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import type { MusicFontRole } from "./MusicAppearanceEditor.js";
const MusicAppearanceEditor = lazy(() => import("./MusicAppearanceEditor.js").then(module => ({ default: module.MusicAppearanceEditor })));
const MusicBrandingEditor = lazy(() => import("./MusicBrandingEditor.js").then(module => ({ default: module.MusicBrandingEditor })));
const MusicCssEditor = lazy(() => import("./MusicCssEditor.js").then(module => ({ default: module.MusicCssEditor })));
const MusicLayoutEditor = lazy(() => import("./MusicLayoutEditor.js").then(module => ({ default: module.MusicLayoutEditor })));
const MusicDesktopPlacement = lazy(() => import("./MusicDesktopPlacement.js").then(module => ({ default: module.MusicDesktopPlacement })));
import type { SurfaceSettingsApi } from "../settings/overlay-surfaces-api.js";
import "./music.css";

export type MusicPageApi = Pick<MusicApi, "getMusicConfig" | "saveMusicConfig" | "listMusicOutputs"> & Pick<ManagementApi, "createOverlayOutputKey" | "regenerateOverlayOutputKey"> & AssetLibraryManagementApi;
const fixtureTime = 1_000_000;
const fixture: MusicSnapshot = {
  providerId: "preview", generation: "fixture", revision: 1,
  track: { id: "preview-track", title: "A long song title shown here for layout preview", artists: ["Example artist", "Second artist"], album: "Example album", artworkRef: null },
  playbackState: "playing", positionMs: 45_000, durationMs: 180_000, observedAtEpochMs: fixtureTime, session: null
};

export function MusicPage({ api, assetApi, surfaceApi }: { readonly api: MusicPageApi; readonly assetApi: AssetApi; readonly surfaceApi?: Pick<SurfaceSettingsApi, "load"> | undefined }) {
  const [saved, setSaved] = useState<{ enabled: boolean; config: MusicModuleConfig } | null>(null);
  const [draft, setDraft] = useState<MusicModuleConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [profileId, setProfileId] = useState<"landscape" | "vertical">("landscape");
  const [view, setView] = useState<"full" | "compact">("full");
  const [assets, setAssets] = useState<readonly AssetLibraryItem[]>([]);
  const [outputs, setOutputs] = useState<readonly OverlayOutputView[]>([]);
  const [picker, setPicker] = useState<"brand" | MusicFontRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [cssOpen, setCssOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [error, setError] = useState<ReturnType<typeof actionableError> | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [validation, setValidation] = useState<MusicCssValidationResult | null>(null);
  const [checkingCss, setCheckingCss] = useState(false);
  const [lastValidCss, setLastValidCss] = useState<MusicCssConfig>({ source: "", enabled: false, styleContractVersion: 1 });
  const cssGeneration = useRef(0);
  const draftRevision = useRef(0);
  const mounted = useRef(true);
  const updateDraft = (update: (current: MusicModuleConfig) => MusicModuleConfig) => { draftRevision.current += 1; setDraft(current => current === null ? null : update(current)); };
  const updateEnabled = (value: boolean) => { draftRevision.current += 1; setEnabled(value); };

  useEffect(() => {
    let live = true;
    mounted.current = true;
    void Promise.all([api.getMusicConfig(), api.listAssetLibraryItems(), api.listMusicOutputs()]).then(([config, items, availableOutputs]) => {
      if (!live) return;
      setSaved(config); setDraft(config.config); setEnabled(config.enabled); setAssets(items); setOutputs(availableOutputs); setError(null); setLoading(false);
    }).catch((cause: unknown) => { if (live) { setError(actionableError(cause, "Unable to load Music appearance", "Check the local service and reload this page.")); setLoading(false); } });
    return () => { live = false; mounted.current = false; cssGeneration.current += 1; };
  }, [api]);

  useEffect(() => {
    if (draft === null) return;
    const request = ++cssGeneration.current;
    let live = true;
    setCheckingCss(true);
    void import("@stream-jams/core/music-style-policy").then(({ validateMusicCss }) => {
      const result = validateMusicCss(draft.css.source, draft.css.styleContractVersion);
      if (!live || request !== cssGeneration.current) return;
      setValidation(result);
      if (result.valid) setLastValidCss(draft.css);
    }).catch((cause: unknown) => {
      if (live && request === cssGeneration.current) setValidation({ valid: false, errors: [{ line: 1, column: 1, message: cause instanceof Error ? cause.message : "CSS validation unavailable" }] });
    }).finally(() => { if (live && request === cssGeneration.current) setCheckingCss(false); });
    return () => { live = false; };
  }, [draft?.css.source, draft?.css.styleContractVersion]);

  const dirty = saved !== null && draft !== null && (enabled !== saved.enabled || JSON.stringify(draft) !== JSON.stringify(saved.config));
  const discard = useCallback(() => { if (saved !== null) { draftRevision.current += 1; setDraft(saved.config); setEnabled(saved.enabled); } }, [saved]);
  const save = useCallback(async () => {
    if (draft === null || saved === null) return false;
    const revision = draftRevision.current;
    setBusy(true); setError(null);
    try {
      const parsed = musicModuleConfigSchema.parse(draft);
      const { validateMusicCss } = await import("@stream-jams/core/music-style-policy");
      const css = validateMusicCss(parsed.css.source, parsed.css.styleContractVersion);
      const recovery = !parsed.css.enabled && saved.config.css.enabled && parsed.css.source === saved.config.css.source
        && parsed.css.styleContractVersion === saved.config.css.styleContractVersion && enabled === saved.enabled
        && JSON.stringify({ ...parsed, css: { ...parsed.css, enabled: true } }) === JSON.stringify(saved.config);
      if (!css.valid && !recovery) throw new Error(`CSS line ${css.errors[0]?.line ?? 1}, column ${css.errors[0]?.column ?? 1}: ${css.errors[0]?.message ?? "invalid stylesheet"}`);
      const result = await api.saveMusicConfig(enabled, parsed);
      if (!mounted.current) return true;
      setSaved(result);
      if (draftRevision.current === revision) { setDraft(result.config); setEnabled(result.enabled); }
      const stillCurrent = draftRevision.current === revision;
      setNotice({ tone: "success", message: stillCurrent ? "Music appearance saved." : "Earlier Music appearance saved. Newer edits remain unsaved." });
      return stillCurrent;
    } catch (cause) { if (mounted.current) setError(actionableError(cause, "Unable to save Music appearance", "Correct the highlighted values or CSS, then save again.")); return false; }
    finally { if (mounted.current) setBusy(false); }
  }, [api, draft, enabled, saved]);
  useDirtyNavigationSource({ id: "music-appearance", summary: "Music appearance has unsaved changes.", dirty, save, discard });

  const profile = draft?.profiles[profileId] ?? null;
  const appearance = profile?.views[view] ?? null;
  const selectedImage = assets.find(item => item.id === appearance?.branding.assetId && item.mediaType === "image" && item.health === "available") ?? null;
  const desktopAssetIds = desktopOpen && draft !== null ? Object.values(draft.profiles.landscape.views).flatMap(item => [item.branding.assetId, item.titleFont.fontAssetId, item.detailsFont.fontAssetId]) : [];
  const requiredIds = [...(appearance === null ? [] : [appearance.branding.assetId, appearance.titleFont.fontAssetId, appearance.detailsFont.fontAssetId]), ...desktopAssetIds].filter((id): id is string => id !== null);
  const { descriptors, unavailable: mediaUnavailable } = useMediaPreviewGroup(assetApi, requiredIds);
  const projection = useMemo(() => {
    if (draft === null) return null;
    const previewConfig = { ...draft, profiles: { ...draft.profiles, [profileId]: { ...draft.profiles[profileId], initialView: view, idleMode: "none" as const } }, css: { ...lastValidCss, enabled: draft.css.enabled && lastValidCss.source !== "" } };
    const result = projectMusicWidget(fixture, { state: "connected", stale: false, diagnosticReference: null }, previewConfig, profileId, fixtureTime, fixtureTime);
    if (result === null) return null;
    return { ...result, assets: Object.values(descriptors).map(descriptor => musicPublicAssetReferenceSchema.safeParse(descriptor.snapshot)).filter(candidate => candidate.success).map(candidate => candidate.data) };
  }, [draft, lastValidCss, profileId, view, descriptors]);
  const resolver: MusicAssetResolver = useMemo(() => ({ resolveAsset: asset => descriptors[asset.assetId]?.url ?? null, resolveArtwork: () => null }), [descriptors]);
  const changeProfile = (next: MusicProfileConfig) => updateDraft(current => ({ ...current, profiles: { ...current.profiles, [profileId]: { ...next, views: { full: fitMusicComponentLayout(next.views.full), compact: fitMusicComponentLayout(next.views.compact) } } } }));
  const changeAppearance = (next: NonNullable<typeof appearance>) => { if (profile !== null) changeProfile({ ...profile, views: { ...profile.views, [view]: next } }); };
  async function createOutput(output: OverlayOutputView) {
    if (output.copyableUrlStatus === "regenerate-required" && !window.confirm(`Regenerate the ${output.label} URL? The old URL will stop working.`)) return;
    setBusy(true); setError(null);
    try {
      const request = { overlayId: output.overlayId, scope: "module" as const, moduleId: "music", purpose: output.purpose, targetProfileId: output.targetProfileId };
      const result = output.copyableUrlStatus === "regenerate-required" ? await api.regenerateOverlayOutputKey(request) : await api.createOverlayOutputKey(request);
      if (!mounted.current) return;
      setOutputs(current => current.map(item => item.id === output.id ? { ...item, keyId: result.keyId, url: result.url, copyableUrlStatus: "available" as const } : item));
      setNotice({ tone: "success", message: `${output.label} URL is ready. Add it to a browser source in OBS.` });
    } catch (cause) { if (mounted.current) setError(actionableError(cause, "Unable to create Music output link", "Check the output settings and retry.")); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function copyOutput(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice({ tone: "success", message: "Music output URL copied." }); }
    catch (cause) { setError(actionableError(cause, "Unable to copy Music output URL", "Use Open output to inspect the URL, or allow clipboard access and retry.")); }
  }

  if (loading) return <p role="status">Loading Music appearance…</p>;
  if (draft === null || profile === null || appearance === null) return <div><p role="alert">Music appearance could not be loaded.</p>{error === null ? null : <ManagementErrorBanner error={error} />}</div>;
  return <div className="music-editor">
    {error === null ? null : <ManagementErrorBanner error={error} />}
    <BrowserSourcesPanel label="Music output links" detailsId="music-browser-sources" expanded={sourcesOpen} onToggle={() => setSourcesOpen(current => !current)} readyCount={outputs.filter(output => output.targetProfileId === profileId && output.url !== null).length} needsSetupCount={outputs.filter(output => output.targetProfileId === profileId && output.url === null).length} description="One live or test URL per output profile." context={profileId === "landscape" ? "Landscape" : "Vertical"}>
      <p>One live or test URL per output profile. Create a link, then add it as a browser source in OBS.</p>
      <div className="music-editor__actions">{outputs.filter(output => output.targetProfileId === profileId).map(output => <div key={output.id}><strong>{output.purpose === "live" ? "Live" : "Test"}</strong>{output.url === null ? <button disabled={busy} onClick={() => void createOutput(output)} type="button">{output.copyableUrlStatus === "regenerate-required" ? "Regenerate" : "Create"} {output.purpose} output link</button> : <><a href={output.url} rel="noreferrer" target="_blank">Open {output.purpose} output</a><button onClick={() => void copyOutput(output.url!)} type="button">Copy {output.purpose} output URL</button></>}</div>)}</div>
      {outputs.length === 0 ? <p role="status">No Music outputs were returned. Check the local service and reload this page.</p> : null}
    </BrowserSourcesPanel>
    <section aria-label="Music preview" className="music-editor__section"><h3>Preview</h3>
<div className="music-editor__grid"><label>Output profile<select value={profileId} onChange={event => setProfileId(event.currentTarget.value as typeof profileId)}><option value="landscape">Landscape</option><option value="vertical">Vertical</option></select></label><label>Preview view<select value={view} onChange={event => setView(event.currentTarget.value as typeof view)}><option value="full">Full</option><option value="compact">Compact</option></select></label></div><p>Unsaved changes appear here only. Live output continues using saved settings.</p>
      {mediaUnavailable ? <p role="status">A preview image or font is unavailable. The native fallback is shown. Reselect the asset to retry.</p> : null}
      <Suspense fallback={<p role="status">Loading Music preview…</p>}><MusicLayoutEditor key={`${profileId}-${view}`} projection={projection} resolveAsset={resolver} appearance={appearance} onChange={changeAppearance} /></Suspense>
      <div className="music-editor__actions"><button disabled={!draft.css.enabled} onClick={() => updateDraft(current => ({ ...current, css: { ...current.css, enabled: false } }))} type="button">Disable custom CSS</button><a href="/manage/music-sources">Music sources</a><a href="/manage/settings">Overlay outputs</a></div>
      <div aria-label="Full preview metadata" className="music-editor__metadata"><strong>{fixture.track?.title}</strong><span>{fixture.track?.artists.join(", ")}</span><span>{fixture.track?.album}</span></div>
    </section>
    <MusicDisclosure title="Desktop overlay placement" open={desktopOpen} onToggle={() => setDesktopOpen(current => !current)} summary={draft.desktopPlacement.full === null && draft.desktopPlacement.compact === null ? "Uses alignment" : "Custom desktop position"}>
      <Suspense fallback={<p role="status">Loading desktop placement…</p>}><MusicDesktopPlacement config={draft} snapshot={fixture} now={fixtureTime} resolveAsset={resolver} surfaceApi={surfaceApi} onChange={next => updateDraft(() => next)} /></Suspense>
    </MusicDisclosure>
    <MusicDisclosure title="Configuration" open={configurationOpen} onToggle={() => setConfigurationOpen(current => !current)} summary={`${enabled ? "Enabled" : "Disabled"} · ${view === "full" ? "Full" : "Compact"} view`}>
      <label><input checked={enabled} onChange={event => updateEnabled(event.currentTarget.checked)} type="checkbox" /> Enable Music module after saving</label>
<div className="music-editor__grid">
      <label>Initial view<select value={profile.initialView} onChange={event => changeProfile({ ...profile, initialView: event.currentTarget.value as typeof profile.initialView })}><option value="full">Full</option><option value="compact">Compact</option></select></label>
      <label>Theme<select value={profile.theme} onChange={event => changeProfile({ ...profile, theme: event.currentTarget.value as typeof profile.theme })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>Alignment<select value={profile.alignment} onChange={event => changeProfile({ ...profile, alignment: event.currentTarget.value as typeof profile.alignment })}>{["top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Idle behavior<select value={profile.idleMode} onChange={event => changeProfile({ ...profile, idleMode: event.currentTarget.value as typeof profile.idleMode })}><option value="none">Keep current view</option><option value="hide">Hide</option><option value="compact">Switch to compact</option></select></label>
      <MusicNumberFieldBridge label="Idle after (seconds)" value={profile.idleAfterSeconds} min={1} max={600} onCommit={idleAfterSeconds => changeProfile({ ...profile, idleAfterSeconds })} />
      <MusicNumberFieldBridge label="Background opacity (%)" value={profile.backgroundOpacity} min={0} max={100} onCommit={backgroundOpacity => changeProfile({ ...profile, backgroundOpacity })} />
    </div>
    <button onClick={() => changeAppearance({ ...createMusicViewAppearance(profile.theme, view), branding: appearance.branding })} type="button">Reset current view to theme</button>
    <Suspense fallback={<p role="status">Loading configuration controls…</p>}>
    <MusicAppearanceEditor key={`${profileId}-${view}-appearance`} profile={profile} view={view} onChange={changeProfile} onPickFont={setPicker} />
    <MusicBrandingEditor key={`${profileId}-${view}-branding`} appearance={appearance} image={selectedImage} onChange={changeAppearance} onPick={() => setPicker("brand")} />
    </Suspense>
    </MusicDisclosure>
    <MusicDisclosure title="Custom CSS" label="Custom CSS settings" open={cssOpen} onToggle={() => setCssOpen(current => !current)} summary={validation?.valid === false ? "Needs correction" : draft.css.enabled ? "Enabled" : "Disabled"}>
      <Suspense fallback={<p role="status">Loading CSS editor…</p>}><MusicCssEditor value={draft.css} validation={validation} checking={checkingCss} onChange={css => updateDraft(current => ({ ...current, css }))} onDisable={() => updateDraft(current => ({ ...current, css: { ...current.css, enabled: false } }))} showDisable={false} /></Suspense>
    </MusicDisclosure>
    <div className="music-editor__save"><span role="status">{dirty ? "Unsaved changes" : "All changes saved"}</span><button disabled={busy || !dirty || checkingCss} onClick={() => void save()} type="button">Save Music appearance</button></div>
    <AssetPicker assetApi={assetApi} compatibleMediaTypes={picker === "brand" ? ["image"] : ["font"]} managementApi={api} onCancel={() => setPicker(null)} onSelect={(assetId, _mediaType, item) => { setAssets(current => [...current.filter(candidate => candidate.id !== item.id), item]); if (picker === "brand") changeAppearance({ ...appearance, branding: { ...appearance.branding, assetId } }); else if (picker !== null) changeAppearance({ ...appearance, [picker]: { ...appearance[picker], fontAssetId: assetId } }); setPicker(null); }} open={picker !== null} selectedAssetId={picker === "brand" ? appearance.branding.assetId : picker === null ? null : appearance[picker].fontAssetId} />
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
  </div>;
}

// Keeps the same bounded field behavior for shared profile controls.
import { MusicNumberField as MusicNumberFieldBridge } from "./MusicNumberField.js";

function MusicDisclosure({ title, label = title, summary, open, onToggle, children }: { readonly title: string; readonly label?: string; readonly summary: string; readonly open: boolean; readonly onToggle: () => void; readonly children: ReactNode }) {
  const id = `music-${title.toLowerCase().replaceAll(" ", "-")}`;
  return <section aria-label={label} className="music-editor__section music-editor__disclosure">
    <div className="music-editor__disclosure-heading"><h3><button aria-controls={id} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${title.toLowerCase()}`} className="music-editor__disclosure-toggle" onClick={onToggle} type="button"><span aria-hidden="true">{open ? "−" : "+"}</span> {title}</button></h3><span className="music-editor__summary">{summary}</span></div>
    {open ? <div id={id} className="music-editor__disclosure-body">{children}</div> : null}
  </section>;
}
