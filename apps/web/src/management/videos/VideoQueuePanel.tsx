import { Button, TextInput } from "@mantine/core";
import type { OverlayPurpose, VideoQueueResponse } from "@stream-jams/core";
import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type FormEvent, type ReactNode, type RefObject } from "react";
import { ManagementModalSurface, ManagementModalTitle } from "../foundation/ManagementModalSurface.js";
import { StatusBadge, type StatusBadgeTone } from "../foundation/StatusBadge.js";
import { ManagementHttpError } from "../management-http-client.js";
import type { OperatorItemCardProps } from "../../operator/OperatorItemCard.js";
import { formatDateTime } from "../foundation/formatters.js";
import { isVideoQueueConflict, type VideoCurrentAction, type VideoQueueApi, type VideoQueueCommand, type VideoQueueItem, type VideoRecentItem } from "./videos-api.js";
import "./video-queue.css";

const defaultPollIntervalMs = 1_500;
const maximumPollDelayMs = 15_000;

export interface VideoQueuePanelProps {
  readonly api: VideoQueueApi;
  readonly initialPurpose?: OverlayPurpose;
  readonly pollIntervalMs?: number;
  /** Heading level of the panel title; nested headings follow it. */
  readonly headingLevel?: 2 | 3;
  /**
   * Operator Console: list finished videos under Recent, with Replay, in place of the failed-only list, drawn with the
   * Operator's own list card. The Operator passes its card in so the card stays in the Operator chunk.
   */
  readonly recentCard?: ComponentType<OperatorItemCardProps> | undefined;
}

interface QueueSnapshot {
  readonly queue: VideoQueueResponse;
  /** Server clock minus local clock when the snapshot arrived. */
  readonly clockOffsetMs: number;
}

/** Shared management and Operator queue tools. The server owns queue state; this component polls and sends guarded commands. */
export function VideoQueuePanel({ api, initialPurpose = "live", pollIntervalMs = defaultPollIntervalMs, headingLevel = 2, recentCard }: VideoQueuePanelProps) {
  const headingId = useId();
  const [purpose, setPurpose] = useState<OverlayPurpose>(initialPurpose);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const HeadingTag = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={headingId} className="video-queue">
      <div className="video-queue__heading">
        <HeadingTag id={headingId} ref={headingRef} tabIndex={-1}>Video queue</HeadingTag>
        <div aria-label="Queue purpose" className="video-queue__purpose" role="group">
          {(["live", "test"] as const).map(value => <Button key={value} size="xs" variant={purpose === value ? "filled" : "default"} aria-pressed={purpose === value}
            onClick={() => setPurpose(value)}>{value === "live" ? "Live queue" : "Test queue"}</Button>)}
        </div>
      </div>
      {/* Each purpose owns its own snapshot, poll and pending command; switching remounts instead of mixing them. */}
      <QueueWorkspace key={purpose} api={api} headingLevel={headingLevel} headingRef={headingRef} pollIntervalMs={pollIntervalMs} purpose={purpose} recentCard={recentCard} />
    </section>
  );
}

