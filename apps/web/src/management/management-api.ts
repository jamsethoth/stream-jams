export interface DashboardSummary {
  readonly twitch: {
    readonly connected: boolean;
    readonly label: string;
  };
  readonly overlay: {
    readonly connectedClientCount: number;
    readonly label: string;
  };
  readonly queue: {
    readonly label: string;
    readonly queuedCount: number;
  };
  readonly recentErrors: readonly string[];
}

export interface ServerConfigView {
  readonly host: string;
  readonly port: number;
}

export interface ModerationTargetSettingsView {
  readonly maxLength: number;
  readonly blockedTerms: readonly string[];
  readonly stripUrls: boolean;
}

export interface ModerationSettingsView {
  readonly renderedText: ModerationTargetSettingsView;
  readonly ttsText: ModerationTargetSettingsView;
}

export interface ManagementModuleField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean" | "select" | "asset" | "color";
  readonly required: boolean;
}

export interface ManagementModuleStep {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly ManagementModuleField[];
}

export interface ManagementModuleView {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly config: unknown;
  readonly wizard: {
    readonly steps: readonly ManagementModuleStep[];
  };
}

export interface OverlayOutputUrl {
  readonly id: string;
  readonly label: string;
  readonly purpose: "live" | "test";
  readonly scope: "module" | "unified";
  readonly moduleId: string | null;
  readonly url: string;
}

export interface OverlayClientView {
  readonly id: string;
  readonly purpose: "live" | "test";
  readonly scope: "module" | "unified";
  readonly moduleId: string | null;
}

export interface PlaybackItemView {
  readonly id: string;
  readonly label: string;
  readonly status: "queued" | "playing" | "completed" | "skipped";
}

export interface PlaybackView {
  readonly current: PlaybackItemView | null;
  readonly queuedCount: number;
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
  readonly recent: readonly PlaybackItemView[];
}

export type TtsPlaybackModeView = "audio-file" | "remote-trigger" | "browser-speech";

export interface TtsProviderCapabilitiesView {
  readonly supportsVoices: boolean;
  readonly supportsRate: boolean;
  readonly supportsPitch: boolean;
  readonly supportsVolume: boolean;
  readonly playbackMode: TtsPlaybackModeView;
}

export interface TtsVoiceView {
  readonly id: string;
  readonly label: string;
}

export interface TtsProviderView {
  readonly id: string;
  readonly label: string;
  readonly capabilities: TtsProviderCapabilitiesView;
  readonly voices: readonly TtsVoiceView[];
}

