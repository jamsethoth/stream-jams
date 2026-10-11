import type { NormalizedStreamEvent } from "../events/types.js";

/**
 * Builds the key that identifies one Twitch occurrence regardless of which source delivered it.
 * Keys use only fields both direct Twitch and Streamer.bot report the same way: no message text
 * (formatting differs), no subscription tier on subs and resubs (EventSub reports Prime as tier 1000),
 * and no redemption ID (not every Streamer.bot redemption carries one). One-to-one pairing on the
 * bus keeps genuine repeats with equal keys apart.
 */
export function twitchCorrelationKey(event: NormalizedStreamEvent): string {
  const actor = event.actor.id ?? "anon";
  switch (event.type) {
    case "follow":
    case "subscription":
    case "stream_online":
    case "stream_offline":
      return key(event.type, actor);
    case "resubscription":
    case "cheer":
    case "raid":
      return key(event.type, actor, event.amount);
    case "channel_point_redemption":
      return key(event.type, actor, event.rewardId);
    case "gift_subscription":
      return key(event.type, event.recipient.id ?? "anon", event.tier);
    case "community_gift":
      return key(event.type, actor, event.amount, event.tier);
    case "hype_train_start":
    case "hype_train_end":
      return key(event.type, event.trainId);
    case "hype_train_progress":
      return key(event.type, event.trainId, event.level ?? "none", event.total ?? "none");
    case "poll_start":
    case "poll_end":
      return key(event.type, event.pollId);
    case "poll_progress":
      return key(event.type, event.pollId, event.totalVotes);
    case "prediction_start":
    case "prediction_lock":
    case "prediction_end":
      return key(event.type, event.predictionId);
    case "prediction_progress":
      return key(event.type, event.predictionId, event.totalUsers, event.totalPoints);
  }
}

function key(...parts: readonly (string | number)[]): string {
  return ["twitch", ...parts.map((part) => encodeURIComponent(String(part)))].join(":");
}