function QueueWorkspace({ api, headingLevel, headingRef, pollIntervalMs, purpose, recentCard }: {
  readonly api: VideoQueueApi; readonly headingLevel: 2 | 3; readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly pollIntervalMs: number; readonly purpose: OverlayPurpose; readonly recentCard: ComponentType<OperatorItemCardProps> | undefined;
}) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [loadError, setLoadError] = useState<QueueError | null>(null);
  const [refreshError, setRefreshError] = useState<QueueError | null>(null);
  const [commandError, setCommandError] = useState<QueueError | null>(null);
  const [clearError, setClearError] = useState<QueueError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const clearTitleId = useId();
  const pendingRef = useRef(false);
  const snapshotRef = useRef<QueueSnapshot | null>(null);
  const requestRevisionRef = useRef(0);
  const schedulePollRef = useRef<((delay: number) => void) | null>(null);

  const apply = useCallback((queue: VideoQueueResponse) => {
    const next = { queue, clockOffsetMs: queue.serverTimeEpochMs - Date.now() };
    snapshotRef.current = next;
    setSnapshot(next);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = pollIntervalMs;
    let failures = 0;

    function schedule(nextDelay: number): void {
      if (disposed) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void poll(), nextDelay);
    }
    schedulePollRef.current = schedule;

    async function poll(): Promise<void> {
      if (disposed) return;
      if (document.hidden || pendingRef.current) { schedule(delay); return; }
      const revision = requestRevisionRef.current;
      try {
        const queue = await api.getQueue(purpose);
        if (disposed || revision !== requestRevisionRef.current) return;
        apply(queue);
        setLoadError(null); setRefreshError(null);
        delay = pollIntervalMs; failures = 0;
      } catch (error) {
        if (disposed || revision !== requestRevisionRef.current) return;
        const safe = queueError(error, "The video queue could not be loaded", "Check that Stream Jams is running. Refresh retries automatically.");
        if (snapshotRef.current === null) setLoadError(safe); else setRefreshError(safe);
        delay = Math.min(pollIntervalMs * 2 ** failures, maximumPollDelayMs); failures += 1;
      } finally {
        if (!disposed && revision === requestRevisionRef.current) schedule(delay);
      }
    }

    function handleVisibilityChange(): void {
      if (document.hidden) return;
      requestRevisionRef.current += 1;
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
  }, [api, apply, pollIntervalMs, purpose]);

  const phase = snapshot?.queue.current?.phase ?? null;
  useEffect(() => {
    if (phase !== "playing") return;
    const handle = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(handle);
  }, [phase]);

  async function run(key: string, request: (queue: VideoQueueResponse) => Promise<VideoQueueResponse>, message: string,
    reportError: (error: QueueError) => void = setCommandError): Promise<boolean> {
    const current = snapshotRef.current;
    if (pendingRef.current || current === null) return false;
    pendingRef.current = true;
    requestRevisionRef.current += 1;
    setPending(key); setCommandError(null); setConflict(false); setAnnouncement("");
    try {
      apply(await request(current.queue));
      setRefreshError(null);
      setAnnouncement(message);
      return true;
    } catch (error) {
      if (isVideoQueueConflict(error)) {
        setConflict(true);
        try { apply(await api.getQueue(purpose)); }
        catch (refreshFailure) { setRefreshError(queueError(refreshFailure, "The video queue could not be refreshed", "Refresh retries automatically.")); }
      } else {
        reportError(queueError(error, "The video command failed", "Review the queue and retry. Open Diagnostics if it keeps failing."));
      }
      return false;
    } finally {
      pendingRef.current = false;
      setPending(null);
      schedulePollRef.current?.(pollIntervalMs);
    }
  }

  const command = (key: string, value: VideoQueueCommand, message: string, reportError?: (error: QueueError) => void) =>
    run(key, queue => api.command(purpose, queue.revision, value), message, reportError);
  const control = (action: VideoCurrentAction, itemId: string, message: string, positionMs?: number) =>
    run(`current:${action}`, () => api.control(purpose, action, itemId, positionMs), message);

  async function confirmClear(): Promise<void> {
    setClearError(null);
    let failed = false;
    await command("clear", { kind: "clear" }, "Waiting videos cleared.", error => { failed = true; setClearError(error); });
    // A failure stays in the review for retry; success or a conflict refresh closes it so the operator sees the current queue.
    if (!failed) setClearOpen(false);
  }

  const SubheadingTag = headingLevel === 2 ? "h3" : "h4";
  const queue = snapshot?.queue ?? null;
  const busy = pending !== null;
  const waiting = queue === null ? [] : queue.items.filter(item => item.status === "queued" || item.status === "held").sort((a, b) => a.position - b.position);
  const failed = queue === null ? [] : queue.items.filter(item => item.status === "failed").slice(-5);
  const playable = waiting.filter(item => item.status === "queued").length;
  const currentItem = queue?.current === null || queue === null ? null : queue.items.find(item => item.id === queue.current?.itemId) ?? null;

  function move(index: number, offset: -1 | 1, item: VideoQueueItem) {
    const order = waiting.map(entry => entry.id);
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    void command(`reorder:${item.id}`, { kind: "reorder", itemIds: order }, `${itemName(item)} moved ${offset < 0 ? "up" : "down"}.`);
  }

  return (
    <>
      {loadError === null ? null : <QueueErrorBanner error={loadError} />}
      {refreshError === null ? null : <QueueErrorBanner error={refreshError} />}
      {commandError === null ? null : <QueueErrorBanner error={commandError} />}
      {conflict ? <p className="video-queue__notice" role="status">The queue changed; try again.</p> : null}
      {announcement === "" ? null : <p className="video-queue__notice" aria-live="polite" role="status">{announcement}</p>}
      {queue === null ? (loadError === null ? <p className="management-empty" role="status">Loading the video queue…</p> : null) : <>
        <NowPlaying key={queue.current?.itemId ?? "idle"} busy={busy} clockOffsetMs={snapshot?.clockOffsetMs ?? 0} control={control} headingTag={SubheadingTag} item={currentItem} now={now} queue={queue}
          onSkip={() => void command("skip", { kind: "skip" }, "Video skipped.")} onStop={() => void command("stop", { kind: "stop" }, "Playback stopped. The run has ended.")} />

        <div aria-label="Queue controls" className="video-queue__controls" role="group">
          <Button disabled={busy || playable === 0} onClick={() => void command("play-next", { kind: "play-next" }, "Playing the next video.")}>Play next</Button>
          <Button variant="default" disabled={busy || playable === 0} onClick={() => void command("play-all", { kind: "play-all" }, `Playing ${playable} queued video${playable === 1 ? "" : "s"} in order.`)}>Play all now</Button>
          <Button variant="default" disabled={busy} onClick={() => void command(queue.queuePaused ? "resume-queue" : "pause-queue", { kind: queue.queuePaused ? "resume-queue" : "pause-queue" },
            queue.queuePaused ? "Queue resumed." : "Queue paused. The current video finishes; nothing else starts.")}>{queue.queuePaused ? "Resume queue" : "Pause queue"}</Button>
          <Button color="red" variant="light" disabled={busy || waiting.length === 0} onClick={() => { setClearError(null); setClearOpen(true); }}>Clear queue</Button>
        </div>
        <p className="video-queue__summary">
          <StatusBadge label={queue.queuePaused ? "Queue paused" : "Queue accepting playback"} tone={queue.queuePaused ? "warning" : "positive"} />
          {queue.runRemaining > 0 ? <span>{queue.runRemaining} more in this run</span> : null}
          {queue.gapEndsAtEpochMs === null ? null : <span>Next video starts after the gap</span>}
        </p>

        <SubheadingTag>Waiting ({waiting.length})</SubheadingTag>
        {waiting.length === 0 ? <p className="management-empty">No videos are waiting. Add a link below or wait for requests.</p> : (
          <ol className="video-queue__list">
            {waiting.map((item, index) => <li key={item.id}><QueueItem item={item} actions={<>
              {item.status === "held" ? <Button size="xs" aria-label={`Play anyway: ${itemName(item)}`} disabled={busy}
                onClick={() => void command(`play-anyway:${item.id}`, { kind: "play-anyway", itemId: item.id }, `Playing ${itemName(item)} despite the hold.`)}>Play anyway</Button> : null}
              <Button size="xs" variant="default" aria-label={`Move up: ${itemName(item)}`} disabled={busy || index === 0} onClick={() => move(index, -1, item)}>Move up</Button>
              <Button size="xs" variant="default" aria-label={`Move down: ${itemName(item)}`} disabled={busy || index === waiting.length - 1} onClick={() => move(index, 1, item)}>Move down</Button>
              <Button size="xs" color="red" variant="subtle" aria-label={`Remove: ${itemName(item)}`} disabled={busy}
                onClick={() => void command(`remove:${item.id}`, { kind: "remove", itemId: item.id }, `${itemName(item)} removed.`)}>Remove</Button>
            </>} /></li>)}
          </ol>
        )}
        {recentCard !== undefined ? <RecentVideos busy={busy} card={recentCard} headingTag={SubheadingTag} items={queue.recent} onReplay={item => void run(`replay:${item.id}`, current => api.requeue(purpose, current.revision, item.id),
          `${itemName(item)} added to the ${purpose === "live" ? "live" : "test"} video queue.`)} /> : failed.length === 0 ? null : <>
          <SubheadingTag>Failed recently ({failed.length})</SubheadingTag>
          <p className="video-queue__hint">These videos did not load in time. Check the link, then add it again if needed.</p>
          <ol className="video-queue__list">{failed.map(item => <li key={item.id}><QueueItem item={item} actions={null} /></li>)}</ol>
        </>}
        <AddVideoForm api={api} busy={busy} purpose={purpose} onAdded={(message) => {
          setAnnouncement(message);
          requestRevisionRef.current += 1;
          void api.getQueue(purpose).then(apply).catch((error: unknown) => setRefreshError(queueError(error, "The video queue could not be refreshed", "Refresh retries automatically.")));
        }} />
      </>}
      {/* Operator and management share this modal surface; the review keeps a failure for explicit retry and locks dismissal while pending. */}
      <ManagementModalSurface labelledBy={clearTitleId} onCancel={() => setClearOpen(false)} open={clearOpen} pending={busy} restoreFocusFallbackRef={headingRef}>
        <ManagementModalTitle>{`Clear ${waiting.length} waiting video${waiting.length === 1 ? "" : "s"}?`}</ManagementModalTitle>
        <p>Every queued and held video in the {purpose === "live" ? "live" : "test"} queue is removed. The current video keeps playing. Removed requests cannot be restored.</p>
        {clearError === null || busy ? null : <QueueErrorBanner error={clearError} />}
        <div className="management-modal__actions">
          <Button variant="default" disabled={busy} onClick={() => setClearOpen(false)}>Cancel</Button>
          <Button color="red" disabled={busy} loading={pending === "clear"} onClick={() => void confirmClear()}>Clear queue</Button>
        </div>
      </ManagementModalSurface>
    </>
  );
}