export interface TtsTestRequestView {
  readonly providerId: string;
  readonly text: string;
  readonly voiceId?: string | null | undefined;
  readonly rate?: number | null | undefined;
  readonly pitch?: number | null | undefined;
  readonly volume?: number | null | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface TtsPlaybackInstructionView {
  readonly mode: TtsPlaybackModeView;
  readonly text: string;
  readonly audioAssetId: string | null;
  readonly providerPayload: Record<string, unknown> | null;
}

export interface TtsTestResultView {
  readonly instruction: TtsPlaybackInstructionView;
  readonly moderationActions: readonly { readonly type: string }[];
}

export interface TwitchConnectedAccountView {
  readonly accountId: string;
  readonly login: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly connectedAt: string;
  readonly updatedAt: string;
}

export type TwitchConnectionStatusView =
  | { readonly connected: false; readonly account: null }
  | { readonly connected: true; readonly account: TwitchConnectedAccountView };

export interface TwitchEventSubStatusView {
  readonly state: "idle" | "connecting" | "connected" | "reconnecting" | "degraded" | "error";
  readonly connectionState: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly sessionId: string | null;
  readonly connectedAt: string | null;
  readonly lastMessageAt: string | null;
  readonly subscriptionTypes: readonly string[];
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly lastEventAt: string | null;
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface DiagnosticsEventLogView {
  readonly id: string;
  readonly eventId: string;
  readonly providerId: string;
  readonly eventType: string;
  readonly actorDisplayName: string;
  readonly status: "received" | "processed" | "failed";
  readonly receivedAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly errorMessage: string | null;
}

export interface DiagnosticsAlertMatchLogView {
  readonly id: string;
  readonly sourceEventId: string;
  readonly ruleId: string;
  readonly variantId: string;
  readonly matchedAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
}

export interface DiagnosticsPlaybackLogView {
  readonly id: string;
  readonly queueItemId: string;
  readonly sourceEventId: string;
  readonly alertIds: readonly string[];
  readonly status: "queued" | "playing" | "completed" | "skipped" | "failed";
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly message: string | null;
}

export interface DiagnosticsProviderErrorView {
  readonly id: string;
  readonly providerId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly message: string;
  readonly correlationId: string | null;
  readonly processingId: string | null;
}

export interface DiagnosticsView {
  readonly eventLogs: readonly DiagnosticsEventLogView[];
  readonly alertMatchLogs: readonly DiagnosticsAlertMatchLogView[];
  readonly playbackLogs: readonly DiagnosticsPlaybackLogView[];
  readonly providerErrors: readonly DiagnosticsProviderErrorView[];
}

export interface DiagnosticsExportView extends DiagnosticsView {
  readonly generatedAt: string;
  readonly rawEventLogs: readonly unknown[];
}

export interface DiagnosticsRequestView {
  readonly limit?: number | undefined;
}

export interface TwitchAuthStartRequestView {
  readonly redirectUri: string;
}

export interface TwitchAuthStartResultView {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly scopes: readonly string[];
}

export interface ManagementApi {
  getDashboard(): Promise<DashboardSummary>;
  getServerConfig(): Promise<ServerConfigView>;
  updateServerConfig(input: ServerConfigView): Promise<ServerConfigView>;
  getModerationSettings(): Promise<ModerationSettingsView>;
  updateModerationSettings(input: ModerationSettingsView): Promise<ModerationSettingsView>;
  listModules(): Promise<readonly ManagementModuleView[]>;
  setModuleEnabled(moduleId: string, enabled: boolean): Promise<unknown>;
  saveModuleConfig(moduleId: string, input: { readonly enabled: boolean; readonly config: unknown }): Promise<unknown>;
  listOverlayOutputs(): Promise<readonly OverlayOutputUrl[]>;
  listOverlayClients(): Promise<readonly OverlayClientView[]>;
  getPlayback(): Promise<PlaybackView>;
  pausePlayback(): Promise<PlaybackView>;
  resumePlayback(): Promise<PlaybackView>;
  skipPlayback(): Promise<PlaybackView>;
  replayRecent(itemId: string): Promise<PlaybackView>;
  mutePlayback(): Promise<PlaybackView>;
  unmutePlayback(): Promise<PlaybackView>;
  setDoNotDisturb(enabled: boolean): Promise<PlaybackView>;
  listTtsProviders(): Promise<readonly TtsProviderView[]>;
  testTts(input: TtsTestRequestView): Promise<TtsTestResultView>;
  getTwitchStatus(): Promise<TwitchConnectionStatusView>;
  getTwitchEventSubStatus(): Promise<TwitchEventSubStatusView>;
  getDiagnostics(input?: DiagnosticsRequestView): Promise<DiagnosticsView>;
  exportDiagnostics(input?: DiagnosticsRequestView): Promise<DiagnosticsExportView>;
  startTwitchAuth(input: TwitchAuthStartRequestView): Promise<TwitchAuthStartResultView>;
  refreshTwitchAuth(): Promise<TwitchConnectionStatusView>;
  disconnectTwitch(): Promise<TwitchConnectionStatusView>;
}

export interface HttpManagementApiOptions {
  readonly fetch?: typeof fetch;
}

interface ManagementSessionResponse {
  readonly id: string;
}

interface PlaybackQueueSnapshotResponse {
  readonly current: PlaybackQueueItemResponse | null;
  readonly queued: readonly PlaybackQueueItemResponse[];
  readonly recent: readonly PlaybackQueueItemResponse[];
  readonly paused: boolean;
  readonly muted: boolean;
  readonly doNotDisturb: boolean;
}

interface PlaybackQueueItemResponse {
  readonly id: string;
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly alerts: readonly {
    readonly ruleId: string;
    readonly variantId: string;
    readonly overlayInstruction: {
      readonly text: { readonly text: string } | null;
    };
  }[];
}

interface OverlayModuleDefinitionResponse {
  readonly id: string;
  readonly displayName: string;
  readonly wizard: ManagementModuleView["wizard"];
}

interface OverlayModuleConfigResponse {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: unknown;
}

export function createHttpManagementApi(options: HttpManagementApiOptions = {}): ManagementApi {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let sessionId: string | null = null;

  async function getSessionId(): Promise<string> {
    if (sessionId !== null) {
      return sessionId;
    }

    const response = await fetcher("/auth/management/sessions", {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to create management session."));
    }

    const session = (await response.json()) as ManagementSessionResponse;
    sessionId = session.id;
    return session.id;
  }

  async function managementHeaders(extraHeaders: HeadersInit = {}): Promise<HeadersInit> {
    return {
      ...extraHeaders,
      authorization: `Bearer ${await getSessionId()}`
    };
  }

  async function jsonHeaders(): Promise<HeadersInit> {
    return managementHeaders({
      "content-type": "application/json"
    });
  }

  async function getPlayback(): Promise<PlaybackView> {
    const response = await fetcher("/playback", {
      headers: await managementHeaders()
    });
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to load playback."));
    }

    return mapPlaybackSnapshot((await response.json()) as PlaybackQueueSnapshotResponse);
  }

  async function postPlayback(path: string, body?: unknown): Promise<PlaybackView> {
    const requestInit: RequestInit = {
      method: "POST",
      headers: body === undefined ? await managementHeaders() : await jsonHeaders()
    };
    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetcher(path, requestInit);
    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to update playback."));
    }

    return mapPlaybackSnapshot((await response.json()) as PlaybackQueueSnapshotResponse);
  }

