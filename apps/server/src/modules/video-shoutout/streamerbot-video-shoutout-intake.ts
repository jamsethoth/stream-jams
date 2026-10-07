import type { VideoShoutoutCommand, VideoShoutoutProjection } from "@stream-jams/core";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";
import { isVideoShoutoutPayload, parseVideoShoutoutCommand, videoShoutoutStreamerBotEvent } from "./video-shoutout-command.js";

export interface VideoShoutoutIntakeDiagnostic {
  readonly level: "info" | "warn";
  readonly message: string;
  /** Only bounded identifiers and field names; never URLs, raw payloads, or route keys. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

export interface StreamerBotVideoShoutoutIntakeOptions {
  readonly service: { apply(command: VideoShoutoutCommand): VideoShoutoutProjection };
  readonly isModuleEnabled: () => Promise<boolean>;
  readonly onDiagnostic?: ((entry: VideoShoutoutIntakeDiagnostic) => void | Promise<void>) | undefined;
}

/**
 * Passive adapter from Streamer.bot custom broadcasts to the video shoutout module.
 * It never calls Twitch, parses chat, evaluates eligibility, or executes Streamer.bot actions.
 * Returns true when the event was a video shoutout, so it does not also enter stream-event ingestion.
 */
export function createStreamerBotVideoShoutoutIntake(options: StreamerBotVideoShoutoutIntakeOptions) {
  const report = async (entry: VideoShoutoutIntakeDiagnostic) => { await options.onDiagnostic?.(entry); };
  return async (envelope: StreamerBotEventEnvelope): Promise<boolean> => {
    if (
      envelope.event.source.toLowerCase() !== videoShoutoutStreamerBotEvent.source.toLowerCase() ||
      envelope.event.type !== videoShoutoutStreamerBotEvent.type ||
      !isVideoShoutoutPayload(envelope.data)
    ) {
      return false;
    }

    const parsed = parseVideoShoutoutCommand(envelope.data);
    if (parsed.status === "rejected") {
      await report({
        level: "warn",
        message: "Streamer.bot video shoutout was rejected and not shown.",
        metadata: { reason: parsed.reason, fields: parsed.fields }
      });
      return true;
    }

    const { command } = parsed;
    if (!await options.isModuleEnabled()) {
      await report({
        level: "info",
        message: "Streamer.bot video shoutout was ignored because the Video shoutout module is disabled.",
        metadata: { action: command.kind, purpose: command.purpose }
      });
      return true;
    }

    const projection = options.service.apply(command);
    await report({
      level: "info",
      message: "Streamer.bot video shoutout was accepted.",
      metadata: {
        action: command.kind,
        purpose: command.purpose,
        activationId: projection.status === "idle" ? null : projection.activationId,
        ...(command.kind === "play"
          ? { login: command.clip.login, clipId: command.clip.clipId, durationMs: command.clip.durationMs, avatarOmitted: command.avatarOmitted }
          : {})
      }
    });
    return true;
  };
}