function NowPlaying({ busy, clockOffsetMs, control, headingTag: Heading, item, now, onSkip, onStop, queue }: {
  readonly busy: boolean; readonly clockOffsetMs: number; readonly headingTag: "h3" | "h4"; readonly item: VideoQueueItem | null; readonly now: number; readonly queue: VideoQueueResponse;
  readonly control: (action: VideoCurrentAction, itemId: string, message: string, positionMs?: number) => Promise<boolean>;
  readonly onSkip: () => void; readonly onStop: () => void;
}) {
  const current = queue.current;
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  if (current === null) {
    return <article aria-label="Now playing" className="video-queue__now video-queue__now--idle"><Heading>Now playing</Heading>
      <p className="management-empty">{queue.gapEndsAtEpochMs === null ? "Nothing is playing." : "Waiting for the gap before the next video."}</p>
      {queue.gapEndsAtEpochMs === null ? null : <div className="video-queue__controls"><Button size="xs" color="red" variant="light" disabled={busy} onClick={onStop}>Stop run</Button></div>}
    </article>;
  }
  const name = item === null ? "Current video" : itemName(item);
  const duration = current.durationMs ?? item?.durationMs ?? null;
  const elapsed = current.phase === "playing" ? Math.max(0, now + clockOffsetMs - current.atEpochMs) : 0;
  const position = Math.max(0, duration === null ? current.positionMs + elapsed : Math.min(duration, current.positionMs + elapsed));
  const shown = seekDraft ?? position;
  const commitSeek = () => {
    if (seekDraft === null) return;
    const target = seekDraft;
    setSeekDraft(null);
    void control("seek", current.itemId, `Moved to ${formatDuration(target)}.`, target);
  };
  return (
    <article aria-label="Now playing" className="video-queue__now">
      <div className="video-queue__now-summary">
        <div>
          <Heading>Now playing</Heading>
          <strong className="video-queue__title">{item === null ? name : <ItemTitle item={item} />}</strong>
          <span>{[item?.channelName ?? null, item?.requester === null || item?.requester === undefined ? null : `Requested by ${item.requester}`, item === null ? null : providerLabel(item.source.provider)].filter(Boolean).join(" · ")}</span>
        </div>
        <StatusBadge label={current.phase === "loading" ? "Loading" : current.phase === "paused" ? "Paused" : "Playing"} tone={current.phase === "playing" ? "positive" : current.phase === "paused" ? "warning" : "info"} />
      </div>
      <p className="video-queue__progress" aria-label="Playback position"><bdi dir="ltr">{formatDuration(shown)} / {duration === null ? "length unknown" : formatDuration(duration)}</bdi></p>
      {current.controls.seek && duration !== null ? (
        <label className="video-queue__seek">
          <span>Seek</span>
          <input type="range" min={0} max={duration} step={1000} value={Math.round(shown)} disabled={busy || current.phase === "loading"}
            aria-valuetext={`${formatDuration(shown)} of ${formatDuration(duration)}`}
            onChange={event => setSeekDraft(event.currentTarget.valueAsNumber)}
            onPointerUp={commitSeek}
            onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) commitSeek(); }}
            onBlur={commitSeek} />
        </label>
      ) : null}
      {current.controls.pause ? null : <p className="video-queue__hint">This player cannot be paused or sought. Skip and Stop still work.</p>}
      <div className="video-queue__controls">
        {current.controls.pause ? (
          current.phase === "paused"
            ? <Button size="xs" disabled={busy} onClick={() => void control("resume", current.itemId, `${name} resumed.`)}>Resume video</Button>
            : <Button size="xs" variant="default" disabled={busy || current.phase === "loading"} onClick={() => void control("pause", current.itemId, `${name} paused.`)}>Pause video</Button>
        ) : null}
        <Button size="xs" variant="default" disabled={busy} onClick={onSkip}>Skip</Button>
        <Button size="xs" color="red" variant="light" disabled={busy} onClick={onStop}>Stop</Button>
      </div>
    </article>
  );
}

