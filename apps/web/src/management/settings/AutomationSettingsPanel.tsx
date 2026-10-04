import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionableManagementError } from "@stream-jams/core";
import { ManagementErrorBanner } from "../foundation/ManagementErrorBanner.js";
import { ManagementToast } from "../foundation/ManagementToast.js";
import { ManagementHttpError } from "../management-http-client.js";
import { defaultAutomationSettingsApi, type AutomationScope, type AutomationSettingsApi, type AutomationPairingView, type AutomationGrantView } from "./automation-api.js";
import "./automation-settings-panel.css";

export function AutomationSettingsPanel({ api = defaultAutomationSettingsApi }: { readonly api?: AutomationSettingsApi | undefined }) {
  const [data, setData] = useState<{ pairings: readonly AutomationPairingView[]; grants: readonly AutomationGrantView[] } | null>(null);
  const [selections, setSelections] = useState<Record<string, readonly AutomationScope[]>>({});
  const selectionApi = useRef(api);
  const [error, setError] = useState<ActionableManagementError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);
  const fetching = useRef<number | null>(null);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    if (fetching.current !== null) return;
    const request = ++sequence.current;
    fetching.current = request;
    try {
      const [pairings, grants] = await Promise.all([api.listPairings(), api.listGrants()]);
      if (mounted.current && request === sequence.current) { const reset = selectionApi.current !== api;
        selectionApi.current = api;
        setSelections(previous => Object.fromEntries(pairings.map(pairing => [pairing.id,
          reset || previous[pairing.id] === undefined ? pairing.scopes : previous[pairing.id]!.filter(scope => pairing.scopes.includes(scope))])));
        setData({ pairings, grants }); setError(null); }
    } catch (cause) {
      if (mounted.current && request === sequence.current) setError(actionable("Automation status could not be refreshed", cause));
    } finally { if (fetching.current === request) fetching.current = null; }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void load();
    const refreshVisible = () => { if (document.visibilityState !== "hidden") void load(); };
    const timer = window.setInterval(refreshVisible, 5000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { mounted.current = false; sequence.current++; fetching.current = null; window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [load]);
  function select(pairing: AutomationPairingView, scope: AutomationScope, checked: boolean) {
    setSelections(previous => {
      const selected = new Set(previous[pairing.id] ?? []);
      if (checked) { selected.add(scope); const read = requiredRead(scope); if (read !== null && pairing.scopes.includes(read)) selected.add(read); }
      else { selected.delete(scope); for (const candidate of selected) if (requiredRead(candidate) === scope) selected.delete(candidate); }
      return { ...previous, [pairing.id]: pairing.scopes.filter(candidate => selected.has(candidate)) };
    });
  }
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true); setNotice(null); sequence.current++;
    try { await work(); if (mounted.current) { setNotice(message); setError(null); } }
    catch (cause) { if (mounted.current) setError(actionable("Automation action could not be confirmed", cause)); }
    finally { if (mounted.current) { setBusy(false); void load(); } }
  }
  return <section aria-labelledby="automation-heading" className="automation-settings settings-page__section">
    <div className="settings-page__section-heading"><div><h3 id="automation-heading">Automation permissions</h3><p>Approve local clients only after matching the comparison code shown in that client. Client names are self-reported.</p></div><button disabled={busy} onClick={() => void load()} type="button">Refresh automation</button></div>
    {error === null ? null : <><ManagementErrorBanner error={error} />{data === null ? null : <p role="status">Last known automation status is stale. Refresh before making a decision.</p>}</>}
    {notice === null ? null : <ManagementToast notice={{ tone: "success", message: notice }} onDismiss={() => setNotice(null)} />}
    {data === null ? (error === null ? <p role="status">Loading automation permissions...</p> : null) : <>
      <h4>Pairing requests</h4>
      {data.pairings.length === 0 ? <p>No pairing requests. Start pairing from your local automation client.</p> : data.pairings.map(pairing => {
        const selected = pairing.scopes.filter(scope => selections[pairing.id]?.includes(scope));
        const valid = selected.length > 0 && selected.every(scope => { const read = requiredRead(scope); return read === null || selected.includes(read); });
        return <article className="automation-settings__item" key={pairing.id} aria-label={`Pairing ${pairing.clientName}`}>
        <h5>{pairing.clientName}</h5><p>Self-reported client name - {pairing.status}</p>
        <p>Comparison code: <strong className="automation-settings__code">{pairing.comparisonCode}</strong></p>
        <p>Expires: <time dateTime={pairing.expiresAt}>{new Date(pairing.expiresAt).toLocaleString()}</time></p>
        {pairing.status !== "pending" ? <><p>Requested permissions:</p><ul>{pairing.scopes.map(scope => <li key={scope}>{scope}</li>)}</ul></> : <>
          <fieldset className="automation-settings__scopes" disabled={busy || error !== null}>
            <legend>Permissions to approve</legend>
            {pairing.scopes.map(scope => <label key={scope}><input type="checkbox" checked={selected.includes(scope)} onChange={event => select(pairing, scope, event.target.checked)} />{scope}</label>)}
          </fieldset>
          <p>Selecting a control also selects its read permission. Clearing read clears its dependent controls.</p>
          {valid ? null : <p role="status">{selected.length === 0 ? "Select at least one permission to approve." : "Control permissions require their corresponding read permission."}</p>}
        </>}
        {pairing.status !== "pending" ? <p>{pairing.status === "approved" ? "Approved. Waiting for the client to finish pairing." : "Pairing denied."}</p> : <div className="automation-settings__actions"><button disabled={busy || error !== null || !valid} onClick={() => void act(() => api.approve(pairing.id, selected), "Pairing approved for the selected permissions.")} type="button">Approve {pairing.clientName}</button><button disabled={busy || error !== null} onClick={() => void act(() => api.deny(pairing.id), "Pairing denied.")} type="button">Deny {pairing.clientName}</button></div>}
      </article>; })}
      <h4>Paired clients</h4>
      {data.grants.length === 0 ? <p>No paired clients.</p> : data.grants.map(grant => <article className="automation-settings__item" key={grant.id} aria-label={`Permissions for ${grant.clientName}`}><h5>{grant.clientName}</h5><p>{grant.revokedAt === null ? "Access granted" : "Access revoked"}</p><ul>{grant.scopes.map(scope => <li key={scope}>{scope}</li>)}</ul>{grant.revokedAt === null ? <button disabled={busy} onClick={() => void act(() => api.revoke(grant.id), "Automation access revoked.")} type="button">Revoke {grant.clientName}</button> : null}</article>)}
    </>}
  </section>;
}
function actionable(summary: string, cause: unknown): ActionableManagementError {
  return { severity: "error", summary, cause: cause instanceof Error ? cause.message : "The local service did not respond.", nextStep: "Refresh automation status. Check Diagnostics if this persists; verify the client's code again before approving.", referenceId: cause instanceof ManagementHttpError ? cause.referenceId : null, occurredAt: null, correction: null };
}

function requiredRead(scope: AutomationScope): AutomationScope | null {
  if (scope === "timers:control") return "timers:read";
  return scope.startsWith("playback:") && scope !== "playback:read" ? "playback:read" : null;
}
