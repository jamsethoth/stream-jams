import { NamedError } from "@stream-jams/core";

const subscriptionFailures = {
  STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER: {
    name: "StreamerBotSubscriptionWrongProviderError",
    message: "Streamer.bot subscriptions require a Streamer.bot provider"
  },
  STREAMERBOT_SUBSCRIPTIONS_INACTIVE: {
    name: "StreamerBotSubscriptionInactiveError",
    message: "Only the active Streamer.bot provider can update subscriptions"
  },
  STREAMERBOT_BROADCASTER_UNVERIFIED: {
    name: "StreamerBotBroadcasterUnverifiedError",
    message: "The selected Twitch broadcaster is not the currently verified catalog account"
  }
} as const;

export type StreamerBotSubscriptionErrorCode = keyof typeof subscriptionFailures;

export class StreamerBotSubscriptionError extends NamedError {
  constructor(readonly code: StreamerBotSubscriptionErrorCode, options?: ErrorOptions) {
    const failure = subscriptionFailures[code];
    super(failure.name, failure.message, options);
  }
}
