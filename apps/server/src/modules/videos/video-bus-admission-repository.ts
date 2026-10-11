import type { DatabaseSync } from "node:sqlite";
import type { VideoRequestItem } from "@stream-jams/core";
import { videoBusIdentitySchema, videoRequestAdmissionResultSchema } from "@stream-jams/core/videos";
import type { VideoRequestResult } from "./video-request-intake.js";

export interface VideoBusIdentity { readonly busId: string; readonly eventId: string }
export interface VideoBusAdmissionReceipt extends VideoBusIdentity { readonly result: VideoRequestResult }
export interface VideoBusAdmissionRepository {
  find(busId: string): VideoBusAdmissionReceipt | null;
  record(identity: VideoBusIdentity, result: VideoRequestResult): void;
  prune(): void;
}

/** Keep receipts as long as their journal identity or active item can be redelivered. */
export class SqliteVideoBusAdmissionRepository implements VideoBusAdmissionRepository {
  constructor(private readonly connection: DatabaseSync, private readonly now: () => number = Date.now) {}

  find(busId: string): VideoBusAdmissionReceipt | null {
    const row = this.connection.prepare("SELECT event_id, result_json FROM video_bus_admissions WHERE bus_id = ?").get(busId);
    if (row === undefined) return null;
    const stored = String(row.result_json);
    if (Buffer.byteLength(stored, "utf8") > 16_384) throw new Error("Video admission receipt exceeds its storage bound.");
    return { ...videoBusIdentitySchema.parse({ busId, eventId: row.event_id }), result: videoRequestAdmissionResultSchema.parse(JSON.parse(stored)) };
  }

  record(identity: VideoBusIdentity, result: VideoRequestResult): void {
    videoBusIdentitySchema.parse({ busId: identity.busId, eventId: identity.eventId });
    this.connection.prepare("INSERT INTO video_bus_admissions (bus_id, event_id, item_id, result_json, admitted_at_ms) VALUES (?, ?, ?, ?, ?)")
      .run(identity.busId, identity.eventId, result.status === "accepted" ? result.item.id : null, JSON.stringify(videoRequestAdmissionResultSchema.parse(result)), this.now());
  }

  /** The journal itself owns bounded retention/replay expiry. Orphan terminal receipts need no grace/retry window. */
  prune(): void {
    this.connection.prepare(`DELETE FROM video_bus_admissions WHERE bus_id IN (
      SELECT a.bus_id FROM video_bus_admissions a
      WHERE NOT EXISTS (SELECT 1 FROM event_bus_journal j WHERE j.bus_id = a.bus_id)
        AND NOT EXISTS (SELECT 1 FROM video_requests v WHERE v.id = a.item_id AND v.status IN ('queued', 'held', 'playing', 'paused'))
      ORDER BY a.admitted_at_ms, a.bus_id LIMIT 250)`).run();
  }
}

export function acceptedVideoReceipt(identity: VideoBusIdentity, item: VideoRequestItem): VideoBusAdmissionReceipt {
  return { ...identity, result: { status: "accepted", item } };
}
