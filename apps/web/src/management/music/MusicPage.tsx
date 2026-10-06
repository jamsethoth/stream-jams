import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { Button } from "@mantine/core";
import { ModulePageLayout, ModuleControls, ModuleSection, DisclosureSection } from "../foundation/ModulePageLayout.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { createMusicViewAppearance, fitMusicComponentLayout, musicModuleConfigSchema, musicPublicAssetReferenceSchema, projectMusicWidget, type AssetLibraryItem, type MusicAssetResolver, type MusicCssConfig, type MusicModuleConfig, type MusicProfileConfig, type MusicSnapshot, type OverlayOutputView } from "@stream-jams/core";
import type { MusicCssValidationResult } from "@stream-jams/core/music-style-policy";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { AssetApi } from "../assets/asset-api.js";
import { useMediaPreviewGroup } from "../assets/use-media-preview-group.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { actionableError } from "../foundation/actionable-error.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
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

export type MusicPageApi = Pick<MusicApi, "getMusicConfig" | "saveMusicConfig" | "listMusicOutputs"> & Pick<ManagementApi, "createOverlayOutputKey" | "regenerateOverlayOutputKey" | "setOverlayModuleEnabled"> & AssetLibraryManagementApi;
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
  const confirmationInFlight = useRef(false);
  const [confirmationError, setConfirmationError] = useState<ReturnType<typeof actionableError> | null>(null);
  const [moduleConfirmation, setModuleConfirmation] = useState<boolean | null>(null);
  const [profileId, setProfileId] = useState<"landscape" | "vertical">("landscape");
  const [view, setView] = useState<"full" | "compact">("full");
  const [assets, setAssets] = useState<readonly AssetLibraryItem[]>([]);
  const [outputs, setOutputs] = useState<readonly OverlayOutputView[]>([]);
  const [picker, setPicker] = useState<"brand" | MusicFontRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [revealedOutputs, setRevealedOutputs] = useState<ReadonlySet<string>>(() => new Set());
  const [regenerateOutput, setRegenerateOutput] = useState<OverlayOutputView | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceComponent, setAppearanceComponent] = useState<"widget" | "artwork" | "title" | "details" | "progress">("widget");
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
  const confirmModuleEnablement = async () => {
    if (moduleConfirmation === null || confirmationInFlight.current) return;
    confirmationInFlight.current = true; setConfirmationError(null);
    setBusy(true); setError(null);
    try {
      const nextEnabled = await api.setOverlayModuleEnabled("music", moduleConfirmation);
      if (!mounted.current) return;
      setEnabled(nextEnabled);
      setSaved(current => current === null ? null : { ...current, enabled: nextEnabled });
      setModuleConfirmation(null);
      setNotice({ tone: "success", message: `Music module is now ${nextEnabled ? "enabled" : "disabled"}.` });
    } catch (cause) { if (mounted.current) setConfirmationError(actionableError(cause, "Music module could not be updated", "Try again or open Diagnostics for the server reference.")); }
    finally { confirmationInFlight.current = false; if (mounted.current) setBusy(false); }
  };

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
  const save = useCallback(async (forNavigation = false) => {
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
    } catch (cause) { const failure = actionableError(cause, "Unable to save Music appearance", "Correct the highlighted values or CSS, then save again."); if (forNavigation) return { saved: false as const, error: failure }; if (mounted.current) setError(failure); return false; }
    finally { if (mounted.current) setBusy(false); }
  }, [api, draft, enabled, saved]);
  const saveForNavigation = useCallback(() => save(true), [save]);
  useDirtyNavigationSource({ id: "music-appearance", summary: "Music appearance has unsaved changes.", dirty, save: saveForNavigation, discard });

  useEffect(() => {
    if (loading) return;
    const revealCorrection = () => {
      const hash = window.location.hash;
      const id = hash === "#browser-sources" ? "music-output-links" : hash.slice(1);
      if (hash === "#browser-sources") setSourcesOpen(true);
      else if (hash === "#music-appearance") setAppearanceOpen(true);
      else if (hash === "#music-custom-css") setCssOpen(true);
      else if (hash === "#music-desktop-overlay-placement") setDesktopOpen(true);
      else return;
      const region = document.getElementById(id);
      region?.scrollIntoView?.({ block: "start" });
      region?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    };
    revealCorrection();
    window.addEventListener("hashchange", revealCorrection);
    return () => window.removeEventListener("hashchange", revealCorrection);
  }, [loading]);

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
  async function createOutput(output: OverlayOutputView, regenerate = false) {
    if (confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setBusy(true); setError(null); setConfirmationError(null);
    try {
      const request = { overlayId: output.overlayId, scope: "module" as const, moduleId: "music", purpose: output.purpose, targetProfileId: output.targetProfileId };
      const result = regenerate ? await api.regenerateOverlayOutputKey(request) : await api.createOverlayOutputKey(request);
      if (!mounted.current) return;
      setOutputs(current => current.map(item => item.id === output.id ? { ...item, keyId: result.keyId, url: result.url, copyableUrlStatus: "available" as const } : item));
      setRegenerateOutput(null); setRevealedOutputs(current => new Set([...current].filter(id => id !== output.id)));
      setNotice({ tone: "success", message: `${output.label} URL is ready. Add it to a browser source in OBS.` });
    } catch (cause) { if (mounted.current) { const failure = actionableError(cause, "Unable to create Music output link", "Check the output settings and retry."); if (regenerate) setConfirmationError(failure); else setError(failure); } }
    finally { confirmationInFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function copyOutput(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice({ tone: "success", message: "Music output URL copied." }); }
    catch (cause) { setError(actionableError(cause, "Unable to copy Music output URL", "Reveal the URL and copy it manually, or allow clipboard access and retry.")); }
  }

  const sourceRows = (purpose: "live" | "test") => outputs.filter(output => output.purpose === purpose).map(output => {
    const label = `${output.targetProfileId === "landscape" ? "Landscape" : "Vertical"}${purpose === "test" ? " test" : ""}`;
    const revealed = revealedOutputs.has(output.id);
    return <BrowserSourceRow key={output.id} label={label} ready={output.copyableUrlStatus === "available"} metadata={<strong><bdi dir="ltr">{output.targetProfileId === "landscape" ? "1920 x 1080" : "1080 x 1920"}</bdi></strong>} guidance={<>Add a Browser Source in OBS at {output.targetProfileId === "landscape" ? "1920 x 1080" : "1080 x 1920"}, then paste this URL.</>} telemetry={purpose === "live" ? "Live output" : "Test output"} url={output.url === null ? <p className="browser-source-row__missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source URL`} readOnly value={output.url} /> : <code>{output.url.replace(/(\/(?:live|test)\/)[^?]+/u, "$1********")}</code>} actions={<>
      {output.copyableUrlStatus === "create-required" ? <Button variant="default" disabled={busy} onClick={() => void createOutput(output)} type="button">Create {label} URL</Button> : null}
      {output.url === null ? null : <><Button aria-label={`${revealed ? "Hide" : "Reveal"} ${label} URL`} variant="default" onClick={() => setRevealedOutputs(current => { const next = new Set(current); if (revealed) next.delete(output.id); else next.add(output.id); return next; })} type="button">{revealed ? "Hide" : "Reveal"}</Button><Button aria-label={`Copy ${label} URL`} variant="default" onClick={() => void copyOutput(output.url!)} type="button">Copy</Button></>}
      {output.copyableUrlStatus === "create-required" ? null : <Button aria-label={`Regenerate ${label} URL`} color="red" disabled={busy} onClick={() => { setConfirmationError(null); setRegenerateOutput(output); }} type="button">Regenerate</Button>}
    </>} />;
  });

  if (loading) return <p role="status">Loading Music appearance…</p>;
  if (draft === null || profile === null || appearance === null) return <div><p role="alert">Music appearance could not be loaded.</p>{error === null ? null : <ManagementErrorBanner error={error} />}</div>;
  return <ModulePageLayout className="music-editor" controls={<ModuleControls status={<StatusBadge label={enabled ? "Module enabled" : "Module disabled"} tone={enabled ? "positive" : "neutral"} />} description="Saved module enablement is separate from source connection and preview."><Button variant="default" disabled={busy} onClick={() => { setConfirmationError(null); setModuleConfirmation(!enabled); }}>{enabled ? "Disable Music module" : "Enable Music module"}</Button></ModuleControls>} outputs={    <BrowserSourcesPanel id="music-output-links" label="Music output links" detailsId="music-browser-sources" expanded={sourcesOpen} onToggle={() => setSourcesOpen(current => !current)} readyCount={outputs.filter(output => output.purpose === "live" && output.copyableUrlStatus === "available").length} needsSetupCount={outputs.filter(output => output.purpose === "live" && output.copyableUrlStatus !== "available").length}>
      <div className="music-browser-sources__list">{sourceRows("live")}</div>
      {outputs.some(output => output.purpose === "test") ? <details><summary>Test browser sources</summary><div className="music-browser-sources__list">{sourceRows("test")}</div></details> : null}
      {outputs.length === 0 ? <p role="status">No Music outputs were returned. Check the local service and reload this page.</p> : null}
    </BrowserSourcesPanel>} secondary={<>    <DisclosureSection id="music-desktop-overlay-placement" detailsId="music-desktop-overlay-placement-details" title="Desktop overlay placement" expanded={desktopOpen} onToggle={() => setDesktopOpen(current => !current)} summary={draft.desktopPlacement.full === null && draft.desktopPlacement.compact === null ? "Uses alignment" : "Custom desktop position"}>
      <Suspense fallback={<p role="status">Loading desktop placement…</p>}><MusicDesktopPlacement config={draft} snapshot={fixture} now={fixtureTime} resolveAsset={resolver} surfaceApi={surfaceApi} onChange={next => updateDraft(() => next)} /></Suspense>
    </DisclosureSection>
    <ModuleSection label="Configuration" title="Configuration">
<div className="music-editor__grid">
      <label>Initial view<select value={profile.initialView} onChange={event => changeProfile({ ...profile, initialView: event.currentTarget.value as typeof profile.initialView })}><option value="full">Full</option><option value="compact">Compact</option></select></label>
      <label>Theme<select value={profile.theme} onChange={event => changeProfile({ ...profile, theme: event.currentTarget.value as typeof profile.theme })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>Alignment<select value={profile.alignment} onChange={event => changeProfile({ ...profile, alignment: event.currentTarget.value as typeof profile.alignment })}>{["top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Idle behavior<select value={profile.idleMode} onChange={event => changeProfile({ ...profile, idleMode: event.currentTarget.value as typeof profile.idleMode })}><option value="none">Keep current view</option><option value="hide">Hide</option><option value="compact">Switch to compact</option></select></label>
      <MusicNumberFieldBridge label="Idle after (seconds)" value={profile.idleAfterSeconds} min={1} max={600} onCommit={idleAfterSeconds => changeProfile({ ...profile, idleAfterSeconds })} />
      <MusicNumberFieldBridge label="Background opacity (%)" value={profile.backgroundOpacity} min={0} max={100} onCommit={backgroundOpacity => changeProfile({ ...profile, backgroundOpacity })} />
    </div>
    </ModuleSection>
    <DisclosureSection id="music-appearance" detailsId="music-appearance-details" title="Appearance" expanded={appearanceOpen} onToggle={() => setAppearanceOpen(current => !current)} summary={`${profileId} · ${view} view`}>
    <p>Editing the {profileId} profile, {view} view.</p>
    <Button onClick={() => changeAppearance({ ...createMusicViewAppearance(profile.theme, view), branding: appearance.branding })} type="button">Reset appearance to theme</Button>
    <Suspense fallback={<p role="status">Loading configuration controls…</p>}>
    <MusicAppearanceEditor key={`${profileId}-${view}-appearance`} profile={profile} view={view} onChange={changeProfile} onPickFont={setPicker} selectedComponent={appearanceComponent} onSelectComponent={setAppearanceComponent} />
    {appearanceComponent === "widget" ? <MusicBrandingEditor key={`${profileId}-${view}-branding`} appearance={appearance} image={selectedImage} onChange={changeAppearance} onPick={() => setPicker("brand")} /> : null}
    </Suspense>
    </DisclosureSection>
    <DisclosureSection id="music-custom-css" detailsId="music-custom-css-details" title="Custom CSS" label="Custom CSS settings" expanded={cssOpen} onToggle={() => setCssOpen(current => !current)} summary={validation?.valid === false ? "Needs correction" : draft.css.enabled ? "Enabled" : "Disabled"}>
      <Suspense fallback={<p role="status">Loading CSS editor…</p>}><MusicCssEditor value={draft.css} validation={validation} checking={checkingCss} onChange={css => updateDraft(current => ({ ...current, css }))} onDisable={() => updateDraft(current => ({ ...current, css: { ...current.css, enabled: false } }))} showDisable={false} /></Suspense>
    </DisclosureSection>
    <div className="music-editor__save"><span role="status">{dirty ? "Unsaved changes" : "All changes saved"}</span><Button disabled={busy || !dirty || checkingCss} onClick={() => void save()} type="button">Save Music appearance</Button></div></>}>

    {error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}

    <DestructiveConfirmationDialog actionLabel="Regenerate URL" title="Regenerate Music URL?" scope="Music browser source" targetId={regenerateOutput?.id ?? "closed"} open={regenerateOutput !== null} pending={busy} error={confirmationError} consequences="The current URL will stop working immediately. Update the Browser Source in OBS after regeneration." recovery={null} onCancel={() => { setRegenerateOutput(null); setConfirmationError(null); }} onConfirm={async () => { if (regenerateOutput !== null) await createOutput(regenerateOutput, true); }} />

    <ModuleSection label="Music preview" title="Preview">
<div className="music-editor__grid"><label>Output profile<select value={profileId} onChange={event => setProfileId(event.currentTarget.value as typeof profileId)}><option value="landscape">Landscape</option><option value="vertical">Vertical</option></select></label><label>Preview view<select value={view} onChange={event => setView(event.currentTarget.value as typeof view)}><option value="full">Full</option><option value="compact">Compact</option></select></label></div><p>Unsaved changes appear here only. Live output continues using saved settings.</p>
      {mediaUnavailable ? <p role="status">A preview image or font is unavailable. The native fallback is shown. Reselect the asset to retry.</p> : null}
      <Suspense fallback={<p role="status">Loading Music preview…</p>}><MusicLayoutEditor key={`${profileId}-${view}`} projection={projection} resolveAsset={resolver} appearance={appearance} onChange={changeAppearance} onSelectComponent={role => { setAppearanceComponent(role === "time" ? "details" : role); setAppearanceOpen(true); }} /></Suspense>
      <div className="music-editor__actions"><Button disabled={!draft.css.enabled} onClick={() => updateDraft(current => ({ ...current, css: { ...current.css, enabled: false } }))} type="button">Disable custom CSS</Button><a href="/manage/music-sources">Music sources</a><a href="/manage/settings">Overlay outputs</a></div>
      <div aria-label="Full preview metadata" className="music-editor__metadata"><strong>{fixture.track?.title}</strong><span>{fixture.track?.artists.join(", ")}</span><span>{fixture.track?.album}</span></div>
    </ModuleSection>

    <AssetPicker assetApi={assetApi} compatibleMediaTypes={picker === "brand" ? ["image"] : ["font"]} managementApi={api} onCancel={() => setPicker(null)} onSelect={(assetId, _mediaType, item) => { setAssets(current => [...current.filter(candidate => candidate.id !== item.id), item]); if (picker === "brand") changeAppearance({ ...appearance, branding: { ...appearance.branding, assetId } }); else if (picker !== null) changeAppearance({ ...appearance, [picker]: { ...appearance[picker], fontAssetId: assetId } }); setPicker(null); }} open={picker !== null} selectedAssetId={picker === "brand" ? appearance.branding.assetId : picker === null ? null : appearance[picker].fontAssetId} />
    <DestructiveConfirmationDialog actionLabel="Confirm change" title={`${moduleConfirmation ? "Enable" : "Disable"} Music module?`} scope="Music module" targetId={`music-${String(moduleConfirmation)}`} open={moduleConfirmation !== null} pending={busy} error={confirmationError} consequences={moduleConfirmation ? "Music can appear in enabled browser and desktop overlay surfaces when the selected source is connected." : "Music stops rendering until the module is enabled again. Saved appearance and provider settings are retained."} recovery="Change saved module enablement again when ready." onCancel={() => { setModuleConfirmation(null); setConfirmationError(null); }} onConfirm={confirmModuleEnablement} />
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
  </ModulePageLayout>;
}

// Keeps the same bounded field behavior for shared profile controls.
import { MusicNumberField as MusicNumberFieldBridge } from "./MusicNumberField.js";
