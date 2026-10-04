import {
  providerSetupInputSchema,
  providerValidationResultSchema,
  providerVoiceTestResultSchema,
  type ProviderKind,
  type ProviderSetupInput,
  type ProviderValidationResult,
  type ProviderVoiceTestResult,
  type TtsService,
  type TtsVoice
} from "@stream-jams/core";
import {
  buildStreamerBotWebSocketUrl,
  StreamerBotClient,
  type StreamerBotSocket
} from "../streamerbot/streamerbot-client.js";
import {
  buildSpeakerBotWebSocketUrl,
  SpeakerBotClient,
  type SpeakerBotSocket
} from "../tts/speakerbot-client.js";
import type { TwitchEventSubRuntimeService } from "../twitch/twitch-eventsub-runtime-service.js";
import type { TwitchOAuthService } from "../twitch/twitch-oauth-service.js";
import type {
  ProviderManagementAdapter,
  ProviderVoiceTestInput
} from "./provider-management-service.js";

const browserSpeechProviderId = "browser-speech";
const defaultTimeoutMs = 5_000;
const streamerBotPollIntervalMs = 25;

export type { SpeakerBotSocket } from "../tts/speakerbot-client.js";

export interface ProviderManagementAdaptersOptions {
  readonly twitchOAuthService: Pick<TwitchOAuthService, "getStatus">;
  readonly twitchEventSubRuntimeService: Pick<TwitchEventSubRuntimeService, "getStatus">;
  readonly streamerBotSocketFactory: (url: string) => StreamerBotSocket;
  readonly speakerBotSocketFactory: (url: string) => SpeakerBotSocket;
  readonly ttsService: Pick<TtsService, "listProviders" | "testProvider">;
  readonly now?: (() => Date) | undefined;
  readonly generateRequestId?: (() => string) | undefined;
  readonly streamerBotRequestIdGenerator?: (() => string) | undefined;
  readonly timeoutMs?: number | undefined;
}

export function createProviderManagementAdapters(
  options: ProviderManagementAdaptersOptions
): ReadonlyMap<ProviderKind, ProviderManagementAdapter> {
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const speakerBotClient = new SpeakerBotClient({
    socketFactory: options.speakerBotSocketFactory,
    generateRequestId: options.generateRequestId,
    timeoutMs
  });

  return new Map<ProviderKind, ProviderManagementAdapter>([
    ["twitch", new TwitchProviderAdapter(options.twitchOAuthService, options.twitchEventSubRuntimeService, now)],
    [
      "streamerbot",
      new StreamerBotProviderAdapter(
        options.streamerBotSocketFactory,
        options.streamerBotRequestIdGenerator,
        now,
        timeoutMs
      )
    ],
    ["speakerbot", new SpeakerBotProviderAdapter(speakerBotClient, now)],
    ["browser-speech", new BrowserSpeechProviderAdapter(options.ttsService, now)]
  ]);
}

class TwitchProviderAdapter implements ProviderManagementAdapter {
  constructor(
    private readonly oauthService: Pick<TwitchOAuthService, "getStatus">,
    private readonly eventSubRuntimeService: Pick<TwitchEventSubRuntimeService, "getStatus">,
    private readonly now: () => Date
  ) {}

  async validate(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    if (input.kind !== "twitch") {
      throw new Error("Twitch validation received the wrong provider configuration.");
    }

    const oauthStatus = await this.oauthService.getStatus();
    if (!oauthStatus.connected) {
      throw new Error("Twitch is not connected. Connect Twitch in Event Sources, then retry.");
    }
    if (oauthStatus.authorizationState === "update-required") {
      throw new Error(`Twitch authorization update required. Reconnect Twitch to enable ${formatMissingTwitchCapabilities(oauthStatus.missingScopes)}.`);
    }

    const eventSubStatus = this.eventSubRuntimeService.getStatus();
    if (eventSubStatus.state === "error" || eventSubStatus.state === "degraded") {
      throw new Error(
        `Twitch EventSub is unavailable${eventSubStatus.message === null ? "." : `: ${eventSubStatus.message}.`} Reconnect Twitch, then retry.`
      );
    }

    return successfulValidation(this.now, eventSubStatus.state === "connected" ? "active" : "inactive");
  }
}

