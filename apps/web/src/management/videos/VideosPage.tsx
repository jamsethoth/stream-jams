import { Button, Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { isValidVideosLayout, type ActionableManagementError, type AudioRouteStatus, type OverlayPurpose, type TwitchCustomReward, type TwitchCustomRewardCatalog, type VideosLayout, type VideosModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AudioApi } from "../audio/audio-api.js";
import { actionableError } from "../foundation/actionable-error.js";
import { BrowserSourceRow } from "../foundation/BrowserSourceRow.js";
import { BrowserSourcesPanel } from "../foundation/BrowserSourcesPanel.js";
import { DestructiveConfirmationDialog } from "../foundation/DestructiveConfirmationDialog.js";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementErrorToast, ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import { MaskedValue } from "../foundation/MaskedValue.js";
import { ModuleControls, ModulePageLayout, ModuleSection } from "../foundation/ModulePageLayout.js";
import { StatusBadge } from "../foundation/StatusBadge.js";
import { VideoPlacementEditor } from "./VideoPlacementEditor.js";
import { VideoQueuePanel } from "./VideoQueuePanel.js";
import { createHttpVideosApi, type VideoQueueApi, type VideosApi, type VideosBrowserSource } from "./videos-api.js";

// Bounds mirror the server's Videos config schema, which stays out of the management bundle; the server remains authoritative.
const limits = { minLength: 5, maxLength: 14_400, maxGap: 30, hosts: 32, devices: 8, rewards: 16, deviceDelayMs: 500 } as const;
const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

export interface VideosPageProps {
  readonly api?: VideosApi;
  readonly audioApi: AudioApi;
  readonly managementApi: { getTwitchCustomRewards(): Promise<TwitchCustomRewardCatalog> };
}

interface Draft {
  readonly maxLengthSeconds: string;
  readonly gapSeconds: string;
  readonly allowedDirectHosts: readonly string[];
  readonly obsAudio: boolean;
  readonly audioDeviceIds: readonly string[];
  /** Typed delay text per selected route; empty means 0. */
  readonly audioDeviceDelaysMs: Readonly<Record<string, string>>;
  readonly streamerBotAutoplay: boolean;
  readonly rewardMappings: VideosModuleConfig["rewardMappings"];
  readonly layout: VideosLayout;
}

type FieldErrors = Partial<Record<"maxLengthSeconds" | "gapSeconds" | "host" | "reward" | "layout" | `delay:${string}`, string>>;
type RewardCatalog = { readonly status: "loading" } | { readonly status: "loaded"; readonly rewards: readonly TwitchCustomReward[] } | { readonly status: "error"; readonly message: string };

let defaultApi: VideosApi | null = null;
function resolveDefaultApi(): VideosApi { return defaultApi ??= createHttpVideosApi(); }

/**
 * The Operator Console's Videos panel. It lives in this lazily loaded module so the page and the panel share one chunk
 * and neither route's static graph grows. Requests added here are attributed to the Operator.
 */
export function OperatorVideosPanel({ api }: { readonly api?: VideoQueueApi | undefined }) {
  const [operatorApi] = useState(() => api ?? createHttpVideosApi({ from: "operator" }));
  return <section className="operator-section operator-videos"><VideoQueuePanel api={api ?? operatorApi} /></section>;
}

export function VideosPage({ api = resolveDefaultApi(), audioApi, managementApi }: VideosPageProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [routes, setRoutes] = useState<readonly AudioRouteStatus[]>([]);
  const [routesError, setRoutesError] = useState(false);
  const [sources, setSources] = useState<readonly VideosBrowserSource[]>([]);
  const [sourcesExpanded, setSourcesExpanded] = useState(window.location.hash === "#browser-sources");
  const [catalog, setCatalog] = useState<RewardCatalog>({ status: "loading" });
  const [loadError, setLoadError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const [actionError, setActionError] = useState<ActionableManagementError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hostDraft, setHostDraft] = useState("");
  const [rewardDraft, setRewardDraft] = useState({ rewardId: "", purpose: "live" as OverlayPurpose });
  const [regenerate, setRegenerate] = useState<VideosBrowserSource | null>(null);
  const [confirmationError, setConfirmationError] = useState<ActionableManagementError | null>(null);
  const [busy, setBusy] = useState(false);
  const [mirrorAvailable, setMirrorAvailable] = useState<boolean | null>(null);
  const busyRef = useRef(false);
  const fallbackRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const [state, nextSources] = await Promise.all([api.getModuleConfig(), api.listBrowserSources()]);
      setEnabled(state.enabled); setDraft(toDraft(state.config)); setSources(nextSources); setLoadError(null);
    } catch (reason) {
      setLoadError(actionableError(reason, "Videos settings could not be loaded", "Check that Stream Jams is running, then reopen Videos."));
    }
    // The queue reports whether the desktop primary player is running.
    try { setMirrorAvailable((await api.getQueue("live")).mirror.available); }
    // error-provenance: allow expected -- the mirror note falls back to an unknown state; the queue panel reports load failures
    catch { setMirrorAvailable(null); }
    try { setRoutes((await audioApi.getStatus()).routes); setRoutesError(false); }
    // error-provenance: allow expected -- audio outputs are optional here; the page explains the unavailable list inline
    catch { setRoutesError(true); }
  }, [api, audioApi]);
  const loadRewards = useCallback(async () => {
    setCatalog({ status: "loading" });
    try { setCatalog({ status: "loaded", rewards: (await managementApi.getTwitchCustomRewards()).rewards }); }
    catch (reason) { setCatalog({ status: "error", message: reason instanceof Error ? reason.message : "Twitch rewards could not be loaded." }); }
  }, [managementApi]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRewards(); }, [loadRewards]);

  async function mutate(work: () => Promise<void>, failure: string, onError?: (error: ActionableManagementError) => void) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice(null); setActionError(null);
    try { await work(); }
    catch (reason) {
      const error = actionableError(reason, failure, "Review the Videos settings and retry. Open Diagnostics if it keeps failing.");
      if (onError === undefined) setActionError(error); else onError(error);
    } finally { busyRef.current = false; setBusy(false); }
  }

  const toggleModule = () => enabled === null ? undefined : void mutate(async () => {
    const next = await api.setModuleEnabled(!enabled);
    setEnabled(next);
    setNotice({ tone: "success", message: next ? "Videos module enabled." : "Videos module disabled. New requests are rejected until you enable it." });
  }, "The Videos module could not be changed");

  function save(event: FormEvent) {
    event.preventDefault();
    if (draft === null || enabled === null) return;
    const errors: FieldErrors = {};
    const maxLength = Number(draft.maxLengthSeconds);
    const gap = Number(draft.gapSeconds);
    if (draft.maxLengthSeconds.trim() === "" || !Number.isInteger(maxLength) || maxLength < limits.minLength || maxLength > limits.maxLength) {
      errors.maxLengthSeconds = `Enter whole seconds from ${limits.minLength} to ${limits.maxLength}.`;
    }
    if (draft.gapSeconds.trim() === "" || !Number.isInteger(gap) || gap < 0 || gap > limits.maxGap) errors.gapSeconds = `Enter whole seconds from 0 to ${limits.maxGap}.`;
    const audioDeviceDelaysMs: Record<string, number> = {};
    for (const id of draft.audioDeviceIds) {
      const text = (draft.audioDeviceDelaysMs[id] ?? "").trim();
      const delay = text === "" ? 0 : Number(text);
      if (!Number.isInteger(delay) || delay < 0 || delay > limits.deviceDelayMs) errors[`delay:${id}`] = `Enter whole milliseconds from 0 to ${limits.deviceDelayMs}.`;
      else if (delay > 0) audioDeviceDelaysMs[id] = delay;
    }
    if (!isValidVideosLayout(draft.layout)) errors.layout = "Keep the video box at least 240 x 180 px and inside the 1920 x 1080 canvas.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const config: VideosModuleConfig = { maxLengthSeconds: maxLength, gapSeconds: gap, allowedDirectHosts: draft.allowedDirectHosts, obsAudio: draft.obsAudio,
      audioDeviceIds: draft.audioDeviceIds, audioDeviceDelaysMs, streamerBotAutoplay: draft.streamerBotAutoplay, rewardMappings: draft.rewardMappings, layout: draft.layout };
    void mutate(async () => {
      const saved = await api.saveModuleConfig(enabled, config);
      setEnabled(saved.enabled); setDraft(toDraft(saved.config));
      setNotice({ tone: "success", message: "Videos settings saved. They apply to later requests and runs." });
    }, "Videos settings could not be saved");
  }

  function addHost() {
    if (draft === null) return;
    const host = hostDraft.trim().toLowerCase();
    const error = !hostPattern.test(host) ? "Enter a host name such as videos.example.com, without https:// or a path."
      : draft.allowedDirectHosts.includes(host) ? "That host is already allowed."
        : draft.allowedDirectHosts.length >= limits.hosts ? `Up to ${limits.hosts} hosts can be allowed.` : null;
    setFieldErrors(current => withField(current, "host", error));
    if (error !== null) return;
    setDraft({ ...draft, allowedDirectHosts: [...draft.allowedDirectHosts, host] }); setHostDraft("");
  }

  function addReward() {
    if (draft === null) return;
    const rewardId = rewardDraft.rewardId.trim();
    const error = rewardId === "" ? "Choose a reward." : draft.rewardMappings.some(mapping => mapping.rewardId === rewardId) ? "That reward is already mapped."
      : draft.rewardMappings.length >= limits.rewards ? `Up to ${limits.rewards} rewards can be mapped.` : null;
    setFieldErrors(current => withField(current, "reward", error));
    if (error !== null) return;
    setDraft({ ...draft, rewardMappings: [...draft.rewardMappings, { rewardId, purpose: rewardDraft.purpose }] }); setRewardDraft({ rewardId: "", purpose: "live" });
  }

  async function confirmRegenerate() {
    const source = regenerate;
    if (source === null) return;
    setConfirmationError(null);
    await mutate(async () => {
      await api.regenerateBrowserSource(source); setSources(await api.listBrowserSources()); setRegenerate(null);
      setNotice({ tone: "warning", message: `${source.label} URL regenerated. Update OBS with the new URL.` });
    }, "The Browser Source URL could not be regenerated", setConfirmationError);
  }

  const rewards = catalog.status === "loaded" ? catalog.rewards : [];
  const rewardTitle = (rewardId: string) => rewards.find(reward => reward.id === rewardId)?.title ?? null;
  const unmappedRewards = rewards.filter(reward => draft?.rewardMappings.every(mapping => mapping.rewardId !== reward.id) ?? true);
  const unknownDevices = draft?.audioDeviceIds.filter(id => routes.every(({ route }) => route.id !== id)) ?? [];

  return <>
    <ModulePageLayout className="videos-page"
      feedback={<>
        {loadError === null ? null : <ManagementErrorBanner error={loadError} />}
        {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
        {actionError === null ? null : <ManagementErrorToast error={actionError} onDismiss={() => setActionError(null)} />}
      </>}
      controls={<ModuleControls status={enabled === null ? <p>Module status loading</p> : <StatusBadge label={enabled ? "Module enabled" : "Module disabled"} tone={enabled ? "positive" : "neutral"} />}
        description="Queue viewer video requests. Nothing plays until you start it, or an allowed request asks for autoplay.">
        <Button ref={fallbackRef} variant="default" disabled={busy || enabled === null} onClick={toggleModule}>{enabled ? "Disable Videos module" : "Enable Videos module"}</Button>
      </ModuleControls>}
      outputs={<>
        <p className="videos-mirror-status" role="note">{mirrorAvailable === true
          ? <><strong>Mirror status:</strong> the desktop app is playing videos. Every output shows its picture, with sound in OBS and on the chosen audio outputs.</>
          : mirrorAvailable === false
            ? <><strong>Mirroring unavailable:</strong> desktop app not running. Each Browser Source plays the current video in its own player, following the queue clock.</>
            : <><strong>Mirror status:</strong> unknown until the queue loads.</>}</p>
        <BrowserSourcesPanel id="browser-sources" detailsId="videos-sources-content" expanded={sourcesExpanded} onToggle={() => setSourcesExpanded(value => !value)}
        readyCount={sources.filter(source => source.status === "available").length} needsSetupCount={sources.filter(source => source.status !== "available").length} description="Module live and test outputs.">
        <p>Add the Videos URL as an OBS Browser Source at 1920 x 1080. To show videos on the desktop overlay, turn on Videos in <a href="/manage/settings#overlay-surfaces">Overlay surfaces</a>.</p>
        {sources.length === 0 ? <p>No Videos Browser Source output is registered.</p> : sources.map(source => <BrowserSourceRow key={source.id} label={source.label} ready={source.status === "available"}
          telemetry={source.status === "available" ? "URL available" : source.status.replace("-", " ")} metadata={<span>Module source · {source.purpose === "live" ? "Live" : "Test"}</span>}
          url={source.url === null ? <p>Create a URL before adding this output.</p> : <MaskedValue label={`${source.label} Browser Source URL`} value={source.url} />}
          actions={source.status === "create-required"
            ? <Button disabled={busy} onClick={() => void mutate(async () => { await api.createBrowserSource(source); setSources(await api.listBrowserSources()); setNotice({ tone: "success", message: `${source.label} URL created.` }); }, "The Browser Source URL could not be created")}>Create URL</Button>
            : <Button color="red" variant="light" disabled={busy} onClick={() => { setConfirmationError(null); setRegenerate(source); }}>Regenerate URL</Button>} />)}
      </BrowserSourcesPanel>
      </>}
      secondary={draft === null ? (loadError === null ? <p className="management-empty" role="status">Loading Videos settings…</p> : null) : <form className="videos-settings" onSubmit={save} noValidate>
        <ModuleSection title="Placement" label="Video placement" id="video-placement"
          description="Where the video appears on browser sources, the desktop overlay and the mirror. Changes apply after Save Videos settings.">
          <VideoPlacementEditor value={draft.layout} disabled={busy} onChange={layout => { setDraft(current => current === null ? current : { ...current, layout }); setFieldErrors(current => withField(current, "layout", null)); }} />
          {fieldErrors.layout === undefined ? null : <p className="videos-settings__error" role="alert">{fieldErrors.layout}</p>}
        </ModuleSection>
        <ModuleSection title="Limits and audio" label="Limits and audio" description="Videos longer than the limit, or of unknown length, wait as held until you choose Play anyway.">
          <div className="videos-settings__grid">
            <TextInput label="Maximum length (seconds)" type="number" min={limits.minLength} max={limits.maxLength} step={1} value={draft.maxLengthSeconds} error={fieldErrors.maxLengthSeconds}
              onChange={event => setDraft({ ...draft, maxLengthSeconds: event.currentTarget.value })} />
            <TextInput label="Gap between videos (seconds)" type="number" min={0} max={limits.maxGap} step={1} value={draft.gapSeconds} error={fieldErrors.gapSeconds}
              onChange={event => setDraft({ ...draft, gapSeconds: event.currentTarget.value })} />
          </div>
          <Checkbox label="Play video audio in the OBS Browser Source" checked={draft.obsAudio} onChange={event => setDraft({ ...draft, obsAudio: event.currentTarget.checked })} />
          <fieldset className="videos-settings__fieldset">
            <legend>Audio outputs</legend>
            <p className="module-section-description">Also send video audio to these outputs (up to {limits.devices}). Manage outputs in <a href="/manage/settings#audio-outputs">Settings</a>.</p>
            {routesError ? <p role="status">Audio outputs could not be loaded. Saved choices are kept.</p> : null}
            {routes.length === 0 && unknownDevices.length === 0 && !routesError ? <p className="management-empty">No audio outputs are set up.</p> : null}
            {routes.map(({ route }) => { const checked = draft.audioDeviceIds.includes(route.id); return <div className="videos-settings__device" key={route.id}>
              <Checkbox label={route.name} checked={checked}
                disabled={!checked && draft.audioDeviceIds.length >= limits.devices}
                onChange={() => setDraft(checked ? withoutDevice(draft, route.id) : { ...draft, audioDeviceIds: [...draft.audioDeviceIds, route.id] })} />
              {checked ? <TextInput label={`${route.name} delay (ms)`} description="Delays this output to line it up with OBS." type="number" min={0} max={limits.deviceDelayMs} step={10} size="xs"
                value={draft.audioDeviceDelaysMs[route.id] ?? ""} placeholder="0" error={fieldErrors[`delay:${route.id}`]}
                onChange={event => setDraft({ ...draft, audioDeviceDelaysMs: { ...draft.audioDeviceDelaysMs, [route.id]: event.currentTarget.value } })} /> : null}
            </div>; })}
            {unknownDevices.map(id => <Checkbox key={id} label={`Unavailable output (${id})`} checked onChange={() => setDraft(withoutDevice(draft, id))} />)}
          </fieldset>
        </ModuleSection>
        <ModuleSection title="Request sources" label="Request sources">
          <Checkbox label="Let Streamer.bot start videos automatically" checked={draft.streamerBotAutoplay} onChange={event => setDraft({ ...draft, streamerBotAutoplay: event.currentTarget.checked })}
            description="When on, Streamer.bot requests that ask for autoplay start right away if nothing is playing and the queue is not paused. When off, they wait in the queue. Channel point requests never autoplay." />
          <fieldset className="videos-settings__fieldset">
            <legend>Allowed direct-file hosts</legend>
            <p className="module-section-description">Twitch and YouTube links are always accepted. Direct .mp4 and .webm links must use HTTPS and one of these hosts.</p>
            {draft.allowedDirectHosts.length === 0 ? <p className="management-empty">No direct-file hosts are allowed.</p> : <ul className="videos-settings__list" aria-label="Allowed hosts">
              {draft.allowedDirectHosts.map(host => <li key={host}><bdi dir="ltr">{host}</bdi><Button size="xs" variant="subtle" color="red" aria-label={`Remove host ${host}`}
                onClick={() => setDraft({ ...draft, allowedDirectHosts: draft.allowedDirectHosts.filter(value => value !== host) })}>Remove</Button></li>)}
            </ul>}
            <div className="videos-settings__add">
              <TextInput label="Host name" placeholder="videos.example.com" value={hostDraft} error={fieldErrors.host}
                onChange={event => setHostDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addHost(); } }} />
              <Button variant="default" onClick={addHost}>Add host</Button>
            </div>
          </fieldset>
          <fieldset className="videos-settings__fieldset">
            <legend>Channel point rewards</legend>
            <p className="module-section-description">A redemption of a mapped reward queues the link the viewer typed. It never autoplays.</p>
            {draft.rewardMappings.length === 0 ? <p className="management-empty">No rewards are mapped.</p> : <ul className="videos-settings__list" aria-label="Mapped rewards">
              {draft.rewardMappings.map(mapping => { const name = rewardTitle(mapping.rewardId) ?? mapping.rewardId; return <li key={mapping.rewardId}>
                <span>{name}</span>
                <NativeSelect aria-label={`Queue for ${name}`} value={mapping.purpose} data={[{ value: "live", label: "Live queue" }, { value: "test", label: "Test queue" }]}
                  onChange={event => setDraft({ ...draft, rewardMappings: draft.rewardMappings.map(row => row.rewardId === mapping.rewardId ? { ...row, purpose: event.currentTarget.value === "test" ? "test" : "live" } : row) })} />
                <Button size="xs" variant="subtle" color="red" aria-label={`Remove reward ${name}`} onClick={() => setDraft({ ...draft, rewardMappings: draft.rewardMappings.filter(row => row.rewardId !== mapping.rewardId) })}>Remove</Button>
              </li>; })}
            </ul>}
            {catalog.status === "error" ? <div className="videos-settings__catalog" role="status"><p>Twitch rewards could not be loaded: {catalog.message} Enter a reward ID instead, or retry.</p><Button size="xs" variant="default" onClick={() => void loadRewards()}>Retry rewards</Button></div> : null}
            <div className="videos-settings__add">
              {catalog.status === "loaded" ? <NativeSelect label="Reward" value={rewardDraft.rewardId} error={fieldErrors.reward} onChange={event => setRewardDraft({ ...rewardDraft, rewardId: event.currentTarget.value })}
                data={[{ value: "", label: unmappedRewards.length === 0 ? "No more rewards" : "Choose a reward" }, ...unmappedRewards.map(reward => ({ value: reward.id, label: reward.title }))]} />
                : <TextInput label="Reward ID" disabled={catalog.status === "loading"} value={rewardDraft.rewardId} error={fieldErrors.reward} onChange={event => setRewardDraft({ ...rewardDraft, rewardId: event.currentTarget.value })} />}
              <NativeSelect label="Queue" value={rewardDraft.purpose} data={[{ value: "live", label: "Live queue" }, { value: "test", label: "Test queue" }]}
                onChange={event => setRewardDraft({ ...rewardDraft, purpose: event.currentTarget.value === "test" ? "test" : "live" })} />
              <Button variant="default" disabled={catalog.status === "loading"} onClick={addReward}>Add reward</Button>
            </div>
          </fieldset>
        </ModuleSection>
        <div className="videos-settings__save"><Button type="submit" disabled={busy}>Save Videos settings</Button></div>
      </form>}
    >
      <div className="module-section"><VideoQueuePanel api={api} /></div>
    </ModulePageLayout>
    <DestructiveConfirmationDialog open={regenerate !== null} title={`Regenerate ${regenerate?.label ?? ""} URL?`} scope={regenerate?.label ?? "Videos Browser Source"}
      consequences="The current URL stops working immediately. Update the Browser Source in OBS after regeneration." recovery={null} actionLabel="Regenerate URL"
      targetId={regenerate?.id ?? "none"} pending={busy} error={confirmationError} restoreFocusFallbackRef={fallbackRef}
      onCancel={() => { if (!busyRef.current) setRegenerate(null); }} onConfirm={confirmRegenerate} />
  </>;
}

function toDraft(config: VideosModuleConfig): Draft {
  return { maxLengthSeconds: String(config.maxLengthSeconds), gapSeconds: String(config.gapSeconds), allowedDirectHosts: config.allowedDirectHosts, obsAudio: config.obsAudio,
    audioDeviceIds: config.audioDeviceIds, audioDeviceDelaysMs: Object.fromEntries(Object.entries(config.audioDeviceDelaysMs).map(([id, delay]) => [id, String(delay)])),
    streamerBotAutoplay: config.streamerBotAutoplay, rewardMappings: config.rewardMappings, layout: config.layout };
}

function withoutDevice(draft: Draft, id: string): Draft {
  return { ...draft, audioDeviceIds: draft.audioDeviceIds.filter(value => value !== id),
    audioDeviceDelaysMs: Object.fromEntries(Object.entries(draft.audioDeviceDelaysMs).filter(([key]) => key !== id)) };
}

function withField(current: FieldErrors, field: keyof FieldErrors, error: string | null): FieldErrors {
  const rest = Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)) as FieldErrors;
  return error === null ? rest : { ...rest, [field]: error };
}
