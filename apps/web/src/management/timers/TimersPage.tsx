import { formatTimerRemaining, timerDefinitionInputSchema, timersOverlayModuleConfigSchema, type TimerDefinition, type TimerDefinitionInput, type TimerRunState, type TimersOverlayModuleConfig } from "@stream-jams/core";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import { AssetPicker } from "../assets/AssetPicker.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { ManagementHttpError } from "../management-http-client.js";
import { TimerStackEditor } from "./TimerStackEditor.js";
import { defaultTimersApi, type TimerAutomationCredentialStatus, type TimerCommand, type TimersApi } from "./timers-api.js";
import "./timers.css";

type AssetRole = "iconAssetId" | "startAudioAssetId" | "endAudioAssetId";
const emptyDraft: TimerDefinitionInput = { label: "", durationMs: 60_000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
  outputs: { browserSource: true, deviceRouteIds: [] } };

export function TimersPage({ assetApi, audioApi, managementApi, api = defaultTimersApi }: {
  readonly assetApi: AssetApi; readonly audioApi: AudioApi; readonly managementApi: AssetLibraryManagementApi; readonly api?: TimersApi;
}) {
  const [definitions, setDefinitions] = useState<readonly TimerDefinition[]>([]); const [states, setStates] = useState<readonly TimerRunState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [draft, setDraft] = useState<TimerDefinitionInput>(emptyDraft);
  const [routes, setRoutes] = useState<readonly { id: string; name: string }[]>([]); const [layout, setLayout] = useState<TimersOverlayModuleConfig | null>(null);
  const [enabled, setEnabled] = useState(false); const [credential, setCredential] = useState<TimerAutomationCredentialStatus | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null); const [pickerRole, setPickerRole] = useState<AssetRole | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const selected = definitions.find(item => item.id === selectedId) ?? null; const active = states.find(state => state.definitionId === selectedId) ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDefinitions, nextStates, moduleConfig, credentialStatus, audioStatus] = await Promise.all([
        api.list(), api.listStates(), api.getModuleConfig(), api.getAutomationCredential(), audioApi.getStatus()
      ]);
      setDefinitions(nextDefinitions); setStates(nextStates); setLayout(moduleConfig.config); setEnabled(moduleConfig.enabled); setCredential(credentialStatus);
      setRoutes(audioStatus.routes.map(({ route }) => ({ id: route.id, name: route.name })));
      setSelectedId(current => current !== null && nextDefinitions.some(item => item.id === current) ? current : (nextDefinitions[0]?.id ?? null));
      setError("");
    } catch (reason) { setError(messageFor(reason)); } finally { setLoading(false); }
  }, [api, audioApi]);
  useEffect(() => { void load(); return () => setIssuedToken(null); }, [load]);
  useEffect(() => { setDraft(selected === null ? emptyDraft : toInput(selected)); }, [selected]);
  const stateById = useMemo(() => new Map(states.map(state => [state.definitionId, state])), [states]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const input = timerDefinitionInputSchema.parse(draft); const saved = selected === null ? await api.create(input) : await api.update(selected.id, input);
      await load(); setSelectedId(saved.id); setMessage(selected === null ? "Timer created." : "Timer saved. Changes apply to the next run.");
    } catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function command(commandName: TimerCommand, id = selectedId) {
    if (id === null) return; setBusy(true);
    try { const result = await api.command(id, commandName); await load(); setMessage(result.changed ? `Timer ${commandName}ed.` : "Timer state did not change."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function remove() {
    if (selectedId === null || active !== null) return; setBusy(true);
    try { await api.remove(selectedId); setSelectedId(null); await load(); setMessage("Timer deleted."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function saveLayout() {
    if (layout === null) return; setBusy(true);
    try { const saved = await api.saveModuleConfig(enabled, timersOverlayModuleConfigSchema.parse(layout)); setLayout(saved.config); setMessage("Timer overlay layout saved."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function rotateCredential() {
    setBusy(true); try { const issued = await api.rotateAutomationCredential(); setCredential(issued); setIssuedToken(issued.token); setMessage("Automation credential created. Copy it now; it will not be shown again."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }
  async function revokeCredential() {
    if (!window.confirm("Revoke the timer automation credential? Existing Stream Deck actions will stop working.")) return;
    setBusy(true); try { await api.revokeAutomationCredential(); setCredential({ configured: false, createdAt: null, rotatedAt: null }); setIssuedToken(null); setMessage("Automation credential revoked."); }
    catch (reason) { setError(messageFor(reason)); } finally { setBusy(false); }
  }

  if (loading && layout === null) return <p role="status">Loading timers…</p>;
  return <div className="timers-page">
    <div aria-live="polite" className="sr-only">{message}</div>{error === "" ? null : <div className="management-error-banner" role="alert"><strong>Timer action failed</strong><p>{error}</p></div>}
    <section className="timers-inventory" aria-labelledby="timer-inventory-heading"><div className="timer-section-heading"><div><p className="management-eyebrow">Reusable definitions</p><h2 id="timer-inventory-heading">Timers</h2></div><button onClick={() => { setSelectedId(null); setDraft(emptyDraft); }} type="button">New timer</button></div>
      {definitions.length === 0 ? <p>No timers yet. Create one for a recurring stream activity.</p> : <ul>{definitions.map(item => { const state = stateById.get(item.id); return <li key={item.id}><button aria-current={selectedId === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)} type="button"><strong>{item.label}</strong><span>{formatTimerRemaining(item.durationMs)} · {state?.status ?? "idle"}</span></button><button disabled={busy} onClick={() => void command(state?.status === "paused" ? "resume" : "start", item.id)} type="button">{state?.status === "paused" ? "Resume" : "Start"}</button></li>; })}</ul>}
    </section>
    <form className="timer-editor" onSubmit={save}><div className="timer-section-heading"><div><p className="management-eyebrow">Definition</p><h2>{selected === null ? "Create timer" : `Edit ${selected.label}`}</h2></div>{active === null ? null : <span className="status-badge">{active.status}</span>}</div>
      {active === null ? null : <p className="timer-editor__notice">This run keeps its current name, duration, assets, and outputs. Saved edits apply next time.</p>}
      <label>Name<input required maxLength={120} value={draft.label} onChange={event => setDraft({ ...draft, label: event.currentTarget.value })} /></label>
      <label>Duration (seconds)<input required min="1" type="number" value={draft.durationMs / 1000} onChange={event => setDraft({ ...draft, durationMs: Math.round(Number(event.currentTarget.value) * 1000) })} /></label>
      <fieldset><legend>Assets</legend>{(["iconAssetId", "startAudioAssetId", "endAudioAssetId"] as const).map(role => <div className="timer-asset-row" key={role}><span>{role === "iconAssetId" ? "Icon" : role === "startAudioAssetId" ? "Start sound" : "End sound"}</span><code>{draft[role] ?? "None"}</code><button onClick={() => setPickerRole(role)} type="button">Choose</button>{draft[role] === null ? null : <button onClick={() => setDraft({ ...draft, [role]: null })} type="button">Clear</button>}</div>)}</fieldset>
      <fieldset><legend>Audio outputs</legend><label><input checked={draft.outputs.browserSource} onChange={event => setDraft({ ...draft, outputs: { ...draft.outputs, browserSource: event.currentTarget.checked } })} type="checkbox" /> Browser Source</label>{routes.map(route => <label key={route.id}><input checked={draft.outputs.deviceRouteIds.includes(route.id)} onChange={() => setDraft({ ...draft, outputs: { ...draft.outputs, deviceRouteIds: draft.outputs.deviceRouteIds.includes(route.id) ? draft.outputs.deviceRouteIds.filter(id => id !== route.id) : [...draft.outputs.deviceRouteIds, route.id] } })} type="checkbox" /> {route.name}</label>)}</fieldset>
      <div className="timer-editor__actions"><button disabled={busy} type="submit">{selected === null ? "Create timer" : "Save timer"}</button>{selected === null ? null : <><button disabled={busy || active?.status !== "running"} onClick={() => void command("pause")} type="button">Pause</button><button disabled={busy || active?.status !== "paused"} onClick={() => void command("resume")} type="button">Resume</button><button disabled={busy || active === null} onClick={() => void command("stop")} type="button">Stop</button><button disabled={busy} onClick={() => void command("restart")} type="button">Restart</button><button className="button--danger" disabled={busy || active !== null} onClick={() => void remove()} type="button">Delete</button></>}</div>
    </form>
    {layout === null ? null : <><TimerStackEditor value={layout} onChange={setLayout} /><section className="timer-layout-save"><label><input checked={enabled} onChange={event => setEnabled(event.currentTarget.checked)} type="checkbox" /> Show Timers module</label><button disabled={busy} onClick={() => void saveLayout()} type="button">Save overlay layout</button></section></>}
    <section className="timer-credential" aria-labelledby="timer-credential-heading"><p className="management-eyebrow">Stream Deck HTTP</p><h2 id="timer-credential-heading">Automation credential</h2><p>{credential?.configured ? "Configured. Rotating invalidates the previous credential immediately." : "Not configured."}</p>{issuedToken === null ? null : <div className="timer-token"><label>Copy this credential now<input readOnly value={issuedToken} /></label><button onClick={() => void navigator.clipboard?.writeText(issuedToken)} type="button">Copy</button><button onClick={() => setIssuedToken(null)} type="button">Dismiss</button></div>}<div><button disabled={busy} onClick={() => void rotateCredential()} type="button">{credential?.configured ? "Rotate credential" : "Create credential"}</button><button disabled={busy || !credential?.configured} onClick={() => void revokeCredential()} type="button">Revoke</button></div></section>
    <AssetPicker assetApi={assetApi} compatibleMediaTypes={pickerRole === "iconAssetId" ? ["image"] : ["audio"]} managementApi={managementApi} onCancel={() => setPickerRole(null)} onSelect={assetId => { if (pickerRole !== null) setDraft(current => ({ ...current, [pickerRole]: assetId })); setPickerRole(null); }} open={pickerRole !== null} selectedAssetId={pickerRole === null ? null : draft[pickerRole]} />
  </div>;
}

function toInput(definition: TimerDefinition): TimerDefinitionInput { return { label: definition.label, durationMs: definition.durationMs, iconAssetId: definition.iconAssetId,
  startAudioAssetId: definition.startAudioAssetId, endAudioAssetId: definition.endAudioAssetId, outputs: definition.outputs }; }
function messageFor(reason: unknown): string { return reason instanceof ManagementHttpError || reason instanceof Error ? reason.message : "The timer request failed."; }
