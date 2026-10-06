import { describe, expect, it } from "vitest";
import { serializeException } from "@stream-jams/core";
import { StreamerBotSubscriptionError } from "./provider-errors.js";

describe("subscription error compatibility", () => {
  it.each([
    ["STREAMERBOT_SUBSCRIPTIONS_WRONG_PROVIDER", "StreamerBotSubscriptionWrongProviderError", "Streamer.bot subscriptions require a Streamer.bot provider"],
    ["STREAMERBOT_SUBSCRIPTIONS_INACTIVE", "StreamerBotSubscriptionInactiveError", "Only the active Streamer.bot provider can update subscriptions"],
    ["STREAMERBOT_BROADCASTER_UNVERIFIED", "StreamerBotBroadcasterUnverifiedError", "The selected Twitch broadcaster is not the currently verified catalog account"]
  ] as const)("retains diagnostic identity for %s", (code, type, message) => {
    const error = new StreamerBotSubscriptionError(code, { cause: new TypeError("context") });
    expect(serializeException(error)).toMatchObject({ type, code, message, cause: { type: "TypeError", message: "context" } });
  });
});
