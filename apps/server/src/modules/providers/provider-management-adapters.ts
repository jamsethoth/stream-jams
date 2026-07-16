import { randomUUID } from "node:crypto";
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
import type { TwitchEventSubRuntimeService } from "../twitch/twitch-eventsub-runtime-service.js";
import type { TwitchOAuthService } from "../twitch/twitch-oauth-service.js";
import type {
  ProviderManagementAdapter,
  ProviderVoiceTestInput
} from "./provider-management-service.js";

const browserSpeechProviderId = "browser-speech";
const defaultTimeoutMs = 5_000;
const streamerBotPollIntervalMs = 25;

export type SpeakerBotSocket = StreamerBotSocket;

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

    const eventSubStatus = this.eventSubRuntimeService.getStatus();
    if (eventSubStatus.state === "error" || eventSubStatus.state === "degraded") {
      throw new Error(
        `Twitch EventSub is unavailable${eventSubStatus.message === null ? "." : `: ${eventSubStatus.message}.`} Reconnect Twitch, then retry.`
      );
    }

    return successfulValidation(this.now, eventSubStatus.state === "connected" ? "active" : "inactive");
  }
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

    const url = buildStreamerBotWebSocketUrl(input.configuration);
    const client = new StreamerBotClient({
      socketFactory: this.socketFactory,
      onEvent() {},
      requestTimeoutMs: this.timeoutMs,
      backoffMs: [this.timeoutMs],
      ...(this.requestIdGenerator === undefined ? {} : { requestIdGenerator: this.requestIdGenerator })
    });

    client.connect({
      ...input.configuration,
      ...(input.credential === undefined ? {} : { password: input.credential })
    });

    try {
      await waitForStreamerBotConnection(client, this.timeoutMs);
      return successfulValidation(this.now, "inactive");
    } catch (error) {
      const cause = error instanceof Error ? error.message : "unknown connection error";
      throw new Error(
        `Streamer.bot at ${url} could not be validated: ${cause}. Start Streamer.bot, enable its WebSocket server, verify ${url}, then retry.`,
        { cause: error }
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

    const url = buildWebSocketUrl(input.configuration);
    try {
      await this.client.getInfo(url);
      return successfulValidation(this.now, null);
    } catch (error) {
      const cause = error instanceof Error ? error.message : "unknown connection error";
      throw new Error(
        `Speaker.bot at ${url} could not be validated: ${cause}. Start Speaker.bot, enable its WebSocket server, verify ${url}, then retry.`,
        { cause: error }
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
    const url = buildWebSocketUrl(setup.configuration);
    await this.client.speak(url, {
      message: input.text,
      ...(input.provider.ttsSafety?.defaultVoiceId === null || input.provider.ttsSafety?.defaultVoiceId === undefined
        ? {}
        : { voice: input.provider.ttsSafety.defaultVoiceId })
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

interface SpeakerBotClientOptions {
  readonly socketFactory: (url: string) => SpeakerBotSocket;
  readonly generateRequestId?: (() => string) | undefined;
  readonly timeoutMs: number;
}

class SpeakerBotClient {
  readonly #socketFactory: (url: string) => SpeakerBotSocket;
  readonly #generateRequestId: () => string;
  readonly #timeoutMs: number;

  constructor(options: SpeakerBotClientOptions) {
    this.#socketFactory = options.socketFactory;
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    this.#timeoutMs = options.timeoutMs;
  }

  getInfo(url: string): Promise<Record<string, unknown>> {
    return this.#request(url, "GetInfo", {});
  }

  speak(url: string, input: { readonly message: string; readonly voice?: string | undefined }): Promise<Record<string, unknown>> {
    return this.#request(url, "Speak", input);
  }

  #request(url: string, request: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.#generateRequestId();
    const socket = this.#socketFactory(url);

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(new Error(`Speaker.bot ${request} request timed out`));
      }, this.#timeoutMs);

      const finish = (error: Error | null, response?: Record<string, unknown>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        socket.close();
        if (error === null && response !== undefined) {
          resolve(response);
          return;
        }
        reject(error ?? new Error(`Speaker.bot ${request} request failed`));
      };

      socket.addEventListener("open", () => {
        try {
          socket.send(JSON.stringify({ id, request, ...payload }));
        } catch {
          finish(new Error(`Speaker.bot ${request} request could not be sent`));
        }
      });
      socket.addEventListener("message", (event) => {
        const response = parseSpeakerBotResponse(event.data);
        if (response === null) {
          finish(new Error("Speaker.bot returned an invalid response"));
          return;
        }
        if (response.id !== id) {
          return;
        }
        if (response.status === "error" || typeof response.error === "string") {
          finish(new Error(`Speaker.bot ${request} request failed`));
          return;
        }
        finish(null, response);
      });
      socket.addEventListener("close", () => {
        finish(new Error(`Speaker.bot closed before the ${request} response arrived`));
      });
      socket.addEventListener("error", () => {
        finish(new Error("Speaker.bot WebSocket connection failed"));
      });
    });
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

function buildWebSocketUrl(configuration: Extract<ProviderSetupInput, { kind: "speakerbot" }>["configuration"]): string {
  const endpoint = configuration.endpoint.replace(/^\/+|\/+$/g, "");
  return `${configuration.protocol}://${configuration.host}:${String(configuration.port)}/${endpoint}`;
}

function parseSpeakerBotResponse(data: unknown): Record<string, unknown> | null {
  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
