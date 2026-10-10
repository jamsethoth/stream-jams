import { ActionIcon, Button } from "@mantine/core";
import { formatTimerRemaining, type MergedOperationsSnapshot, type OperationRow, type TimerRunState } from "@stream-jams/core";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "../App.css";
import { getDesktopBridge } from "../management/desktop/desktop-bridge.js";
import { formatDateTime } from "../management/foundation/formatters.js";
import { ManagementModalSurface, ManagementModalTitle } from "../management/foundation/ManagementModalSurface.js";
import { ManagementPresentationProvider } from "../management/foundation/ManagementPresentationProvider.js";
import { StatusBadge, type StatusBadgeTone } from "../management/foundation/StatusBadge.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import {
  createHttpPlaybackApi,
  PlaybackOperationsConflictError,
  type PlaybackApi
} from "./playback-api.js";
import { TimerAdjustmentControls } from "../management/timers/TimerAdjustmentControls.js";
import { defaultOperatorTimersApi, type OperatorTimersApi } from "./timers-api.js";
import type { VideoQueueApi } from "../management/videos/videos-api.js";
const OperatorVideosPanel = lazy(() => import("../management/videos/VideosPage.js").then(module => ({ default: module.OperatorVideosPanel })));

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
  readonly timersApi?: OperatorTimersApi;
  /** Defaults to the HTTP queue client created inside the lazily loaded panel, attributed to the Operator. */
  readonly videosApi?: VideoQueueApi;
}

// Operator shares the management presentation provider so its commands, dialogs and theme match management.
export function OperatorApp(props: OperatorAppProps) {
  return <ManagementPresentationProvider><OperatorConsole {...props} /></ManagementPresentationProvider>;
}

