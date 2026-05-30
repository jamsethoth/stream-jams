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