  function withLimit(path: string, input: DiagnosticsRequestView = {}): string {
    return input.limit === undefined ? path : `${path}?limit=${encodeURIComponent(String(input.limit))}`;
  }

  async function optionalJsonList<T>(path: string): Promise<readonly T[]> {
    const response = await fetcher(path, {
      headers: await managementHeaders()
    });
    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(await readHttpError(response, "Unable to load management data."));
    }

    return (await response.json()) as readonly T[];
  }

  return {
    async getDashboard() {
      const [playback, overlayClients] = await Promise.all([getPlayback(), optionalJsonList<OverlayClientView>("/management/overlay-clients")]);
      return {
        twitch: {
          connected: false,
          label: "Twitch disconnected"
        },
        overlay: {
          connectedClientCount: overlayClients.length,
          label: `${overlayClients.length} overlay clients`
        },
        queue: {
          label: playback.paused ? "Queue paused" : playback.current === null ? "Queue idle" : "Queue playing",
          queuedCount: playback.queuedCount
        },
        recentErrors: []
      };
    },

    async getServerConfig() {
      const response = await fetcher("/config/server", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load server settings."));
      }

      return (await response.json()) as ServerConfigView;
    },

    async updateServerConfig(input: ServerConfigView) {
      const response = await fetcher("/config/server", {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update server settings."));
      }

      return (await response.json()) as ServerConfigView;
    },

    async getModerationSettings() {
      const response = await fetcher("/moderation/settings", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load moderation settings."));
      }

      return (await response.json()) as ModerationSettingsView;
    },

    async updateModerationSettings(input: ModerationSettingsView) {
      const response = await fetcher("/moderation/settings", {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update moderation settings."));
      }

      return (await response.json()) as ModerationSettingsView;
    },

    async listModules() {
      const response = await fetcher("/overlay-modules", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load overlay modules."));
      }

      const modules = (await response.json()) as readonly OverlayModuleDefinitionResponse[];
      return Promise.all(
        modules.map(async (moduleDefinition): Promise<ManagementModuleView> => {
          const configResponse = await fetcher(`/overlay-modules/${encodeURIComponent(moduleDefinition.id)}/config`, {
            headers: await managementHeaders()
          });
          if (!configResponse.ok) {
            throw new Error(await readHttpError(configResponse, "Unable to load overlay module config."));
          }

          const config = (await configResponse.json()) as OverlayModuleConfigResponse;
          return {
            id: moduleDefinition.id,
            displayName: moduleDefinition.displayName,
            enabled: config.enabled,
            config: config.config,
            wizard: moduleDefinition.wizard
          };
        })
      );
    },

    async setModuleEnabled(moduleId: string, enabled: boolean) {
      const response = await fetcher(`/overlay-modules/${encodeURIComponent(moduleId)}/enabled`, {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to update overlay module."));
      }

      return response.json();
    },

    async saveModuleConfig(moduleId: string, input: { readonly enabled: boolean; readonly config: unknown }) {
      const response = await fetcher(`/overlay-modules/${encodeURIComponent(moduleId)}/config`, {
        method: "PUT",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to save overlay module config."));
      }

      return response.json();
    },

    listOverlayOutputs() {
      return optionalJsonList<OverlayOutputUrl>("/management/overlay-outputs");
    },

    listOverlayClients() {
      return optionalJsonList<OverlayClientView>("/management/overlay-clients");
    },

    async getDiagnostics(input: DiagnosticsRequestView = {}) {
      const response = await fetcher(withLimit("/diagnostics", input), {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load diagnostics."));
      }

      return (await response.json()) as DiagnosticsView;
    },

    async exportDiagnostics(input: DiagnosticsRequestView = {}) {
      const response = await fetcher(withLimit("/diagnostics/export", input), {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to export diagnostics."));
      }

      return (await response.json()) as DiagnosticsExportView;
    },

    async getTwitchStatus() {
      const response = await fetcher("/twitch/auth/status", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load Twitch status."));
      }

      return (await response.json()) as TwitchConnectionStatusView;
    },

    async getTwitchEventSubStatus() {
      const response = await fetcher("/twitch/eventsub/status", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load Twitch EventSub status."));
      }

      return (await response.json()) as TwitchEventSubStatusView;
    },

    async startTwitchAuth(input: TwitchAuthStartRequestView) {
      const response = await fetcher("/twitch/auth/start", {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to start Twitch authorization."));
      }

      return (await response.json()) as TwitchAuthStartResultView;
    },

    async refreshTwitchAuth() {
      const response = await fetcher("/twitch/auth/refresh", {
        method: "POST",
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to refresh Twitch connection."));
      }

      return (await response.json()) as TwitchConnectionStatusView;
    },

    async disconnectTwitch() {
      const response = await fetcher("/twitch/auth/disconnect", {
        method: "POST",
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to disconnect Twitch."));
      }

      return (await response.json()) as TwitchConnectionStatusView;
    },

    async listTtsProviders() {
      const response = await fetcher("/tts/providers", {
        headers: await managementHeaders()
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to load TTS providers."));
      }

      return (await response.json()) as readonly TtsProviderView[];
    },

    async testTts(input: TtsTestRequestView) {
      const response = await fetcher("/tts/test", {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(await readHttpError(response, "Unable to run TTS test."));
      }

      return (await response.json()) as TtsTestResultView;
    },

    getPlayback,

    pausePlayback() {
      return postPlayback("/playback/pause");
    },

    resumePlayback() {
      return postPlayback("/playback/resume");
    },

    skipPlayback() {
      return postPlayback("/playback/skip");
    },

    replayRecent(itemId: string) {
      return postPlayback("/playback/replay", { itemId });
    },

    mutePlayback() {
      return postPlayback("/playback/mute");
    },

    unmutePlayback() {
      return postPlayback("/playback/unmute");
    },

    setDoNotDisturb(enabled: boolean) {
      return postPlayback("/playback/do-not-disturb", { enabled });
    }
  };
}

function mapPlaybackSnapshot(snapshot: PlaybackQueueSnapshotResponse): PlaybackView {
  return {
    current: snapshot.current === null ? null : mapPlaybackItem(snapshot.current),
    queuedCount: snapshot.queued.length,
    paused: snapshot.paused,
    muted: snapshot.muted,
    doNotDisturb: snapshot.doNotDisturb,
    recent: snapshot.recent.map(mapPlaybackItem)
  };
}

function mapPlaybackItem(item: PlaybackQueueItemResponse): PlaybackItemView {
  const firstText = item.alerts[0]?.overlayInstruction.text?.text;
  return {
    id: item.id,
    label: firstText ?? item.alerts[0]?.ruleId ?? item.id,
    status: item.status
  };
}

async function readHttpError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { readonly error?: { readonly message?: unknown } };
    return typeof body.error?.message === "string" ? body.error.message : fallback;
  } catch {
    return fallback;
  }
}
