import { Button, TextInput } from "@mantine/core";
import { dataValueSchema, type DataOverlayState, type DataValue } from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import { ManagementModalSurface, ManagementModalTitle } from "../management/foundation/ManagementModalSurface.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import { defaultOperatorDataApi, type OperatorDataApi } from "./data-api.js";

export function OperatorDataSection({ api = defaultOperatorDataApi }: { readonly api?: OperatorDataApi }) {
  const [state, setState] = useState<DataOverlayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState<{ label: string; request: () => Promise<DataOverlayState> } | null>(null);
  const busy = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const latest = useRef<DataOverlayState | null>(null);
  function apply(next: DataOverlayState) {
    if (latest.current !== null && next.revision < latest.current.revision) return;
    latest.current = next; setState(next);
  }
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const generation = epoch.current;
      try {
        if (!document.hidden && !busy.current) {
          const next = await api.getState();
          if (!disposed && generation === epoch.current) { apply(next); setLoadError(null); }
        }
      } catch (cause) {
        if (!disposed && generation === epoch.current) setLoadError(message(cause));
      } finally { if (!disposed) timer = setTimeout(() => void poll(), 2000); }
    }
    void poll();
    return () => { disposed = true; mounted.current = false; epoch.current++; clearTimeout(timer); };
  }, [api]);
  async function run(request: () => Promise<DataOverlayState>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true; epoch.current++; setPending(true); setError(null);
    try {
      const next = await request();
      if (!mounted.current) return false;
      apply(next); setReview(null); return true;
    } catch (cause) {
      if (!mounted.current) return false;
      if (cause instanceof ManagementHttpError) {
        const value = dataValueSchema.safeParse(cause.currentValue);
        if (value.success && latest.current !== null) {
          const next = { ...latest.current, values: latest.current.values.map(item => item.id === value.data.id ? value.data : item) };
          latest.current = next; setState(next);
        }
      }
      setError(message(cause));
      return false;
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  return <section className="operator-section" aria-labelledby="operator-data-heading">
    <h2 id="operator-data-heading">Data</h2>
    {review === null && error !== null ? <p role="alert">{error}</p> : null}
    {loadError === null ? null : <p role="alert">Data may be stale. {loadError}</p>}
    {state === null ? <p role="status">{loadError === null ? "Loading Data…" : "Data is unavailable. Refresh retries automatically."}</p> : <>
      {state.pinnedValueIds.length === 0 ? <p>No values are pinned. Pin values in Management.</p> : <div className="operator-list">
        {state.pinnedValueIds.map(id => state.values.find(value => value.id === id)).filter((value): value is DataValue => value !== undefined).map(value => <DataValueControl key={value.id} value={value} pending={pending} onSet={content => run(() => api.setValue(value.id, { content, expectedRevision: value.revision }))} onDelta={action => void run(() => api.delta(value.id, action))} onReset={() => { setError(null); setReview({ label: `Reset ${value.name}`, request: () => api.resetValue(value.id) }); }} />)}
      </div>}
      <div className="operator-controls">{state.resetGroups.filter(group => state.values.some(value => value.resetGroupId === group.id)).map(group => <Button key={group.id} variant="default" disabled={pending} onClick={() => { setError(null); setReview({ label: `Reset group ${group.name}`, request: () => api.resetGroup(group.id) }); }}>Reset group {group.name}</Button>)}</div>
      <div className="operator-controls">{state.goals.filter(goal => goal.mode === "saved-baseline").map(goal => <Button key={goal.id} variant="default" disabled={pending} onClick={() => { setError(null); setReview({ label: `Restart goal ${goal.name}`, request: () => api.restartGoal(goal.id) }); }}>Restart goal {goal.name}</Button>)}</div>
      <div className="operator-controls">{state.canvases.map(canvas => <Button key={canvas.id} variant="default" disabled={pending} aria-pressed={canvas.enabled} onClick={() => void run(() => api.setVisibility(canvas.id, !canvas.enabled))}>{canvas.enabled ? "Hide" : "Show"} {canvas.name}</Button>)}</div>
    </>}
    <ManagementModalSurface labelledBy="operator-data-review" open={review !== null} pending={pending} onCancel={() => setReview(null)}>
      <ManagementModalTitle>{review?.label}?</ManagementModalTitle>
      <p>Reset uses saved defaults. Group reset also restarts its saved-baseline goals.</p>
      {error === null ? null : <p role="alert">{error}</p>}
      <div className="management-modal__actions"><Button variant="default" disabled={pending} onClick={() => setReview(null)}>Cancel</Button><Button color="red" disabled={pending} onClick={() => review === null ? undefined : void run(review.request)}>Confirm</Button></div>
    </ManagementModalSurface>
  </section>;
}
function DataValueControl({ value, pending, onSet, onDelta, onReset }: { value: DataValue; pending: boolean; onSet(content: number | string): Promise<boolean>; onDelta(action: "add" | "subtract"): void; onReset(): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const content = draft ?? String(value.content);
  const valid = value.kind === "text" || (content.trim() !== "" && Number.isSafeInteger(Number(content)));
  return <article className="operator-item" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <h3>{value.name}</h3><p>Current: {String(value.content)}</p>
    <form onSubmit={event => { event.preventDefault(); if (valid) void onSet(value.kind === "integer" ? Number(content) : content).then(saved => { if (saved) setDraft(null); }); }}>
      <TextInput label={`Set ${value.name}`} type={value.kind === "integer" ? "number" : "text"} value={content} onChange={event => setDraft(event.currentTarget.value)} disabled={pending} error={valid ? undefined : "Enter a safe whole number."} />
      <div className="operator-controls">{value.kind === "integer" ? <><Button disabled={pending} aria-label={`Add one to ${value.name}`} onClick={() => onDelta("add")}>+1</Button><Button disabled={pending} aria-label={`Subtract one from ${value.name}`} onClick={() => onDelta("subtract")}>−1</Button></> : null}<Button type="submit" disabled={pending || !valid}>Set {value.name}</Button><Button variant="default" disabled={pending} onClick={onReset}>Reset {value.name}</Button></div>
    </form>
  </article>;
}
function message(cause: unknown): string {
  return cause instanceof ManagementHttpError ? `${cause.message}${cause.referenceId === null ? "" : ` Reference: ${cause.referenceId}`}` : "Data request failed. Check the local service and retry; your correction is retained.";
}