function QueueItem({ actions, item }: { readonly actions: ReactNode; readonly item: VideoQueueItem }) {
  // Channel and length sit under the title; who asked and how follows on its own line. Unknown details are left out.
  const byline = [item.channelName, item.durationMs === null ? "Length unknown" : formatDuration(item.durationMs)]
    .filter((value): value is string => value !== null);
  const details = [
    item.requester === null ? null : `Requested by ${item.requester}`,
    providerLabel(item.source.provider),
    `via ${channelLabel(item.submittedVia)}`
  ].filter((value): value is string => value !== null);
  return (
    <article aria-label={itemName(item)} className="video-queue__item">
      <div className="video-queue__item-summary">
        <strong className="video-queue__title"><ItemTitle item={item} /></strong>
        <span className="video-queue__byline">{byline.join(" · ")}</span>
        <span>{details.join(" · ")}</span>
        {item.status === "held" ? <span className="video-queue__hold">Over the length limit</span> : null}
      </div>
      <StatusBadge label={statusLabel(item.status)} tone={statusTone(item.status)} />
      {actions === null ? null : <div className="video-queue__item-actions">{actions}</div>}
    </article>
  );
}

/** Finished videos for this purpose, newest first, in the same card layout as the Operator's Alerts and Effects Recent list. */
function RecentVideos({ busy, card: Card, headingTag: Heading, items, onReplay }: {
  readonly busy: boolean; readonly card: ComponentType<OperatorItemCardProps>; readonly headingTag: "h3" | "h4"; readonly items: readonly VideoRecentItem[]; readonly onReplay: (item: VideoRecentItem) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  // Replay disables every command while it runs; return focus to the pressed button, or the heading if it is gone.
  useEffect(() => {
    const target = restoreFocusRef.current;
    if (busy || target === null) return;
    restoreFocusRef.current = null;
    if (target.isConnected && !target.disabled) target.focus(); else headingRef.current?.focus();
  }, [busy]);
  return (
    <section aria-label="Recent videos" className="video-queue__recent">
      <Heading ref={headingRef} tabIndex={-1}>Recent ({items.length})</Heading>
      {items.length === 0 ? <p className="management-empty">No videos have finished yet.</p> : (
        <ol className="operator-list">
          {items.map(item => <li key={item.id}><Card label={itemName(item)} title={<ItemTitle item={item} />}
            summary={[item.channelName, item.requester === null ? null : `Requested by ${item.requester}`, providerLabel(item.source.provider), linkHost(item.link), `via ${channelLabel(item.submittedVia)}`].filter(Boolean).join(" · ")}
            action={<Button aria-label={`Replay ${itemName(item)} in Videos`} variant="default" size="xs" disabled={busy} onClick={event => { restoreFocusRef.current = event.currentTarget; onReplay(item); }}>Replay</Button>}
            details={[
              { label: "Module", value: "Videos" },
              { label: "Status", value: item.status === "failed" ? "Failed" : "Played", tone: item.status === "failed" ? "negative" : "positive" },
              { label: "Finished", value: formatDateTime(item.finishedAt) }
            ]} /></li>)}
        </ol>
      )}
    </section>
  );
}

function linkHost(link: string): string | null {
  return URL.canParse(link) ? new URL(link).hostname : null;
}

function AddVideoForm({ api, busy, onAdded, purpose }: {
  readonly api: VideoQueueApi; readonly busy: boolean; readonly purpose: OverlayPurpose; readonly onAdded: (message: string) => void;
}) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (link.trim() === "") { setError("Paste a Twitch, YouTube or direct video link."); return; }
    submittingRef.current = true; setSubmitting(true); setError(null);
    try {
      const item = await api.submit(purpose, { link: link.trim(), title });
      setLink(""); setTitle("");
      onAdded(item.status === "held"
        ? "Video added and held: it is over the length limit."
        : item.status === "playing" ? "Video added and playing." : "Video added to the queue.");
    } catch (reason) {
      setError(requestMessage(reason));
    } finally { submittingRef.current = false; setSubmitting(false); }
  }
  return (
    <form aria-label="Add video" className="video-queue__add" onSubmit={event => void submit(event)} noValidate>
      <TextInput label="Video link" placeholder="https://www.youtube.com/watch?v=…" value={link} error={error ?? undefined} disabled={submitting}
        onChange={event => { setLink(event.currentTarget.value); setError(null); }} />
      <TextInput label="Title (optional)" maxLength={200} value={title} disabled={submitting} onChange={event => setTitle(event.currentTarget.value)} />
      <Button type="submit" variant="default" disabled={busy || submitting} loading={submitting}>Add video</Button>
    </form>
  );
}

