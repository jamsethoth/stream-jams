import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { OverlayPurpose, VideoRecentItem, VideoRequestItem } from "@stream-jams/core";
import { videoChannelNameSchema, videoRequesterSchema, videoSourceSchema, videoTitleSchema } from "@stream-jams/core/videos";
import { runInTransaction } from "../db/database.js";

/** An active play-all run: the ids snapshotted when the operator chose Play all now. */
export interface VideoQueueRun {
  readonly mode: "next" | "all";
  readonly remainingIds: readonly string[];
}

export interface VideoQueueSnapshot {
  readonly purpose: OverlayPurpose;
  readonly revision: number;
  readonly queuePaused: boolean;
  readonly run: VideoQueueRun | null;
  /** Items still in the queue (queued, held, playing or paused), in play order. */
  readonly items: readonly VideoRequestItem[];
  /** The newest failed items, oldest first, for operator review. They are not part of the queue. */
  readonly recentlyFailed: readonly VideoRequestItem[];
  /** The newest played or failed items, newest first, for the Operator's Recent list and replay. Removed items are left out. */
  readonly recent: readonly VideoRecentItem[];
}

export interface VideoQueueChange {
  readonly upsert?: readonly VideoRequestItem[];
  readonly queuePaused?: boolean;
  readonly run?: VideoQueueRun | null;
}

export class VideoQueueConflictError extends Error {
  constructor() {
    super("The video queue changed since it was read.");
    this.name = "VideoQueueConflictError";
  }
}

export interface VideoQueueRepository {
  load(purpose: OverlayPurpose): VideoQueueSnapshot;
  /** Applies a change atomically if the revision still matches, returning the new snapshot. */
  commit(purpose: OverlayPurpose, expectedRevision: number, change: VideoQueueChange): VideoQueueSnapshot;
  /** Returns interrupted playing or paused items to the queue head. Called once at startup. */
  recoverInterruptedPlayback(nowIso: string): void;
  /** Deletes finished rows beyond the newest `keep` per purpose. */
  pruneFinished(keep: number): void;
}

const activeStatuses = ["queued", "held", "playing", "paused"] as const;
/** How many failed items a snapshot carries for review. */
export const videoRecentFailureLimit = 5;
/** How many finished items a snapshot carries for the Recent list. */
export const videoRecentLimit = 10;
const runSchema = z.object({ mode: z.enum(["next", "all"]), remainingIds: z.array(z.string().min(1).max(128)).max(1000) }).strict();

const rowSchema = z.object({
  id: z.string(),
  purpose: z.enum(["live", "test"]),
  source_json: z.string(),
  title: z.string().nullable(),
  provider_title: z.string().nullable(),
  channel_name: z.string().nullable(),
  requester: z.string().nullable(),
  submitted_via: z.enum(["management", "operator", "automation", "streamerbot", "channel-points"]),
  duration_ms: z.number().int().positive().nullable(),
  status: z.enum(["queued", "held", "playing", "paused", "played", "failed", "removed"]),
  // "unknown-length" rows come from older builds; the service queues them again at startup.
  hold_reason: z.enum(["over-limit", "unknown-length"]).nullable(),
  limit_overridden: z.number().int(),
  autoplay: z.number().int(),
  position: z.number().int(),
  created_at: z.string(),
  updated_at: z.string()
});

export class SqliteVideoQueueRepository implements VideoQueueRepository {
  constructor(private readonly connection: DatabaseSync, private readonly now: () => string = () => new Date().toISOString()) {}

  load(purpose: OverlayPurpose): VideoQueueSnapshot {
    const state = this.connection.prepare("SELECT revision, queue_paused, run_json FROM video_queue_state WHERE purpose = ?").get(purpose);
    if (state === undefined) throw new Error(`Video queue state for ${purpose} is missing.`);
    const rows = this.connection.prepare(
      `SELECT * FROM video_requests WHERE purpose = ? AND status IN (${activeStatuses.map(() => "?").join(", ")}) ORDER BY position, created_at, id`
    ).all(purpose, ...activeStatuses);
    const failedRows = this.connection.prepare(
      "SELECT * FROM video_requests WHERE purpose = ? AND status = 'failed' ORDER BY updated_at DESC, id DESC LIMIT ?"
    ).all(purpose, videoRecentFailureLimit);
    // updated_at is when the row last changed, which for a finished row is when it finished; rowid breaks ties.
    const recentRows = this.connection.prepare(
      "SELECT * FROM video_requests WHERE purpose = ? AND status IN ('played', 'failed') ORDER BY updated_at DESC, rowid DESC LIMIT ?"
    ).all(purpose, videoRecentLimit);
    return {
      purpose,
      revision: Number(state.revision),
      queuePaused: Number(state.queue_paused) === 1,
      run: state.run_json === null ? null : runSchema.parse(JSON.parse(String(state.run_json))),
      items: rows.map(row => toItem(rowSchema.parse(row))),
      recentlyFailed: failedRows.reverse().map(row => toItem(rowSchema.parse(row))),
      recent: recentRows.map(row => toRecentItem(rowSchema.parse(row)))
    };
  }

