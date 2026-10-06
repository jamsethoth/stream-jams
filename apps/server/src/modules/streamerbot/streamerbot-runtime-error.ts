import { NamedError } from "@stream-jams/core";

const runtimeFailureMessages = {
  STREAMERBOT_RUNTIME_CONNECTION_FAILED: "Streamer.bot connection failed",
  STREAMERBOT_RUNTIME_CONNECTION_TIMEOUT: "Streamer.bot connection timed out",
  STREAMERBOT_RUNTIME_TWITCH_CATEGORY_UNAVAILABLE: "Streamer.bot did not expose a Twitch event category",
  STREAMERBOT_RUNTIME_EVENT_CATALOG_UNAVAILABLE: "Streamer.bot did not expose any supported Twitch events",
  STREAMERBOT_RUNTIME_SUBSCRIPTION_UNAVAILABLE: "One or more selected Streamer.bot events are no longer advertised"
} as const;
export type StreamerBotRuntimeErrorCode = keyof typeof runtimeFailureMessages;

export class StreamerBotRuntimeError extends NamedError {
  constructor(readonly code: StreamerBotRuntimeErrorCode, options?: ErrorOptions) {
    super("StreamerBotRuntimeError", runtimeFailureMessages[code], options);
  }
}

export function safeRuntimeFailure(error: unknown): string {
  return error instanceof StreamerBotRuntimeError
    ? runtimeFailureMessages[error.code]
    : "Streamer.bot runtime could not be started";
}
