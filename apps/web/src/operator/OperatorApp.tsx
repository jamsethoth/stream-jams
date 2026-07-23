import type { PlaybackQueueItem, PlaybackQueueSnapshot } from "@stream-jams/core";
import { useEffect, useRef, useState } from "react";
import "../App.css";
import { formatDateTime } from "../management/foundation/formatters.js";
import { StatusBadge, type StatusBadgeTone } from "../management/foundation/StatusBadge.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import { createHttpPlaybackApi, type PlaybackApi } from "./playback-api.js";

const normalPollDelayMs = 2_000;
const maximumPollDelayMs = 15_000;
const defaultPlaybackApi = createHttpPlaybackApi();

type Command = "pause" | "resume" | "mute" | "unmute" | "dnd" | "skip" | "replay";

interface OperatorError {
  readonly message: string;
  readonly referenceId: string | null;
}

export interface OperatorAppProps {
  readonly api?: PlaybackApi;
}

export function OperatorApp({ api = defaultPlaybackApi }: OperatorAppProps) {
  const [snapshot, setSnapshot] = useState<PlaybackQueueSnapshot | null>(null);
  const [initialError, setInitialError] = useState<OperatorError | null>(null);
  const [refreshError, setRefreshError] = useState<OperatorError | null>(null);
  const [commandError, setCommandError] = useState<OperatorError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<Command | null>(null);
  const snapshotRef = useRef<PlaybackQueueSnapshot | null>(null);
  const pendingRef = useRef(false);
  const revisionRef = useRef(0);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const nowPlayingHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const schedulePollRef = useRef<((delay: number) => void) | null>(null);

  function applySnapshot(next: PlaybackQueueSnapshot): void {
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

      const revision = revisionRef.current;
      try {
        const next = await api.getSnapshot();
        if (disposed || revision !== revisionRef.current) return;
        applySnapshot(next);
        setInitialError(null);
        setRefreshError(null);
        delay = normalPollDelayMs;
        failureCount = 0;
      } catch (error) {
        if (disposed || revision !== revisionRef.current) return;
        const safeError = toOperatorError(error, "Unable to load playback state.");
        if (snapshotRef.current === null) setInitialError(safeError);
        else setRefreshError(safeError);
        delay = Math.min(normalPollDelayMs * 2 ** failureCount, maximumPollDelayMs);
        failureCount += 1;
      } finally {
        if (revision === revisionRef.current) schedule(delay);
      }
    }

    function handleVisibilityChange(): void {
      if (document.hidden) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        return;
      }
      revisionRef.current += 1;
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
    command: Command,
    request: () => Promise<PlaybackQueueSnapshot>,
    message: string,
    focusTarget: HTMLButtonElement
  ): Promise<void> {
    if (pendingRef.current) return;
    pendingRef.current = true;
    restoreFocusRef.current = focusTarget;
    revisionRef.current += 1;
    setPending(command);
    setCommandError(null);
    setAnnouncement("");
    try {
      const next = await request();
      revisionRef.current += 1;
      applySnapshot(next);
      setRefreshError(null);
      setAnnouncement(message);
    } catch (error) {
      setCommandError(toOperatorError(error, "The playback command failed."));
    } finally {
      pendingRef.current = false;
      setPending(null);
      schedulePollRef.current?.(normalPollDelayMs);
    }
  }

  const retry = () => {
    revisionRef.current += 1;
    setInitialError(null);
    setRefreshError(null);
    void api.getSnapshot()
      .then((next) => {
        applySnapshot(next);
        setInitialError(null);
      })
      .catch((error: unknown) => setInitialError(toOperatorError(error, "Unable to load playback state.")));
  };

  if (snapshot === null) {
    return (
      <main className="operator-console">
        <OperatorHeader />
        {initialError === null ? (
          <p aria-live="polite" role="status">Loading playback state…</p>
        ) : (
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
        <StatusBadge label={snapshot.paused ? "Queue paused" : "Queue active"} tone={snapshot.paused ? "warning" : "positive"} />
        <StatusBadge label={snapshot.muted ? "Audio muted" : "Audio on"} tone={snapshot.muted ? "warning" : "positive"} />
        <StatusBadge label={snapshot.doNotDisturb ? "Do-not-disturb on" : "Do-not-disturb off"} tone={snapshot.doNotDisturb ? "warning" : "positive"} />
      </section>

      <section aria-label="Playback controls" className="operator-controls">
        <button
          className="button button--primary"
          disabled={disabled}
          onClick={(event) => void runCommand(
            snapshot.paused ? "resume" : "pause",
            snapshot.paused ? api.resume : api.pause,
            snapshot.paused ? "Queue resumed." : "Queue paused. Current alert continues.",
            event.currentTarget
          )}
          type="button"
        >{snapshot.paused ? "Resume queue" : "Pause queue"}</button>
        <button
          className="button button--secondary"
          disabled={disabled}
          onClick={(event) => void runCommand(
            snapshot.muted ? "unmute" : "mute",
            snapshot.muted ? api.unmute : api.mute,
            snapshot.muted ? "Alert audio unmuted." : "Alert audio muted.",
            event.currentTarget
          )}
          type="button"
        >{snapshot.muted ? "Unmute alert audio" : "Mute alert audio"}</button>
        <button
          aria-pressed={snapshot.doNotDisturb}
          className="button button--secondary"
          disabled={disabled}
          onClick={(event) => void runCommand(
            "dnd",
            () => api.setDoNotDisturb(!snapshot.doNotDisturb),
            snapshot.doNotDisturb ? "Do-not-disturb disabled." : "Do-not-disturb enabled.",
            event.currentTarget
          )}
          type="button"
        >{snapshot.doNotDisturb ? "Disable do-not-disturb" : "Enable do-not-disturb"}</button>
      </section>

      {snapshot.paused ? <p className="operator-boundary-note">Current alert continues; queued alerts wait.</p> : null}
      {snapshot.muted ? <p className="operator-boundary-note">New alert audio and TTS triggers are muted. Speech already handed to an external provider may continue.</p> : null}
      {announcement === "" ? null : <p aria-live="polite" className="operator-announcement" role="status">{announcement}</p>}
      {commandError !== null
        ? <OperatorErrorBanner error={commandError} title="Playback command failed" />
        : refreshError === null ? null : <OperatorErrorBanner error={refreshError} title="Playback state may be stale" />}

      <section className="operator-section" aria-labelledby="operator-now-playing">
        <div className="operator-section__heading">
          <h2 id="operator-now-playing" ref={nowPlayingHeadingRef} tabIndex={-1}>Now playing</h2>
          <button
            className="button button--danger-quiet"
            disabled={disabled || snapshot.current === null}
            onClick={(event) => void runCommand("skip", api.skip, "Current alert skipped.", event.currentTarget)}
            type="button"
          >Skip current alert</button>
        </div>
        {snapshot.current === null ? <p className="management-empty">No alert is playing.</p> : <PlaybackItemCard item={snapshot.current} />}
      </section>

      <PlaybackList heading={`Up next (${snapshot.queued.length})`} items={snapshot.queued} />
      <PlaybackList
        heading={`Recent (${snapshot.recent.length})`}
        items={snapshot.recent}
        renderAction={(item) => (
          <button
            aria-label={`Replay ${formatEventType(item.sourceEvent.type)} from ${item.sourceEvent.actor.displayName || "Anonymous viewer"}`}
            className="button button--secondary button--compact"
            disabled={disabled}
            onClick={(event) => void runCommand(
              "replay",
              () => api.replay(item.id),
              "Alert added to the replay queue.",
              event.currentTarget
            )}
            type="button"
          >Replay</button>
        )}
      />
    </main>
  );
}

function OperatorHeader() {
  return (
    <header className="operator-header">
      <div><p className="management-eyebrow">Stream Jams</p><h1>Operator Console</h1></div>
      <a className="button button--secondary surface-switch-link" href="/manage">Back to management</a>
    </header>
  );
}

function OperatorErrorBanner({ children, error, title }: {
  readonly children?: React.ReactNode;
  readonly error: OperatorError;
  readonly title: string;
}) {
  const diagnosticsRoute = error.referenceId === null
    ? "/manage/diagnostics"
    : `/manage/diagnostics?reference=${encodeURIComponent(error.referenceId)}`;
  return (
    <section className="management-error-banner management-error-banner--error operator-error" role="alert">
      <div><strong>{title}</strong><p>{error.message}</p>{children}</div>
      <a href={diagnosticsRoute}>Open diagnostics</a>
    </section>
  );
}

function PlaybackList({ heading, items, renderAction }: {
  readonly heading: string;
  readonly items: readonly PlaybackQueueItem[];
  readonly renderAction?: (item: PlaybackQueueItem) => React.ReactNode;
}) {
  return (
    <section className="operator-section">
      <h2>{heading}</h2>
      {items.length === 0 ? <p className="management-empty">Nothing here.</p> : (
        <ol className="operator-list">
          {items.map((item) => <li key={item.id}><PlaybackItemCard action={renderAction?.(item)} item={item} /></li>)}
        </ol>
      )}
    </section>
  );
}

function PlaybackItemCard({ action, item }: { readonly action?: React.ReactNode; readonly item: PlaybackQueueItem }) {
  return (
    <article className="operator-item">
      <div className="operator-item__summary">
        <div><strong>{formatEventType(item.sourceEvent.type)}</strong><span>{item.sourceEvent.actor.displayName || "Anonymous viewer"}</span></div>
        {action}
      </div>
      <dl>
        <ItemDetail label="Alerts" value={formatAlertCount(item.alerts.length)} />
        <ItemDetail label="Priority" value={new Intl.NumberFormat().format(item.priority)} />
        <ItemDetail label="Status" value={formatStatus(item.status)} tone={statusTone(item.status)} />
        <ItemDetail label="Received" value={formatDateTime(item.enqueuedAt)} />
      </dl>
    </article>
  );
}

function ItemDetail({ label, tone, value }: { readonly label: string; readonly tone?: StatusBadgeTone; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{tone === undefined ? value : <StatusBadge label={value} tone={tone} />}</dd></div>;
}

function formatEventType(value: string): string {
  return value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function formatStatus(value: PlaybackQueueItem["status"]): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatAlertCount(value: number): string {
  return `${new Intl.NumberFormat().format(value)} ${value === 1 ? "alert" : "alerts"}`;
}

function statusTone(value: PlaybackQueueItem["status"]): StatusBadgeTone {
  if (value === "playing") return "positive";
  if (value === "skipped") return "warning";
  return "neutral";
}

function toOperatorError(error: unknown, fallback: string): OperatorError {
  if (error instanceof ManagementHttpError) return { message: error.message, referenceId: error.referenceId };
  if (error instanceof Error && error.message.trim() !== "") return { message: error.message, referenceId: null };
  return { message: fallback, referenceId: null };
}
