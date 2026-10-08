import type { BusEvent, EventBusHandleOutcome, VideoShoutoutCommand, VideoShoutoutProjection } from "@stream-jams/core";
import { externalIdentityMatchesTrigger, type EventBusConsumer } from "../events/event-bus.js";
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

/** The Streamer.bot identity that carries video shoutouts; its payload is journaled for this consumer. */
export const videoShoutoutExternalIdentity = {
  providerKind: "streamerbot",
  sourceKey: videoShoutoutStreamerBotEvent.source,
  eventType: videoShoutoutStreamerBotEvent.type
} as const;

/**
 * Event bus consumer that turns Streamer.bot General/Custom broadcasts carrying the video shoutout marker into
 * module commands. It never calls Twitch, parses chat, evaluates eligibility, or executes Streamer.bot actions.
 * Other General/Custom broadcasts are left to the modules that select them.
 */
export function createVideoShoutoutBusConsumer(options: StreamerBotVideoShoutoutIntakeOptions): EventBusConsumer {
  const report = async (entry: VideoShoutoutIntakeDiagnostic) => { await options.onDiagnostic?.(entry); };
  // Commands are not idempotent, so a failed apply is never retried and a redelivered row is ignored.
  let lastSequence = 0;
  return {
    id: "video-shoutout",
    maxAttempts: 1,
    externalPayloads: [videoShoutoutExternalIdentity],
    handle: async (event: BusEvent): Promise<EventBusHandleOutcome> => {
      if (event.sequence <= lastSequence) return "no-match";
      lastSequence = event.sequence;
      if (
        event.kind !== "external" ||
        !event.effectTriggers.some((trigger) => externalIdentityMatchesTrigger(videoShoutoutExternalIdentity, trigger)) ||
        !isVideoShoutoutPayload(event.payload)
      ) {
        return "no-match";
      }

      const parsed = parseVideoShoutoutCommand(event.payload);
      if (parsed.status === "rejected") {
        await report({
          level: "warn",
          message: "Streamer.bot video shoutout was rejected and not shown.",
          metadata: { reason: parsed.reason, fields: parsed.fields }
        });
        return "failed";
      }

      const { command } = parsed;
      if (!await options.isModuleEnabled()) {
        await report({
          level: "info",
          message: "Streamer.bot video shoutout was ignored because the Video shoutout module is disabled.",
          metadata: { action: command.kind, purpose: command.purpose }
        });
        return "no-match";
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
      return "admitted";
    }
  };
}