function formatMissingTwitchCapabilities(scopes: readonly string[]): string {
  const names = scopes.flatMap((scope) => {
    switch (scope) {
      case "channel:read:hype_train": return ["Hype Trains"];
      case "channel:read:polls": return ["polls"];
      case "channel:read:predictions": return ["predictions"];
      default: return [];
    }
  });
  if (names.length === 0) return "the required event permissions";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

class StreamerBotProviderAdapter implements ProviderManagementAdapter {
  constructor(
    private readonly socketFactory: (url: string) => StreamerBotSocket,
    private readonly requestIdGenerator: (() => string) | undefined,
    private readonly now: () => Date,
    private readonly timeoutMs: number
  ) {}

  async validate(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    if (input.kind !== "streamerbot") {
      throw new Error("Streamer.bot validation received the wrong provider configuration.");
    }

    if (!input.credential && !input.configuration.allowUnauthenticatedLocalConnection) {
      throw new Error("Enter a Streamer.bot password or explicitly allow an unauthenticated local connection.");
    }
    buildStreamerBotWebSocketUrl(input.configuration);
    const client = new StreamerBotClient({
      socketFactory: this.socketFactory,
      onEvent() {},
      requestTimeoutMs: this.timeoutMs,
      backoffMs: [this.timeoutMs],
      ...(this.requestIdGenerator === undefined ? {} : { requestIdGenerator: this.requestIdGenerator })
    });

    client.connect({
      protocol: input.configuration.protocol,
      host: input.configuration.host,
      port: input.configuration.port,
      endpoint: input.configuration.endpoint,
      allowUnauthenticatedLocalConnection: input.configuration.allowUnauthenticatedLocalConnection,
      ...(input.credential === undefined ? {} : { password: input.credential })
    });

    try {
      await waitForStreamerBotConnection(client, this.timeoutMs);
      return successfulValidation(this.now, "inactive");
    }
    // error-provenance: allow expected -- untrusted provider errors may contain credentials; this management boundary returns bounded setup guidance
    catch {
      throw new Error(
        `Streamer.bot could not be validated. Enable its local WebSocket server and verify Authentication and Enforce settings, then retry.`
      );
    } finally {
      client.disconnect();
    }
  }
}

class SpeakerBotProviderAdapter implements ProviderManagementAdapter {
  constructor(
    private readonly client: SpeakerBotClient,
    private readonly now: () => Date
  ) {}

  async validate(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    if (input.kind !== "speakerbot") {
      throw new Error("Speaker.bot validation received the wrong provider configuration.");
    }

    const url = buildSpeakerBotWebSocketUrl(input.configuration);
    try {
      await this.client.validateConnection(url);
      return successfulValidation(this.now, null);
    }
    // error-provenance: allow expected -- untrusted provider errors may contain credentials; this management boundary returns bounded setup guidance
    catch {
      throw new Error(
        "Speaker.bot could not be validated. Enable its local WebSocket server and verify the connection settings, then retry."
      );
    }
  }

  async testVoice(input: ProviderVoiceTestInput): Promise<ProviderVoiceTestResult> {
    const setup = providerSetupInputSchema.parse({
      name: input.provider.provider.name,
      kind: "speakerbot",
      configuration: input.provider.configuration
    });
    if (setup.kind !== "speakerbot") {
      throw new Error("Speaker.bot voice test received the wrong provider configuration.");
    }
    const url = buildSpeakerBotWebSocketUrl(setup.configuration);
    const voice = input.provider.ttsSafety?.defaultVoiceId;
    if (voice === null || voice === undefined || voice.trim().length === 0) {
      throw new Error("Speaker.bot requires a default voice before it can be tested.");
    }
    await this.client.speak(url, {
      message: input.text,
      voice,
      badWordFilter: true
    });
    return providerVoiceTestResultSchema.parse({ delivered: true, error: null });
  }
}

class BrowserSpeechProviderAdapter implements ProviderManagementAdapter {
  constructor(
    private readonly ttsService: Pick<TtsService, "listProviders" | "testProvider">,
    private readonly now: () => Date
  ) {}

  async validate(input: ProviderSetupInput): Promise<ProviderValidationResult> {
    if (input.kind !== "browser-speech") {
      throw new Error("Browser Speech validation received the wrong provider configuration.");
    }

    const provider = (await this.ttsService.listProviders()).find(({ id }) => id === browserSpeechProviderId);
    if (provider === undefined) {
      throw new Error("Browser Speech is unavailable. Enable the built-in Browser Speech provider, then retry.");
    }

    return successfulValidation(this.now, null, provider.voices);
  }

  async testVoice(input: ProviderVoiceTestInput): Promise<ProviderVoiceTestResult> {
    const safety = input.provider.ttsSafety;
    await this.ttsService.testProvider({
      providerId: browserSpeechProviderId,
      text: input.text,
      ...(safety?.defaultVoiceId === null || safety?.defaultVoiceId === undefined
        ? {}
        : { voiceId: safety.defaultVoiceId }),
      ...(safety === null ? {} : { volume: safety.volume })
    });
    return providerVoiceTestResultSchema.parse({ delivered: true, error: null });
  }
}

async function waitForStreamerBotConnection(client: StreamerBotClient, timeoutMs: number): Promise<void> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / streamerBotPollIntervalMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = client.getStatus();
    if (status.state === "connected") {
      return;
    }
    if (status.state === "error" || status.state === "degraded") {
      throw new Error(status.message ?? "Streamer.bot connection failed");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, streamerBotPollIntervalMs));
  }
  throw new Error("Streamer.bot connection timed out");
}

function successfulValidation(
  now: () => Date,
  intakeState: "active" | "inactive" | null,
  availableVoices: readonly TtsVoice[] = []
): ProviderValidationResult {
  return providerValidationResultSchema.parse({
    valid: true,
    connectionState: "connected",
    intakeState,
    validatedAt: now().toISOString(),
    availableVoices: [...availableVoices],
    error: null
  });
}