/** The submitted title wins; otherwise the provider's title; otherwise the link. */
function itemName(item: VideoQueueItem): string {
  return item.title ?? item.providerTitle ?? item.link;
}

function ItemTitle({ item }: { readonly item: VideoQueueItem }) {
  const title = item.title ?? item.providerTitle;
  // Provider titles and links can be in any script; isolate them so they never reorder the line around them.
  return title === null ? <bdi dir="ltr">{item.link}</bdi> : <bdi>{title}</bdi>;
}

function providerLabel(provider: string): string {
  return provider === "youtube" ? "YouTube" : provider === "twitch-clip" ? "Twitch clip" : provider === "twitch-vod" ? "Twitch video" : "Direct file";
}

function channelLabel(channel: VideoQueueItem["submittedVia"]): string {
  switch (channel) {
    case "management": return "management";
    case "operator": return "Operator";
    case "automation": return "automation";
    case "streamerbot": return "Streamer.bot";
    case "channel-points": return "channel points";
  }
}

function statusLabel(status: VideoQueueItem["status"]): string {
  return status === "held" ? "Held" : status === "failed" ? "Failed" : status === "queued" ? "Queued" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function statusTone(status: VideoQueueItem["status"]): StatusBadgeTone {
  return status === "held" ? "warning" : status === "failed" ? "negative" : status === "playing" ? "positive" : "neutral";
}

export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function requestMessage(error: unknown): string {
  if (error instanceof ManagementHttpError) return error.message.replace(/ \(VIDEO_[A-Z_]+(?:, [^)]*)?\)$/u, "");
  return error instanceof Error && error.message.trim() !== "" ? error.message : "The video could not be added. Retry.";
}

interface QueueError {
  readonly summary: string;
  readonly message: string;
  readonly nextStep: string;
  readonly referenceId: string | null;
}

/** Queue failures are expected and recoverable, so they are shown without console logging; server references link to Diagnostics. */
function queueError(error: unknown, summary: string, nextStep: string): QueueError {
  const http = error instanceof ManagementHttpError ? error : null;
  return {
    summary,
    message: error instanceof Error && error.message.trim() !== "" ? error.message : "The request failed for an unknown reason.",
    nextStep: http?.nextStep ?? nextStep,
    referenceId: http?.referenceId ?? null
  };
}

function QueueErrorBanner({ error }: { readonly error: QueueError }) {
  return (
    <section className="management-error-banner management-error-banner--error" role="alert">
      <div>
        <strong>{error.summary}</strong>
        <p>{error.message}</p>
        <p>Next step: {error.nextStep}</p>
      </div>
      {error.referenceId === null ? null : <div className="management-error-banner__meta"><code>{error.referenceId}</code>
        <a href={`/manage/diagnostics?reference=${encodeURIComponent(error.referenceId)}`}>Open diagnostics</a></div>}
    </section>
  );
}
