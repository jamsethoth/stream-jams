import type { EventBusHandleOutcome, NormalizedStreamEvent, VideosModuleConfig } from "@stream-jams/core";
import type { VideoRequestIntake } from "./video-request-intake.js";
import { rejectionOutcome, type VideoIntakeDiagnostic } from "./streamerbot-video-intake.js";

export interface ChannelPointVideoIntakeOptions {
  readonly intake: Pick<VideoRequestIntake, "submit">;
  readonly getConfig: () => Promise<VideosModuleConfig> | VideosModuleConfig;
  readonly onDiagnostic?: ((entry: VideoIntakeDiagnostic) => void | Promise<void>) | undefined;
}

/**
 * Turns redemptions of operator-mapped rewards into queued requests. The viewer's
 * input is the link; channel point requests never autoplay. Refunds stay with
 * Twitch or Streamer.bot.
 */
export function createChannelPointVideoIntake(options: ChannelPointVideoIntakeOptions) {
  return {
    async handleEvent(event: NormalizedStreamEvent): Promise<EventBusHandleOutcome> {
      if (event.type !== "channel_point_redemption") return "no-match";
      const mapping = (await options.getConfig()).rewardMappings.find(candidate => candidate.rewardId === event.rewardId);
      if (mapping === undefined) return "no-match";
      const link = event.userInput?.trim() ?? "";
      const result = await options.intake.submit(mapping.purpose, {
        link: link === "" ? undefined : link,
        requester: event.actor.displayName.slice(0, 64)
      }, { via: "channel-points", mayAutoplay: false });
      await options.onDiagnostic?.(result.status === "accepted"
        ? { level: "info", message: "Channel point video request was queued.", metadata: { purpose: mapping.purpose, itemId: result.item.id, provider: result.item.source.provider, status: result.item.status } }
        : { level: "warn", message: "Channel point video request was rejected and not queued.", metadata: { purpose: mapping.purpose, reason: result.reason, fields: result.fields, eventId: event.id } });
      return result.status === "accepted" ? "admitted" : rejectionOutcome(result.reason);
    }
  };
}