  commit(purpose: OverlayPurpose, expectedRevision: number, change: VideoQueueChange): VideoQueueSnapshot {
    return runInTransaction(this.connection, () => {
      const updated = this.connection.prepare("UPDATE video_queue_state SET revision = revision + 1 WHERE purpose = ? AND revision = ?").run(purpose, expectedRevision);
      if (Number(updated.changes) !== 1) throw new VideoQueueConflictError();
      if (change.queuePaused !== undefined) {
        this.connection.prepare("UPDATE video_queue_state SET queue_paused = ? WHERE purpose = ?").run(change.queuePaused ? 1 : 0, purpose);
      }
      if (change.run !== undefined) {
        this.connection.prepare("UPDATE video_queue_state SET run_json = ? WHERE purpose = ?")
          .run(change.run === null ? null : JSON.stringify(runSchema.parse(change.run)), purpose);
      }
      const upsert = this.connection.prepare(`
INSERT INTO video_requests (id, purpose, source_json, title, provider_title, channel_name, requester, submitted_via, duration_ms, status, hold_reason, limit_overridden, autoplay, position, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  duration_ms = excluded.duration_ms, status = excluded.status, hold_reason = excluded.hold_reason,
  limit_overridden = excluded.limit_overridden, autoplay = excluded.autoplay, position = excluded.position,
  title = excluded.title, provider_title = excluded.provider_title, channel_name = excluded.channel_name, updated_at = excluded.updated_at
WHERE video_requests.purpose = excluded.purpose`);
      for (const item of change.upsert ?? []) {
        if (item.purpose !== purpose) throw new Error("Video request purpose does not match the queue.");
        upsert.run(
          item.id, item.purpose, JSON.stringify(videoSourceSchema.parse(item.source)),
          item.title === null ? null : videoTitleSchema.parse(item.title),
          item.providerTitle === null ? null : videoTitleSchema.parse(item.providerTitle),
          item.channelName === null ? null : videoChannelNameSchema.parse(item.channelName),
          item.requester === null ? null : videoRequesterSchema.parse(item.requester),
          item.submittedVia, item.durationMs, item.status, item.holdReason,
          item.limitOverridden ? 1 : 0, item.autoplay ? 1 : 0, item.position, item.createdAt, this.now()
        );
      }
      return this.load(purpose);
    });
  }

  recoverInterruptedPlayback(nowIso: string): void {
    runInTransaction(this.connection, () => {
      for (const purpose of ["live", "test"] as const) {
        const interrupted = this.connection.prepare("SELECT id FROM video_requests WHERE purpose = ? AND status IN ('playing', 'paused') ORDER BY position").all(purpose);
        if (interrupted.length === 0) continue;
        const head = this.connection.prepare("SELECT MIN(position) AS head FROM video_requests WHERE purpose = ? AND status IN ('queued', 'held')").get(purpose);
        let position = Number(head?.head ?? 0) - interrupted.length;
        for (const row of interrupted) {
          this.connection.prepare("UPDATE video_requests SET status = 'queued', position = ?, autoplay = 0, updated_at = ? WHERE id = ?").run(position, nowIso, String(row.id));
          position += 1;
        }
        this.connection.prepare("UPDATE video_queue_state SET revision = revision + 1, run_json = NULL WHERE purpose = ?").run(purpose);
      }
    });
  }

  pruneFinished(keep: number): void {
    const prune = this.connection.prepare(`
DELETE FROM video_requests WHERE purpose = ? AND status IN ('played', 'failed', 'removed') AND id NOT IN (
  SELECT id FROM video_requests WHERE purpose = ? AND status IN ('played', 'failed', 'removed') ORDER BY updated_at DESC, rowid DESC LIMIT ?
)`);
    runInTransaction(this.connection, () => { for (const purpose of ["live", "test"] as const) prune.run(purpose, purpose, keep); });
  }
}

function toRecentItem(row: z.infer<typeof rowSchema>): VideoRecentItem {
  const item = toItem(row);
  if (item.status !== "played" && item.status !== "failed") throw new Error("A recent video must be played or failed.");
  return { ...item, status: item.status, finishedAt: row.updated_at };
}

function toItem(row: z.infer<typeof rowSchema>): VideoRequestItem {
  return {
    id: row.id,
    purpose: row.purpose,
    source: videoSourceSchema.parse(JSON.parse(row.source_json)),
    title: row.title,
    providerTitle: row.provider_title,
    channelName: row.channel_name,
    requester: row.requester,
    submittedVia: row.submitted_via,
    durationMs: row.duration_ms,
    status: row.status,
    holdReason: row.hold_reason,
    limitOverridden: row.limit_overridden === 1,
    autoplay: row.autoplay === 1,
    position: row.position,
    createdAt: row.created_at
  };
}
