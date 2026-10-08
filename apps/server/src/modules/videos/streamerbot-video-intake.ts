import { z } from "zod";
import { overlayPurposeSchema, type OverlayPurpose } from "@stream-jams/core";
import { videoRequesterSchema } from "@stream-jams/core/videos";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";
import type { VideoRequestIntake } from "./video-request-intake.js";
import type { VideoQueueService } from "./video-queue-service.js";

/**
 * Streamer.bot broadcasts custom WebSocket JSON (CPH.WebsocketBroadcastJson) as
 * General/Custom events. `VideoRequest` is the Videos payload; `VideoShoutout`
 * is the retired shoutout module's payload, still accepted as a request.
 */
export const videoStreamerBotEvent = { source: "General", type: "Custom" } as const;
export const videoRequestMarker = { source: "StreamJams", type: "VideoRequest" } as const;
export const legacyVideoShoutoutMarker = { source: "StreamJams", type: "VideoShoutout" } as const;

export interface VideoIntakeDiagnostic {
  readonly level: "info" | "warn";
  readonly message: string;
  /** Only bounded identifiers and field names; never links, raw payloads, or route keys. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

export interface StreamerBotVideoIntakeOptions {
  readonly intake: Pick<VideoRequestIntake, "submit">;
  readonly queue: Pick<VideoQueueService, "command" | "view" | "showNotice">;
  readonly onDiagnostic?: ((entry: VideoIntakeDiagnostic) => void | Promise<void>) | undefined;
}

const envelopeSchema = z.object({ action: z.enum(["play", "no-clip", "clear"]).default("play"), purpose: overlayPurposeSchema.default("live") });
const twitchClipIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/u);

/**
 * Passive adapter: it never calls Twitch, parses chat, or executes Streamer.bot actions.
 * Returns true when the event carried a Videos marker, so it skips stream-event ingestion.
 */
export function createStreamerBotVideoIntake(options: StreamerBotVideoIntakeOptions) {
  const report = async (entry: VideoIntakeDiagnostic) => { await options.onDiagnostic?.(entry); };
  return async (envelope: StreamerBotEventEnvelope): Promise<boolean> => {
    if (envelope.event.source.toLowerCase() !== videoStreamerBotEvent.source.toLowerCase() || envelope.event.type !== videoStreamerBotEvent.type) return false;
    const marker = readMarker(envelope.data);
    if (marker === null) return false;
    const data = envelope.data as Record<string, unknown>;
    const parsedEnvelope = envelopeSchema.safeParse(data);
    if (!parsedEnvelope.success) {
      await report({ level: "warn", message: "Streamer.bot video request was rejected.", metadata: { reason: "invalid-request", fields: ["action", "purpose"].filter(field => field in data) } });
      return true;
    }
    const { action, purpose } = parsedEnvelope.data;
    if (action === "clear") {
      stopCurrent(options.queue, purpose);
      await report({ level: "info", message: "Streamer.bot stopped the current video.", metadata: { purpose } });
      return true;
    }
    if (action === "no-clip") {
      const displayName = videoRequesterSchema.safeParse(data.displayName);
      options.queue.showNotice(purpose, displayName.success ? displayName.data : null);
      await report({ level: "info", message: "Streamer.bot reported no clip to show.", metadata: { purpose } });
      return true;
    }

    const request = marker === "request" ? requestFields(data) : legacyRequestFields(data);
    const result = options.intake.submit(purpose, request, { via: "streamerbot", mayAutoplay: true });
    if (result.status === "rejected") {
      await report({ level: "warn", message: "Streamer.bot video request was rejected and not queued.", metadata: { reason: result.reason, fields: result.fields, purpose } });
      return true;
    }
    await report({
      level: "info",
      message: "Streamer.bot video request was queued.",
      metadata: { purpose, itemId: result.item.id, provider: result.item.source.provider, status: result.item.status, autoplay: result.item.autoplay, legacy: marker === "legacy" }
    });
    return true;
  };
}

function readMarker(data: unknown): "request" | "legacy" | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as { readonly source?: unknown; readonly type?: unknown };
  if (candidate.source !== videoRequestMarker.source) return null;
  if (candidate.type === videoRequestMarker.type) return "request";
  return candidate.type === legacyVideoShoutoutMarker.type ? "legacy" : null;
}

const envelopeKeys = new Set(["source", "type", "action", "purpose"]);

/** Copies only the request fields; envelope and marker keys are not part of the request. */
function requestFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !envelopeKeys.has(key)));
}

/** Maps the retired shoutout payload: the clip id becomes a clips.twitch.tv link. */
function legacyRequestFields(data: Record<string, unknown>): Record<string, unknown> {
  const clipId = twitchClipIdSchema.safeParse(data.clipId);
  const duration = typeof data.duration === "string" && /^\d+(?:\.\d+)?$/u.test(data.duration.trim()) ? Number(data.duration) : data.duration;
  return {
    link: clipId.success ? `https://clips.twitch.tv/${clipId.data}` : data.clipId,
    ...(data.title === undefined ? {} : { title: data.title }),
    ...(data.displayName === undefined ? {} : { requester: data.displayName }),
    ...(duration === undefined ? {} : { durationSeconds: duration }),
    ...(data.autoplay === undefined ? {} : { autoplay: data.autoplay })
  };
}

function stopCurrent(queue: StreamerBotVideoIntakeOptions["queue"], purpose: OverlayPurpose): void {
  const view = queue.view(purpose);
  if (view.current === null && view.gapEndsAtEpochMs === null) return;
  queue.command(purpose, view.revision, { kind: "stop" });
}
