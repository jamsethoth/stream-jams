import { pearConfigurationSchema, type ActionableManagementError, type MusicManagementStatus, type MusicPairingAttemptView, type PearConfiguration, type ProviderValidationResult, type RegisteredProviderView } from "@stream-jams/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementToast, type ManagementToastNotice } from "../foundation/ManagementToast.js";
import type { ManagementApi } from "../management-api.js";
import { useDirtyNavigationSource } from "../navigation/dirty-navigation.js";
import "../providers/provider-pages.css";

export type MusicSourcesApi = Pick<ManagementApi,
  "listRegisteredProviders" | "getProvider" | "validateProvider" | "registerProvider" | "activateProvider" |
  "getMusicStatus" | "beginMusicPairing" | "getMusicPairing" | "cancelMusicPairing" |
  "reconnectMusicSource" | "replaceMusicCredential" | "setOverlayModuleEnabled">;

const defaultConfig: PearConfiguration = { baseUrl: "http://127.0.0.1:26538", transport: "auto" };

export function MusicSourcesPage({ api, initialProviderId }: { readonly api: MusicSourcesApi; readonly initialProviderId?: string | undefined }) {
  const [providers, setProviders] = useState<readonly RegisteredProviderView[]>([]);
  const [status, setStatus] = useState<MusicManagementStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialProviderId ?? null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("Pear Desktop");
  const [config, setConfig] = useState<PearConfiguration>(defaultConfig);
  const [pairing, setPairing] = useState<MusicPairingAttemptView | null>(null);
  const [validation, setValidation] = useState<ProviderValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [refreshError, setRefreshError] = useState<ActionableManagementError | null>(null);
  const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const statusGeneration = useRef(0);
  const mounted = useRef(true);
  const pairRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const request = generation.current;
    const statusRequest = ++statusGeneration.current;
    const [nextProviders, nextStatus] = await Promise.all([api.listRegisteredProviders("music-source"), api.getMusicStatus()]);
    if (!mounted.current || request !== generation.current || statusRequest !== statusGeneration.current) return;
    setProviders(nextProviders);
    setStatus(nextStatus);
    setSelectedId(current => current !== null && nextProviders.some(provider => provider.id === current)
      ? current : nextProviders.find(provider => provider.active)?.id ?? nextProviders[0]?.id ?? null);
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    let live = true;
    void Promise.all([api.listRegisteredProviders("music-source"), api.getMusicStatus()]).then(([nextProviders, nextStatus]) => {
      if (!live) return;
      setProviders(nextProviders);
      setStatus(nextStatus);
      setSelectedId(current => current !== null && nextProviders.some(provider => provider.id === current)
        ? current : nextProviders.find(provider => provider.active)?.id ?? nextProviders[0]?.id ?? null);
      setLoading(false);
    }).catch((cause: unknown) => { if (live) { setError(actionError(cause, "Unable to load Music sources", "Refresh the page and check the local service.")); setLoading(false); } });
    return () => { live = false; mounted.current = false; generation.current += 1; detailGeneration.current += 1; statusGeneration.current += 1; if (pairRef.current !== null) void api.cancelMusicPairing(pairRef.current).catch(
      // error-provenance: allow cleanup -- server expiry is authoritative if navigation cancellation fails
      () => undefined
    ); };
  }, [api]);

  useEffect(() => {
    let live = true;
    let timer: number;
    const poll = async () => {
      if (document.visibilityState !== "hidden") {
        const request = ++statusGeneration.current;
        try { const next = await api.getMusicStatus(); if (live && request === statusGeneration.current) { setStatus(next); setRefreshError(null); } }
        catch (cause) { if (live && request === statusGeneration.current) setRefreshError(actionError(cause, "Music status is stale", "Check the local service, then reconnect the selected source if needed.")); }
      }
      if (live) timer = window.setTimeout(() => void poll(), 4_000);
    };
    timer = window.setTimeout(() => void poll(), 4_000);
    return () => { live = false; window.clearTimeout(timer); };
  }, [api]);

  useEffect(() => {
    if (selectedId === null || adding) return;
    const request = ++detailGeneration.current;
    void api.getProvider(selectedId).then(detail => {
      if (request !== detailGeneration.current) return;
      const parsed = pearConfigurationSchema.safeParse(detail.configuration);
      if (parsed.success) setConfig(parsed.data);
      setName(detail.provider.name);
    }).catch((cause: unknown) => { if (request === detailGeneration.current) setError(actionError(cause, "Unable to load Music source", "Select the source again or refresh the list.")); });
  }, [api, selectedId, adding]);

  useEffect(() => {
    const attemptId = pairing?.attemptId;
    if (attemptId === undefined || pairing?.status !== "pending") return;
    let live = true;
    const timer = window.setTimeout(() => {
      void api.getMusicPairing(attemptId).then(next => {
        if (live && pairRef.current === attemptId) setPairing(next);
      }).catch((cause: unknown) => { if (live) setError(actionError(cause, "Unable to check Pear approval", "Start a new pairing request.")); });
    }, 1_000);
    return () => { live = false; window.clearTimeout(timer); };
  }, [api, pairing]);

  const selected = providers.find(provider => provider.id === selectedId) ?? null;
  const dirty = pairing !== null || validation !== null;
  const discard = useCallback(() => { if (pairRef.current !== null) void api.cancelMusicPairing(pairRef.current).catch(
    // error-provenance: allow cleanup -- discarded attempt expires server-side if cancellation fails
    () => undefined
  ); pairRef.current = null; generation.current += 1; setBusy(false); setPairing(null); setValidation(null); }, [api]);
  useDirtyNavigationSource({ id: "music-source-setup", summary: "Music source setup is in progress.", dirty, save: null, discard });

  function cancelPairing() {
    const id = pairRef.current;
    pairRef.current = null;
    generation.current += 1;
    detailGeneration.current += 1;
    statusGeneration.current += 1;
    setBusy(false);
    setPairing(null);
    setValidation(null);
    if (id !== null) void api.cancelMusicPairing(id).catch(
      // error-provenance: allow cleanup -- abandoned attempt expires server-side after cancellation failure
      () => undefined
    );
  }

  function selectSource(id: string | null) {
    cancelPairing();
    setAdding(id === null);
    setSelectedId(id);
    setConfig(defaultConfig);
    setName("Pear Desktop");
    setError(null);
  }

  function changeConfig(next: PearConfiguration) { cancelPairing(); setConfig(next); }

  async function beginPairing() {
    if (pairRef.current !== null) cancelPairing();
    const request = ++generation.current;
    setBusy(true); setError(null); setValidation(null);
    try {
      const next = await api.beginMusicPairing(pearConfigurationSchema.parse(config));
      if (request !== generation.current) { await api.cancelMusicPairing(next.attemptId); return; }
      pairRef.current = next.attemptId; setPairing(next);
    } catch (cause) { if (request === generation.current) setError(actionError(cause, "Unable to start Pear pairing", "Open Pear Desktop on this computer and retry.")); }
    finally { if (request === generation.current) setBusy(false); }
  }

  async function testConnection() {
    if (pairing?.status !== "approved") return;
    const request = generation.current;
    setBusy(true); setError(null);
    try {
      const result = await api.validateProvider({ kind: "pear-desktop", name, configuration: config, pairingAttemptId: pairing.attemptId });
      if (request === generation.current) setValidation(result);
    } catch (cause) { if (request === generation.current) setError(actionError(cause, "Unable to test Pear connection", "Check Pear Desktop and retry pairing.")); }
    finally { if (request === generation.current) setBusy(false); }
  }

  async function save() {
    if (pairing?.status !== "approved" || validation?.valid !== true) return;
    const request = generation.current;
    statusGeneration.current += 1;
    setBusy(true); setError(null);
    try {
      if (adding || selected === null) {
        const result = await api.registerProvider({ kind: "pear-desktop", name: name.trim(), configuration: config, pairingAttemptId: pairing.attemptId });
        if (request !== generation.current) return;
        setValidation(result.validation);
        if (result.status !== "registered") return;
        setSelectedId(result.provider.provider.id); setAdding(false);
      } else {
        const result = await api.replaceMusicCredential(selected.id, { pairingAttemptId: pairing.attemptId, configuration: config });
        if (request !== generation.current) return;
        setValidation(result.validation);
        if (!result.validation.valid) return;
        if (result.runtimeReconcilePending || result.credentialRetirementPending) {
          setNotice({ tone: "warning", message: "Pear authorization was replaced. Reconnect the source if live Music does not resume.", detail: result.credentialRetirementPending ? "The previous authorization remains in the local keyring but is no longer used. Automatic cleanup did not complete." : undefined });
        }
      }
      pairRef.current = null; setPairing(null); setValidation(null);
      await refresh();
      setNotice(current => current?.tone === "warning" ? current : { tone: "success", message: "Music source saved and validated." });
    } catch (cause) { if (request === generation.current) setError(actionError(cause, "Unable to save Music source", "Your previous source remains available. Retry pairing and save.")); }
    finally { if (request === generation.current) setBusy(false); }
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    const request = generation.current;
    statusGeneration.current += 1;
    setBusy(true); setError(null);
    try { await action(); if (request !== generation.current || !mounted.current) return; await refresh(); if (request === generation.current && mounted.current) setNotice({ tone: "success", message: success }); }
    catch (cause) { if (request === generation.current && mounted.current) setError(actionError(cause, "Unable to update Music source", "Check the local service and retry.")); }
    finally { if (request === generation.current && mounted.current) setBusy(false); }
  }

  if (loading) return <p role="status">Loading Music sources…</p>;
  if (error !== null && status === null) return <ManagementErrorBanner error={error} />;
  return <div className="provider-page">
    <p><a href="/manage/modules/music">Edit Music appearance and branding</a></p>
    <section aria-label="Music status">
      <p><strong>Music module:</strong> {status?.enabled ? "Enabled" : "Disabled"}</p>
      <p><strong>Selected source:</strong> {providers.find(provider => provider.id === status?.selectedProviderId)?.name ?? "None"}</p>
      <p role="status"><strong>Live connection:</strong> {status?.enabled ? status.status.state : "Not running while Music is disabled"}{status?.status.stale || refreshError !== null ? " — status stale" : ""}</p>
      {status?.status.state === "auth-required" ? <p role="alert">Pear authorization is required. Re-pair the selected source below.</p> : null}
      {status?.status.diagnosticReference ? <p>Diagnostic reference: <code>{status.status.diagnosticReference}</code></p> : null}
      <button disabled={busy || status === null} onClick={() => void runAction(() => api.setOverlayModuleEnabled("music", !status!.enabled), status?.enabled ? "Music module disabled." : "Music module enabled.")} type="button">{status?.enabled ? "Disable Music" : "Enable Music"}</button>
      {selected?.active ? <button disabled={busy} onClick={() => void runAction(() => api.reconnectMusicSource(selected.id), "Music source reconnecting.")} type="button">Reconnect source</button> : null}
    </section>
    {refreshError === null ? null : <ManagementErrorBanner error={refreshError} />}
    {status !== null && (status.missingAssetIds.landscape.length > 0 || status.missingAssetIds.vertical.length > 0) ? <section aria-label="Music asset diagnostics" role="status">
      <strong>Music branding or fonts unavailable</strong>
      <p>Review the referenced assets in Assets. The widget uses its native fallback until they are available.</p>
      {status.missingAssetIds.landscape.length > 0 ? <p>Landscape: {status.missingAssetIds.landscape.join(", ")}</p> : null}
      {status.missingAssetIds.vertical.length > 0 ? <p>Vertical: {status.missingAssetIds.vertical.join(", ")}</p> : null}
    </section> : null}
    <section aria-label="Music sources">
      <h3>Registered sources</h3>
      {providers.length === 0 ? <p>No Music sources registered.</p> : <ul>{providers.map(provider => <li key={provider.id}>
        <button aria-current={!adding && selectedId === provider.id ? "true" : undefined} onClick={() => selectSource(provider.id)} type="button">{provider.name}</button>
        <span>{provider.active ? " Selected" : " Available"}</span>
        {!provider.active ? <button disabled={busy} onClick={() => void runAction(() => api.activateProvider(provider.id), `${provider.name} selected.`)} type="button">Set active</button> : null}
      </li>)}</ul>}
      <button onClick={() => selectSource(null)} type="button">Add Pear Desktop</button>
    </section>
    {(adding || selected !== null) ? <section aria-label="Pear Desktop setup" className="provider-page__form">
      <h3>{adding ? "Add Pear Desktop" : `Re-pair ${selected?.name}`}</h3>
      <p>Pear Desktop must be running on this computer. Pairing opens an approval request in Pear. This connection uses a loopback address and stays local.</p>
      {adding ? <label><span>Connection name</span><input required value={name} onChange={event => { cancelPairing(); setName(event.currentTarget.value); }} /></label> : null}
      <label><span>Pear address</span><input value={config.baseUrl} onChange={event => changeConfig({ ...config, baseUrl: event.currentTarget.value })} /></label>
      <label><span>Transport</span><select value={config.transport} onChange={event => changeConfig({ ...config, transport: event.currentTarget.value as PearConfiguration["transport"] })}>
        <option value="auto">Automatic (WebSocket, then local polling)</option><option value="ws">WebSocket</option><option value="poll">Local polling</option>
      </select></label>
      <div className="provider-page__actions">
        <button disabled={busy || name.trim() === ""} onClick={() => void beginPairing()} type="button">{pairing === null ? "Pair Pear Desktop" : "Start new pairing"}</button>
        {pairing !== null ? <button disabled={busy} onClick={cancelPairing} type="button">Cancel pairing</button> : null}
        <button disabled={busy || pairing?.status !== "approved"} onClick={() => void testConnection()} type="button">Test connection</button>
        <button disabled={busy || pairing?.status !== "approved" || validation?.valid !== true} onClick={() => void save()} type="button">{adding ? "Save source" : "Replace authorization"}</button>
      </div>
      {pairing !== null ? <p role="status">Pear approval: {pairing.status === "pending" ? "Waiting for approval in Pear Desktop" : pairing.status}</p> : null}
      {validation?.valid === true ? <p role="status">Connection test passed. Save to use this source.</p> : null}
      {validation?.error ? <ManagementErrorBanner error={validation.error} /> : null}
      {pairing?.status === "denied" || pairing?.status === "expired" ? <p role="alert">Pairing did not complete. Start a new pairing request and approve it in Pear Desktop.</p> : null}
      {error === null ? null : <ManagementErrorBanner error={error} />}
    </section> : null}
    {notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
  </div>;
}

function actionError(cause: unknown, summary: string, nextStep: string): ActionableManagementError {
  const referenceId = typeof cause === "object" && cause !== null && "referenceId" in cause && typeof cause.referenceId === "string" ? cause.referenceId : null;
  return { summary, cause: cause instanceof Error ? cause.message : null, nextStep, severity: "error", occurredAt: new Date().toISOString(), referenceId, correction: referenceId === null ? null : { label: "Open Diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(referenceId)}` } };
}
