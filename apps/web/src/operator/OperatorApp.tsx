import type { MergedOperationsSnapshot, OperationRow } from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import "../App.css";
import { getDesktopBridge } from "../management/desktop/desktop-bridge.js";
import { formatDateTime } from "../management/foundation/formatters.js";
import { StatusBadge, type StatusBadgeTone } from "../management/foundation/StatusBadge.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import { createHttpPlaybackApi, type PlaybackApi } from "./playback-api.js";

const normalPollDelayMs = 2_000;
const maximumPollDelayMs = 15_000;
const defaultPlaybackApi = createHttpPlaybackApi();

interface OperatorError {
  readonly message: string;
  readonly referenceId: string | null;
}

interface ClearRequest {
  readonly moduleId: string;
  readonly count: number;
}

export interface OperatorAppProps {
  readonly api?: PlaybackApi;
}

export function OperatorApp({ api = defaultPlaybackApi }: OperatorAppProps) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    return bridge?.onQuitRequested((requestId) => bridge.resolveQuit(requestId, true));
  }, []);
  const [snapshot, setSnapshot] = useState<MergedOperationsSnapshot | null>(null);
  const [initialError, setInitialError] = useState<OperatorError | null>(null);
  const [refreshError, setRefreshError] = useState<OperatorError | null>(null);
  const [commandError, setCommandError] = useState<OperatorError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [clearRequest, setClearRequest] = useState<ClearRequest | null>(null);
  const snapshotRef = useRef<MergedOperationsSnapshot | null>(null);
  const pendingRef = useRef(false);
  const requestRevisionRef = useRef(0);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const nowPlayingHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const schedulePollRef = useRef<((delay: number) => void) | null>(null);

  function applySnapshot(next: MergedOperationsSnapshot): void {
    snapshotRef.current = next;
    setSnapshot(next);
  }

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = normalPollDelayMs;
    let failureCount = 0;

    function schedule(nextDelay: number): void {
      if (disposed) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void poll(), nextDelay);
    }
    schedulePollRef.current = schedule;

    async function poll(): Promise<void> {
      if (disposed) return;
      if (document.hidden || pendingRef.current) {
        schedule(delay);
        return;
      }
      const revision = requestRevisionRef.current;
      try {
        const next = await api.getSnapshot();
        if (disposed || revision !== requestRevisionRef.current) return;
        applySnapshot(next);
        setInitialError(null);
        setRefreshError(null);
        delay = normalPollDelayMs;
        failureCount = 0;
      } catch (error) {
        if (disposed || revision !== requestRevisionRef.current) return;
        const safeError = toOperatorError(error, "Unable to load playback state.");
        if (snapshotRef.current === null) setInitialError(safeError);
        else setRefreshError(safeError);
        delay = Math.min(normalPollDelayMs * 2 ** failureCount, maximumPollDelayMs);
        failureCount += 1;
      } finally {
        if (revision === requestRevisionRef.current) schedule(delay);
      }
    }

    function handleVisibilityChange(): void {
      if (document.hidden) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        return;
      }
      requestRevisionRef.current += 1;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      schedulePollRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [api]);

  useEffect(() => {
    if (pending !== null || restoreFocusRef.current === null) return;
    const target = restoreFocusRef.current;
    if (target.isConnected && !target.disabled) target.focus();
    else nowPlayingHeadingRef.current?.focus();
    restoreFocusRef.current = null;
  }, [pending]);

  async function runCommand(
    key: string,
    request: () => Promise<MergedOperationsSnapshot>,
    message: string,
    focusTarget: HTMLButtonElement
  ): Promise<void> {
    if (pendingRef.current) return;
    pendingRef.current = true;
    restoreFocusRef.current = focusTarget;
    requestRevisionRef.current += 1;
    setPending(key);
    setCommandError(null);
    setAnnouncement("");
    try {
      const next = await request();
      requestRevisionRef.current += 1;
      applySnapshot(next);
      setRefreshError(null);
      setAnnouncement(message);
    } catch (error) {
      setCommandError(toOperatorError(error, "The playback command failed."));
    } finally {
      pendingRef.current = false;
      setPending(null);
      setClearRequest(null);
      schedulePollRef.current?.(normalPollDelayMs);
    }
  }

  const retry = () => {
    requestRevisionRef.current += 1;
    setInitialError(null);
    setRefreshError(null);
    void api.getSnapshot()
      .then((next) => { applySnapshot(next); setInitialError(null); })
      .catch((error: unknown) => setInitialError(toOperatorError(error, "Unable to load playback state.")));
  };

  if (snapshot === null) {
    return (
      <main className="operator-console">
        <OperatorHeader />
        {initialError === null ? <p aria-live="polite" role="status">Loading playback state…</p> : (
          <OperatorErrorBanner error={initialError} title="Unable to load playback state">
            <button className="button button--secondary" onClick={retry} type="button">Retry loading playback state</button>
          </OperatorErrorBanner>
        )}
      </main>
    );
  }

  const disabled = pending !== null;
  return (
    <main className="operator-console">
      <OperatorHeader />
      <section aria-label="Playback safety status" className="operator-status-strip">
        <StatusBadge label={snapshot.paused ? "All queues paused" : "Global playback active"} tone={snapshot.paused ? "warning" : "positive"} />
        <StatusBadge label={snapshot.muted ? "Audio muted" : "Audio on"} tone={snapshot.muted ? "warning" : "positive"} />
        <StatusBadge label={snapshot.doNotDisturb ? "Do-not-disturb on" : "Do-not-disturb off"} tone={snapshot.doNotDisturb ? "warning" : "positive"} />
      </section>

      <section aria-label="Global playback controls" className="operator-controls">
        <button className="button button--primary" disabled={disabled} onClick={(event) => void runCommand(
          snapshot.paused ? "resume" : "pause",
          snapshot.paused ? api.resume : api.pause,
          snapshot.paused ? "All queues resumed. Module pauses remain in place." : "All queues paused. Current playback continues.",
          event.currentTarget
        )} type="button">{snapshot.paused ? "Resume all queues" : "Pause all queues"}</button>
        <button className="button button--secondary" disabled={disabled} onClick={(event) => void runCommand(
          snapshot.muted ? "unmute" : "mute",
          snapshot.muted ? api.unmute : api.mute,
          snapshot.muted ? "Playback audio unmuted." : "Playback audio muted.",
          event.currentTarget
        )} type="button">{snapshot.muted ? "Unmute playback audio" : "Mute playback audio"}</button>
        <button aria-pressed={snapshot.doNotDisturb} className="button button--secondary" disabled={disabled} onClick={(event) => void runCommand(
          "dnd",
          () => api.setDoNotDisturb(!snapshot.doNotDisturb),
          snapshot.doNotDisturb ? "Do-not-disturb disabled." : "Do-not-disturb enabled.",
          event.currentTarget
        )} type="button">{snapshot.doNotDisturb ? "Disable do-not-disturb" : "Enable do-not-disturb"}</button>
      </section>

      {snapshot.paused ? <p className="operator-boundary-note">Current playback continues; pending items wait in their owning module queues.</p> : null}
      {snapshot.muted ? <p className="operator-boundary-note">Browser and device audio are muted. Visuals continue.</p> : null}
      {announcement === "" ? null : <p aria-live="polite" className="operator-announcement" role="status">{announcement}</p>}
      {commandError !== null ? <OperatorErrorBanner error={commandError} title="Playback command failed" /> : refreshError === null ? null : <OperatorErrorBanner error={refreshError} title="Playback state may be stale" />}

      <section aria-label="Module queue controls" className="operator-section">
        <h2>Module queues</h2>
        <div className="operator-list">
          {snapshot.owners.map((owner) => {
            const count = snapshot.queued.filter((item) => item.moduleId === owner.moduleId).length;
            return (
              <article className="operator-item" key={owner.moduleId}>
                <div className="operator-item__summary">
                  <div><strong>{moduleLabel(owner.moduleId)}</strong><span>{count} pending</span></div>
                  <div className="operator-controls">
                    <button className="button button--secondary button--compact" disabled={disabled} onClick={(event) => void runCommand(
                      `module:${owner.moduleId}:pause`,
                      () => api.setModulePaused(owner.moduleId, !owner.paused),
                      `${moduleLabel(owner.moduleId)} ${owner.paused ? "resumed" : "paused"}.`,
                      event.currentTarget
                    )} type="button">{owner.paused ? "Resume module" : "Pause module"}</button>
                    <button className="button button--danger-quiet button--compact" disabled={disabled || count === 0} onClick={() => setClearRequest({ moduleId: owner.moduleId, count })} type="button">Clear pending</button>
                  </div>
                </div>
                <StatusBadge label={owner.paused ? "Module paused" : "Module active"} tone={owner.paused ? "warning" : "positive"} />
              </article>
            );
          })}
        </div>
      </section>

      {clearRequest === null ? null : (
        <section aria-labelledby="operator-clear-title" aria-modal="true" className="operator-item" role="dialog">
          <h2 id="operator-clear-title">Clear {clearRequest.count} pending {moduleLabel(clearRequest.moduleId)} item{clearRequest.count === 1 ? "" : "s"}?</h2>
          <p>Current playback and the other module queue will not be changed.</p>
          <div className="operator-controls">
            <button className="button button--secondary" disabled={disabled} onClick={() => setClearRequest(null)} type="button">Cancel</button>
            <button className="button button--danger" disabled={disabled} onClick={(event) => void runCommand(
              `module:${clearRequest.moduleId}:clear`,
              () => api.clear(clearRequest.moduleId, clearRequest.count, snapshot.revision),
              `${moduleLabel(clearRequest.moduleId)} pending queue cleared.`,
              event.currentTarget
            )} type="button">Clear pending</button>
          </div>
        </section>
      )}

      <section className="operator-section" aria-labelledby="operator-now-playing">
        <h2 id="operator-now-playing" ref={nowPlayingHeadingRef} tabIndex={-1}>Now playing ({snapshot.current.length})</h2>
        {snapshot.current.length === 0 ? <p className="management-empty">No playback is active.</p> : (
          <ol className="operator-list">
            {snapshot.current.map((item) => <li key={operationKey(item)}><OperationCard item={item} action={(
              <button aria-label={`Skip ${item.name} in ${moduleLabel(item.moduleId)}`} className="button button--danger-quiet button--compact" disabled={disabled} onClick={(event) => void runCommand(
                `skip:${operationKey(item)}`,
                () => api.skip(item.moduleId, item.occurrenceId),
                `${item.name} skipped in ${moduleLabel(item.moduleId)}.`,
                event.currentTarget
              )} type="button">Skip</button>
            )} /></li>)}
          </ol>
        )}
      </section>

      <OperationList heading={`Pending (${snapshot.queued.length})`} items={snapshot.queued} renderAction={(item) => (
        <button aria-label={`Remove ${item.name} from ${moduleLabel(item.moduleId)}`} className="button button--secondary button--compact" disabled={disabled} onClick={(event) => void runCommand(
          `remove:${operationKey(item)}`,
          () => api.remove(item.moduleId, item.occurrenceId),
          `${item.name} removed from ${moduleLabel(item.moduleId)}.`,
          event.currentTarget
        )} type="button">Remove</button>
      )} />
      <OperationList heading={`Recent (${snapshot.recent.length})`} items={snapshot.recent} renderAction={(item) => (
        <button aria-label={`Replay ${item.name} in ${moduleLabel(item.moduleId)}`} className="button button--secondary button--compact" disabled={disabled} onClick={(event) => void runCommand(
          `replay:${operationKey(item)}`,
          () => api.replay(item.moduleId, item.occurrenceId),
          `${item.name} added to the ${moduleLabel(item.moduleId)} queue.`,
          event.currentTarget
        )} type="button">Replay</button>
      )} />
    </main>
  );
}

