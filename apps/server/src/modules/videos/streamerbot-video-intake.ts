import { z } from "zod";
import { type BusEvent, type BusEventInput, type EventBusHandleOutcome, type VideoQueuePurpose } from "@stream-jams/core";
import { videoRequesterSchema } from "@stream-jams/core/videos";
import { EventBusInputRejectedError, externalIdentityMatchesTrigger } from "../events/event-bus.js";
import type { VideoRequestIntake, VideoRequestRejection } from "./video-request-intake.js";
import type { VideoQueueService } from "./video-queue-service.js";

/**
 * Streamer.bot broadcasts custom WebSocket JSON (CPH.WebsocketBroadcastJson) as
 * General/Custom events. `VideoRequest` is the Videos payload; `VideoShoutout`
 * is the retired shoutout module's payload, still accepted as a request.
 */
export const videoStreamerBotEvent = { source: "General", type: "Custom" } as const;
export const videoRequestMarker = { source: "StreamJams", type: "VideoRequest" } as const;
export const legacyVideoShoutoutMarker = { source: "StreamJams", type: "VideoShoutout" } as const;

/** The Streamer.bot identity that carries video requests; the event bus journals its payload for Videos. */
export const videoExternalIdentity = {
  providerKind: "streamerbot",
  sourceKey: videoStreamerBotEvent.source,
  eventType: videoStreamerBotEvent.type
} as const;

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

const envelopeSchema = z.object({ action: z.enum(["play", "no-clip", "clear"]).default("play"), purpose: z.literal("live").default("live") });
const twitchClipIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/u);

/** Ingress fence; consumer validation still rejects already-journaled legacy rows on replay. */
export function validateVideoBusInput(input: BusEventInput): void {
  const applies = input.kind === "external" ? input.effectTriggers.some(trigger => externalIdentityMatchesTrigger(videoExternalIdentity, trigger))
    : input.kind === "manual" && input.action.kind === "simulate-external" && input.action.identity.providerKind === "streamerbot"
      && input.action.identity.sourceKey.toLowerCase() === "general" && input.action.identity.eventType === "Custom";
  if (!applies) return;
  const payload = input.kind === "external" ? input.payload
    : input.kind === "manual" && input.action.kind === "simulate-external" ? input.action.payload : undefined;
  if (readMarker(payload) === null) return;
  const data = payload as Record<string, unknown>;
  if (data.purpose !== undefined && data.purpose !== "live") {
    throw new EventBusInputRejectedError("VIDEO_TEST_RETIRED", "Videos test input was retired. Remove its purpose selector and refresh the ordinary queue before submitting.");
  }
}

/**
 * Passive adapter for General/Custom bus events: it never calls Twitch, parses chat, or executes Streamer.bot
 * actions. Broadcasts without a Videos marker are left to the modules that select them.
 */
export function createStreamerBotVideoIntake(options: StreamerBotVideoIntakeOptions) {
  // Legacy clear/no-clip actions are commands, not queue admission. Preserve their process-local once-per-row guard.
  let lastCommandSequence = 0;
  const report = async (entry: VideoIntakeDiagnostic) => { await options.onDiagnostic?.(entry); };
  return async (event: BusEvent): Promise<EventBusHandleOutcome> => {
    const manual = event.kind === "manual" && event.action.kind === "simulate-external" ? event : null;
    const manualAction = manual?.action;
    const matches = manualAction?.kind === "simulate-external"
      ? manualAction.identity.providerKind === "streamerbot" && manualAction.identity.sourceKey.toLowerCase() === videoExternalIdentity.sourceKey.toLowerCase() && manualAction.identity.eventType === videoExternalIdentity.eventType
      : event.kind === "external" && event.effectTriggers.some(trigger => externalIdentityMatchesTrigger(videoExternalIdentity, trigger));
    if (!matches) return "no-match";
    const payload = manualAction?.kind === "simulate-external" ? manualAction.payload : event.kind === "external" ? event.payload : undefined;
    const marker = readMarker(payload);
    if (marker === null) return "no-match";
    const data = payload as Record<string, unknown>;
    const parsedEnvelope = envelopeSchema.safeParse(data);
    if (!parsedEnvelope.success) {
      await report({ level: "warn", message: "Streamer.bot video request was rejected.", metadata: { reason: "retired-video-test-or-invalid-request", fields: ["action", "purpose"].filter(field => field in data) } });
      return "failed";
    }
    const { action, purpose } = parsedEnvelope.data;
    if (action === "clear" || action === "no-clip") {
      if (event.sequence <= lastCommandSequence) return "no-match";
      lastCommandSequence = event.sequence;
    }
    if (action === "clear") {
      stopCurrent(options.queue, purpose);
      await report({ level: "info", message: "Streamer.bot stopped the current video.", metadata: { purpose } });
      return "admitted";
    }
    if (action === "no-clip") {
      const displayName = videoRequesterSchema.safeParse(data.displayName);
      options.queue.showNotice(purpose, displayName.success ? displayName.data : null);
      await report({ level: "info", message: "Streamer.bot reported no clip to show.", metadata: { purpose } });
      return "admitted";
    }

    const request = marker === "request" ? requestFields(data) : legacyRequestFields(data);
    const result = await options.intake.submit(purpose, request, {
      via: manual?.submission.channel ?? "streamerbot", mayAutoplay: manual?.submission.mayAutoplay ?? true,
      policy: "streamerbot", busIdentity: { busId: event.busId, eventId: event.eventId }
    });
    if (result.status === "rejected") {
      await report({ level: "warn", message: "Streamer.bot video request was rejected and not queued.", metadata: { reason: result.reason, fields: result.fields, purpose } });
      return rejectionOutcome(result.reason);
    }
    await report({
      level: "info",
      message: "Streamer.bot video request was queued.",
      metadata: { purpose, itemId: result.item.id, provider: result.item.source.provider, status: result.item.status, autoplay: result.item.autoplay, legacy: marker === "legacy" }
    });
    return "admitted";
  };
}

/** A request the disabled module turned away did not match anything; any other rejection failed. */
export function rejectionOutcome(reason: VideoRequestRejection): EventBusHandleOutcome {
  return reason === "module-disabled" ? "no-match" : "failed";
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

function stopCurrent(queue: StreamerBotVideoIntakeOptions["queue"], purpose: VideoQueuePurpose): void {
  const view = queue.view(purpose);
  if (view.current === null && view.gapEndsAtEpochMs === null) return;
  queue.command(purpose, view.revision, { kind: "stop" });
}
