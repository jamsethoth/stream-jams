import { z } from "zod";
import {
  overlayPurposeSchema,
  videoShoutoutMaximumDurationMs,
  videoShoutoutMaximumUrlLength,
  type VideoShoutoutCommandParseResult
} from "@stream-jams/core";
import {
  twitchClipIdSchema,
  twitchLoginSchema,
  validateTwitchClipEmbedUrl,
  validateVideoShoutoutAvatarUrl,
  videoShoutoutDisplayNameSchema,
  videoShoutoutTitleSchema
} from "@stream-jams/core/video-shoutout";

/**
 * Streamer.bot broadcasts custom WebSocket JSON (CPH.WebsocketBroadcastJson) as
 * General/Custom events. The payload marker below selects video shoutouts from
 * any other custom broadcasts the streamer already sends.
 */
export const videoShoutoutStreamerBotEvent = { source: "General", type: "Custom" } as const;
export const videoShoutoutPayloadMarker = { source: "StreamJams", type: "VideoShoutout" } as const;

const durationSecondsSchema = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(?:\.\d+)?$/u).transform(Number)
]).pipe(z.number().finite().positive().max(videoShoutoutMaximumDurationMs / 1000));

const commandEnvelopeSchema = z.object({
  action: z.enum(["play", "no-clip", "clear"]).default("play"),
  purpose: overlayPurposeSchema.default("live")
});

const clipPayloadSchema = z.object({
  login: twitchLoginSchema,
  displayName: videoShoutoutDisplayNameSchema,
  clipId: twitchClipIdSchema,
  embedUrl: z.string().trim().min(1).max(videoShoutoutMaximumUrlLength),
  title: videoShoutoutTitleSchema,
  duration: durationSecondsSchema
});

/** True when Streamer.bot custom-event data carries the Stream Jams video shoutout marker. */
export function isVideoShoutoutPayload(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as { readonly source?: unknown; readonly type?: unknown };
  return candidate.source === videoShoutoutPayloadMarker.source && candidate.type === videoShoutoutPayloadMarker.type;
}

/**
 * Validates untrusted Streamer.bot data into a playback command. Clip selection,
 * Twitch auth, and eligibility stay in Streamer.bot; this only checks shape and safety.
 */
export function parseVideoShoutoutCommand(data: unknown): VideoShoutoutCommandParseResult {
  const envelope = commandEnvelopeSchema.safeParse(data);
  if (!envelope.success) return { status: "rejected", reason: "invalid-payload", fields: issueFields(envelope.error) };
  const { action, purpose } = envelope.data;
  if (action === "clear") return { status: "accepted", command: { kind: "clear", purpose } };
  if (action === "no-clip") {
    const displayName = videoShoutoutDisplayNameSchema.safeParse((data as { readonly displayName?: unknown }).displayName);
    return { status: "accepted", command: { kind: "no-clip", purpose, displayName: displayName.success ? displayName.data : null } };
  }

  const payload = clipPayloadSchema.safeParse(data);
  if (!payload.success) {
    const fields = issueFields(payload.error);
    return { status: "rejected", reason: fields.includes("duration") ? "invalid-duration" : "invalid-payload", fields };
  }
  const embedUrl = validateTwitchClipEmbedUrl(payload.data.embedUrl, payload.data.clipId);
  if (embedUrl === null) return { status: "rejected", reason: "unsafe-embed-url", fields: ["embedUrl"] };

  const rawAvatar = (data as { readonly avatarUrl?: unknown }).avatarUrl;
  const avatarUrl = validateVideoShoutoutAvatarUrl(rawAvatar);
  return {
    status: "accepted",
    command: {
      kind: "play",
      purpose,
      avatarOmitted: avatarUrl === null && rawAvatar !== undefined && rawAvatar !== null && rawAvatar !== "",
      clip: {
        login: payload.data.login,
        displayName: payload.data.displayName,
        clipId: payload.data.clipId,
        embedUrl,
        title: payload.data.title,
        durationMs: Math.min(Math.ceil(payload.data.duration * 1000), videoShoutoutMaximumDurationMs),
        avatarUrl
      }
    }
  };
}

function issueFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map(issue => String(issue.path[0] ?? "payload")))];
}