function OperatorHeader() {
  return <header className="operator-header"><div><p className="management-eyebrow">Stream Jams</p><h1>Operator Console</h1></div><a className="button button--secondary surface-switch-link" href="/manage">Back to management</a></header>;
}

function OperatorErrorBanner({ children, error, title }: { readonly children?: React.ReactNode; readonly error: OperatorError; readonly title: string }) {
  const diagnosticsRoute = error.referenceId === null ? "/manage/diagnostics" : `/manage/diagnostics?reference=${encodeURIComponent(error.referenceId)}`;
  return <section className="management-error-banner management-error-banner--error operator-error" role="alert"><div><strong>{title}</strong><p>{error.message}</p>{children}</div><a href={diagnosticsRoute}>Open diagnostics</a></section>;
}

function OperationList({ heading, items, renderAction }: { readonly heading: string; readonly items: readonly OperationRow[]; readonly renderAction: (item: OperationRow) => React.ReactNode }) {
  return <section className="operator-section"><h2>{heading}</h2>{items.length === 0 ? <p className="management-empty">Nothing here.</p> : <ol className="operator-list">{items.map((item) => <li key={operationKey(item)}><OperationCard action={renderAction(item)} item={item} /></li>)}</ol>}</section>;
}

function OperationCard({ action, item }: { readonly action: React.ReactNode; readonly item: OperationRow }) {
  return (
    <article className="operator-item">
      <div className="operator-item__summary"><div><strong>{item.name}</strong><span>{item.summary}</span></div>{action}</div>
      <dl>
        <ItemDetail label="Module" value={moduleLabel(item.moduleId)} />
        {item.moduleQueuePosition === null ? null : <ItemDetail label="Module position" value={`#${item.moduleQueuePosition}`} />}
        <ItemDetail label="Status" value={formatStatus(item.status)} tone={statusTone(item.status)} />
        <ItemDetail label="Received" value={formatDateTime(item.enqueuedAtMs)} />
      </dl>
    </article>
  );
}

function ItemDetail({ label, tone, value }: { readonly label: string; readonly tone?: StatusBadgeTone; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{tone === undefined ? value : <StatusBadge label={value} tone={tone} />}</dd></div>;
}

function moduleLabel(moduleId: string): string {
  return moduleId === "alerts" ? "Alerts" : moduleId === "screen-effects" ? "Screen Effects" : moduleId;
}

function operationKey(item: OperationRow): string {
  return `${item.moduleId}:${item.occurrenceId}`;
}

function formatStatus(value: OperationRow["status"]): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function statusTone(value: OperationRow["status"]): StatusBadgeTone {
  if (value === "playing" || value === "completed") return "positive";
  if (value === "skipped") return "warning";
  if (value === "failed") return "negative";
  return "neutral";
}

function toOperatorError(error: unknown, fallback: string): OperatorError {
  if (error instanceof ManagementHttpError) return { message: error.message, referenceId: error.referenceId };
  if (error instanceof Error && error.message.trim() !== "") return { message: error.message, referenceId: null };
  return { message: fallback, referenceId: null };
}