function OperatorConsole({ api = defaultPlaybackApi, timersApi = defaultOperatorTimersApi, videosApi }: OperatorAppProps) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    return bridge?.onQuitRequested((requestId) => bridge.resolveQuit(requestId, true));
  }, []);
  const [snapshot, setSnapshot] = useState<MergedOperationsSnapshot | null>(null);
  const [timers, setTimers] = useState<readonly TimerRunState[]>([]);
  const [initialError, setInitialError] = useState<OperatorError | null>(null);
  const [refreshError, setRefreshError] = useState<OperatorError | null>(null);
  const [timerRefreshError, setTimerRefreshError] = useState<OperatorError | null>(null);
  const [commandError, setCommandError] = useState<OperatorError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [clearRequest, setClearRequest] = useState<ClearRequest | null>(null);
  const snapshotRef = useRef<MergedOperationsSnapshot | null>(null);
  const pendingRef = useRef(false);
  const requestRevisionRef = useRef(0);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const nowPlayingHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const clearFallbackFocusRef = useRef<HTMLElement | null>(null);
  const moduleHeadingRefs = useRef(new Map<string, HTMLHeadingElement>());
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
        const [playbackResult, timersResult] = await Promise.allSettled([api.getSnapshot(), timersApi.listStates()]);
        if (disposed || revision !== requestRevisionRef.current) return;
        if (timersResult.status === "fulfilled") { setTimers(timersResult.value); setTimerRefreshError(null); }
        else setTimerRefreshError(toOperatorError(timersResult.reason, "Unable to refresh timer state."));
        if (playbackResult.status === "rejected") throw playbackResult.reason;
        const next = playbackResult.value;
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
  }, [api, timersApi]);

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
      if (error instanceof PlaybackOperationsConflictError) {
        requestRevisionRef.current += 1;
        applySnapshot(error.snapshot);
        setRefreshError(null);
      }
      setCommandError(toOperatorError(error, "The playback command failed."));
    } finally {
      pendingRef.current = false;
      setPending(null);
      setClearRequest(null);
      schedulePollRef.current?.(normalPollDelayMs);
    }
  }

  async function adjustTimer(timer: TimerRunState, input: import("@stream-jams/core").TimerAdjustment) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(`timer:${timer.definitionId}:adjust`); setCommandError(null);
    try { await timersApi.adjust(timer.definitionId, input); setTimers(await timersApi.listStates()); setTimerRefreshError(null); setAnnouncement(`${timer.snapshot.label} adjusted.`); }
    catch (error) { setCommandError(toOperatorError(error, "The timer adjustment failed.")); }
    finally { pendingRef.current = false; setPending(null); }
  }

  async function runTimerCommand(command: "pause" | "resume" | "stop" | "restart", timer: TimerRunState, focusTarget: HTMLButtonElement) {
    if (pendingRef.current) return;
    pendingRef.current = true; restoreFocusRef.current = focusTarget; setPending(`timer:${timer.definitionId}:${command}`); setCommandError(null); setAnnouncement("");
    requestRevisionRef.current += 1;
    try {
      await timersApi.command(timer.definitionId, command); const next = await timersApi.listStates(); setTimers(next); setTimerRefreshError(null);
      setAnnouncement(`${timer.snapshot.label} ${command === "pause" ? "paused" : command === "resume" ? "resumed" : command === "stop" ? "stopped" : "restarted"}.`);
    } catch (error) { setCommandError(toOperatorError(error, "The timer command failed.")); }
    finally { pendingRef.current = false; setPending(null); schedulePollRef.current?.(normalPollDelayMs); }
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
            <Button variant="default" onClick={retry}>Retry loading playback state</Button>
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
        <StatusBadge label={(snapshot.moduleMutes?.alerts ?? snapshot.muted) ? "Alerts muted" : "Alerts audio on"} tone={(snapshot.moduleMutes?.alerts ?? snapshot.muted) ? "warning" : "positive"} />
        <StatusBadge label={(snapshot.moduleMutes?.["screen-effects"] ?? snapshot.muted) ? "Effects muted" : "Effects audio on"} tone={(snapshot.moduleMutes?.["screen-effects"] ?? snapshot.muted) ? "warning" : "positive"} />
        <StatusBadge label={snapshot.doNotDisturb ? "Do-not-disturb on" : "Do-not-disturb off"} tone={snapshot.doNotDisturb ? "warning" : "positive"} />
      </section>

      <section aria-label="Global playback controls" className="operator-controls">
        <Button disabled={disabled} onClick={(event) => void runCommand(
          snapshot.paused ? "resume" : "pause",
          snapshot.paused ? api.resume : api.pause,
          snapshot.paused ? "All queues resumed. Module pauses remain in place." : "All queues paused. Current playback continues.",
          event.currentTarget
        )}>{snapshot.paused ? "Resume all queues" : "Pause all queues"}</Button>
        <Button variant="default" disabled={disabled} onClick={(event) => void runCommand(
          snapshot.muted ? "unmute" : "mute",
          snapshot.muted ? api.unmute : api.mute,
          snapshot.muted ? "Alerts and Effects audio unmuted." : "Alerts and Effects audio muted.",
          event.currentTarget
        )}>{snapshot.muted ? "Unmute Alerts and Effects" : "Mute Alerts and Effects"}</Button>
        <Button aria-pressed={snapshot.doNotDisturb} variant="default" disabled={disabled} onClick={(event) => void runCommand(
          "dnd",
          () => api.setDoNotDisturb(!snapshot.doNotDisturb),
          snapshot.doNotDisturb ? "Do-not-disturb disabled." : "Do-not-disturb enabled.",
          event.currentTarget
        )}>{snapshot.doNotDisturb ? "Disable do-not-disturb" : "Enable do-not-disturb"}</Button>
      </section>

      {snapshot.paused ? <p className="operator-boundary-note">Current playback continues; pending items wait in their owning module queues.</p> : null}
      {snapshot.muted ? <p className="operator-boundary-note">Alerts and Effects audio are muted on browser and device outputs. Visuals and timer cues continue.</p> : null}
      {announcement === "" ? null : <p aria-live="polite" className="operator-announcement" role="status">{announcement}</p>}
      {commandError !== null ? <OperatorErrorBanner error={commandError} title="Playback command failed" /> : refreshError === null ? null : <OperatorErrorBanner error={refreshError} title="Playback state may be stale" />}

      <section className="operator-section" aria-labelledby="operator-active-timers">
        <h2 id="operator-active-timers">Active timers ({timers.length})</h2>
        {timerRefreshError === null ? null : <OperatorErrorBanner error={timerRefreshError} title="Timer state may be stale"><p>Showing the last known timers. Check the local service; timer refresh will retry automatically.</p></OperatorErrorBanner>}
        {timers.length === 0 ? <p className="management-empty">No timers are active.</p> : <ol className="operator-list operator-timer-list">
          {timers.map(timer => <li key={`${timer.definitionId}:${timer.generation}`}><OperatorTimerCard onAdjust={input => adjustTimer(timer, input)} disabled={disabled} onCommand={(command, button) => void runTimerCommand(command, timer, button)} timer={timer} /></li>)}
        </ol>}
      </section>

      <section className="operator-section" aria-labelledby="operator-now-playing">
        <h2 id="operator-now-playing" ref={nowPlayingHeadingRef} tabIndex={-1}>Now playing ({snapshot.current.length})</h2>
        {snapshot.current.length === 0 ? <p className="management-empty">No playback is active.</p> : (
          <ol className="operator-list">
            {snapshot.current.map((item) => <li key={operationKey(item)}><OperationCard item={item} action={(
              <Button aria-label={`Skip ${item.name} in ${moduleLabel(item.moduleId)}`} color="red" variant="light" size="xs" disabled={disabled} onClick={(event) => void runCommand(
                `skip:${operationKey(item)}`,
                () => api.skip(item.moduleId, item.occurrenceId),
                `${item.name} skipped in ${moduleLabel(item.moduleId)}.`,
                event.currentTarget
              )}>Skip</Button>
            )} /></li>)}
          </ol>
        )}
      </section>

      <section aria-label="Module queue controls" className="operator-section operator-module-queues">
        <h2>Module queues</h2>
        <div className="operator-list operator-module-list">
          {snapshot.owners.map((owner) => {
            const count = snapshot.queued.filter((item) => item.moduleId === owner.moduleId).length;
            return (
              <article className="operator-item operator-module-item" key={owner.moduleId}>
                <div className="operator-item__summary">
                  <div><h3 className="operator-module-heading" ref={(element) => {
                    if (element === null) moduleHeadingRefs.current.delete(owner.moduleId);
                    else moduleHeadingRefs.current.set(owner.moduleId, element);
                  }} tabIndex={-1}>{moduleLabel(owner.moduleId)}</h3><span>{count} pending</span></div>
                  <StatusBadge label={owner.paused ? "Module paused" : "Module active"} tone={owner.paused ? "warning" : "positive"} />
                  <div className="operator-controls">
                    <OperatorActionButton label={owner.paused ? "Resume module" : "Pause module"} disabled={disabled} onClick={(button) => void runCommand(
                      `module:${owner.moduleId}:pause`,
                      () => api.setModulePaused(owner.moduleId, !owner.paused),
                      `${moduleLabel(owner.moduleId)} ${owner.paused ? "resumed" : "paused"}.`,
                      button
                    )} />
                    <OperatorActionButton label="Clear pending" disabled={disabled || count === 0} onClick={() => {
                      clearFallbackFocusRef.current = moduleHeadingRefs.current.get(owner.moduleId) ?? nowPlayingHeadingRef.current;
                      setClearRequest({ moduleId: owner.moduleId, count });
                    }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ManagementModalSurface labelledBy="operator-clear-title" onCancel={() => setClearRequest(null)} open={clearRequest !== null} pending={disabled} restoreFocusFallbackRef={clearFallbackFocusRef}>
        {clearRequest === null ? null : <>
          <ManagementModalTitle>Clear {clearRequest.count} pending {moduleLabel(clearRequest.moduleId)} item{clearRequest.count === 1 ? "" : "s"}?</ManagementModalTitle>
          <p>Current playback and the other module queue will not be changed.</p>
          <div className="management-modal__actions">
            <Button variant="default" disabled={disabled} onClick={() => setClearRequest(null)}>Cancel</Button>
            <Button color="red" disabled={disabled} onClick={(event) => void runCommand(
              `module:${clearRequest.moduleId}:clear`,
              () => api.clear(clearRequest.moduleId, clearRequest.count, snapshot.revision),
              `${moduleLabel(clearRequest.moduleId)} pending queue cleared.`,
              event.currentTarget
            )}>Clear pending</Button>
          </div>
        </>}
      </ManagementModalSurface>

      <OperationList heading={`Pending (${snapshot.queued.length})`} items={snapshot.queued} renderAction={(item) => (
        <Button aria-label={`Remove ${item.name} from ${moduleLabel(item.moduleId)}`} variant="default" size="xs" disabled={disabled} onClick={(event) => void runCommand(
          `remove:${operationKey(item)}`,
          () => api.remove(item.moduleId, item.occurrenceId),
          `${item.name} removed from ${moduleLabel(item.moduleId)}.`,
          event.currentTarget
        )}>Remove</Button>
      )} />
      <OperationList heading={`Recent (${snapshot.recent.length})`} items={snapshot.recent} renderAction={(item) => (
        <Button aria-label={`Replay ${item.name} in ${moduleLabel(item.moduleId)}`} variant="default" size="xs" disabled={disabled} onClick={(event) => void runCommand(
          `replay:${operationKey(item)}`,
          () => api.replay(item.moduleId, item.occurrenceId),
          `${item.name} added to the ${moduleLabel(item.moduleId)} queue.`,
          event.currentTarget
        )}>Replay</Button>
      )} />

      <Suspense fallback={<p role="status">Loading the video queue…</p>}><OperatorVideosPanel api={videosApi} /></Suspense>
    </main>
  );
}

function OperatorTimerCard({ disabled, onCommand, onAdjust, timer }: { readonly disabled: boolean; readonly timer: TimerRunState;
  readonly onAdjust: (input: import("@stream-jams/core").TimerAdjustment) => Promise<void>; readonly onCommand: (command: "pause" | "resume" | "stop" | "restart", button: HTMLButtonElement) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (timer.status !== "running") return; const handle = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(handle); }, [timer.status]);
  const remaining = timer.status === "running" ? Math.max(0, timer.endsAtEpochMs - now) : timer.status === "paused" ? timer.remainingMs : 0;
  return <article className="operator-item operator-timer-item"><div className="operator-item__summary"><div><strong>{timer.snapshot.label}</strong><span>{formatTimerRemaining(remaining)} · {timer.status}</span></div><div className="operator-controls">
    {timer.status === "running" ? <OperatorActionButton label="Pause" disabled={disabled} onClick={button => onCommand("pause", button)} /> : timer.status === "paused" ? <OperatorActionButton label="Resume" disabled={disabled} onClick={button => onCommand("resume", button)} /> : null}
    <OperatorActionButton label="Restart" disabled={disabled} onClick={button => onCommand("restart", button)} />
    <OperatorActionButton label="Stop" disabled={disabled} onClick={button => onCommand("stop", button)} />
  </div></div><details className="operator-timer-adjustment"><summary>Adjust time</summary><TimerAdjustmentControls disabled={disabled} onApply={onAdjust} /></details></article>;
}

function OperatorActionButton({ label, disabled, onClick }: { readonly label: "Pause" | "Resume" | "Restart" | "Stop" | "Pause module" | "Resume module" | "Clear pending"; readonly disabled: boolean; readonly onClick: (button: HTMLButtonElement) => void }) {
  const paths = { Pause: "M8 5v14M16 5v14", Resume: "m8 5 11 7-11 7Z", Restart: "M4 10a8 8 0 1 1 1 8M4 4v6h6", Stop: "M6 6h12v12H6Z", "Pause module": "M8 5v14M16 5v14", "Resume module": "m8 5 11 7-11 7Z", "Clear pending": "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" };
  return <ActionIcon aria-label={label} title={label} className="operator-icon-action" {...(label === "Clear pending" ? { color: "red", variant: "light" } : { variant: "default" })} disabled={disabled} onClick={event => onClick(event.currentTarget)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[label]} /></svg></ActionIcon>;
}

function OperatorHeader() {
  return <header className="operator-header"><div><p className="management-eyebrow">Stream Jams</p><h1>Operator Console</h1></div><Button component="a" variant="default" className="surface-switch-link" href="/manage">Back to management</Button></header>;
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
      <div className="operator-item__summary"><div><strong>{item.name}</strong><span>{item.source === null ? item.summary : `${item.summary} · via ${sourceLabel(item.source)}`}</span></div>{action}</div>
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

function sourceLabel(source: NonNullable<OperationRow["source"]>): string {
  return source === "twitch" ? "Twitch" : "Streamer.bot";
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
