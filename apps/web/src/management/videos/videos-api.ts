import type { OverlayPurpose, VideoQueueResponse, VideosModuleConfig } from "@stream-jams/core";
import { createManagementHttpClient, ManagementHttpError, type HttpManagementClientOptions } from "../management-http-client.js";

// Only types come from the Videos contract: its schemas stay out of the management and operator bundles.
// The server validates every request; these guards only reject responses the UI cannot render.

export type VideoQueueItem = VideoQueueResponse["items"][number];
export type VideoQueueCommand =
  | { readonly kind: "play-next" | "play-all" | "pause-queue" | "resume-queue" | "skip" | "stop" | "clear" }
  | { readonly kind: "remove" | "play-anyway"; readonly itemId: string }
  | { readonly kind: "reorder"; readonly itemIds: readonly string[] };
export type VideoCurrentAction = "pause" | "resume" | "seek";
export type VideoSubmitter = "management" | "operator";

export interface VideoRequestInput {
  readonly link: string;
  readonly title?: string;
}

export interface VideoQueueApi {
  getQueue(purpose: OverlayPurpose): Promise<VideoQueueResponse>;
  submit(purpose: OverlayPurpose, input: VideoRequestInput): Promise<VideoQueueItem>;
  command(purpose: OverlayPurpose, expectedRevision: number, command: VideoQueueCommand): Promise<VideoQueueResponse>;
  control(purpose: OverlayPurpose, action: VideoCurrentAction, expectedItemId: string, positionMs?: number): Promise<VideoQueueResponse>;
}

export interface VideosBrowserSource {
  readonly id: string;
  readonly label: string;
  readonly purpose: OverlayPurpose;
  readonly overlayId: string;
  readonly enabled: boolean;
  readonly url: string | null;
  readonly status: "available" | "create-required" | "regenerate-required";
}

export interface VideosModuleState {
  readonly enabled: boolean;
  readonly config: VideosModuleConfig;
}

export interface VideosApi extends VideoQueueApi {
  getModuleConfig(): Promise<VideosModuleState>;
  saveModuleConfig(enabled: boolean, config: VideosModuleConfig): Promise<VideosModuleState>;
  setModuleEnabled(enabled: boolean): Promise<boolean>;
  listBrowserSources(): Promise<readonly VideosBrowserSource[]>;
  createBrowserSource(source: VideosBrowserSource): Promise<void>;
  regenerateBrowserSource(source: VideosBrowserSource): Promise<void>;
}

export function isVideoQueueConflict(error: unknown): boolean {
  return error instanceof ManagementHttpError && error.code === "VIDEO_QUEUE_CONFLICT";
}

export function createHttpVideosApi(options: HttpManagementClientOptions & { readonly from?: VideoSubmitter } = {}): VideosApi {
  const client = createManagementHttpClient(options);
  const path = (purpose: OverlayPurpose) => `/videos/${purpose === "test" ? "test" : "live"}`;
  return {
    async getQueue(purpose) { return parseQueue(await client.getJson(path(purpose), "Unable to load the video queue.")); },
    async submit(purpose, input) {
      const body = { link: input.link, ...(input.title === undefined || input.title.trim() === "" ? {} : { title: input.title.trim() }) };
      const response = await client.postJson<unknown>(`${path(purpose)}/requests?from=${options.from ?? "management"}`, body, "Unable to add the video.");
      const item = typeof response === "object" && response !== null && "item" in response ? response.item : null;
      if (!isQueueItem(item, false)) throw new TypeError("The video request returned an invalid response.");
      return item as VideoQueueItem;
    },
    async command(purpose, expectedRevision, command) {
      return parseQueue(await client.postJson(`${path(purpose)}/commands`, { expectedRevision, command }, "Unable to update the video queue."));
    },
    async control(purpose, action, expectedItemId, positionMs) {
      return parseQueue(await client.postJson(`${path(purpose)}/current/${action}`, { expectedItemId, ...(positionMs === undefined ? {} : { positionMs }) }, `Unable to ${action} the video.`));
    },
    async getModuleConfig() { return parseModuleState(await client.getJson("/overlay-modules/videos/config", "Unable to load Videos settings.")); },
    async saveModuleConfig(enabled, config) {
      return parseModuleState(await client.putJson("/overlay-modules/videos/config", { enabled, config }, "Unable to save Videos settings."));
    },
    async setModuleEnabled(enabled) {
      return parseModuleState(await client.patchJson("/overlay-modules/videos/enabled", { enabled }, `Unable to ${enabled ? "enable" : "disable"} the Videos module.`)).enabled;
    },
    async listBrowserSources() {
      const response = await client.getJson<unknown>("/management/overlay-outputs", "Unable to load Videos Browser Sources.");
      if (!Array.isArray(response)) throw new TypeError("Expected a Browser Sources response array");
      return response.flatMap(parseBrowserSource);
    },
    async createBrowserSource(source) {
      await client.postJson("/management/overlay-outputs/keys", outputRequest(source), "Unable to create the Videos Browser Source URL.");
    },
    async regenerateBrowserSource(source) {
      await client.postJson("/management/overlay-outputs/keys/regenerate", outputRequest(source), "Unable to regenerate the Videos Browser Source URL.");
    }
  };
}

const statuses = ["queued", "held", "playing", "paused", "played", "failed", "removed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQueueItem(value: unknown, requireLink: boolean): boolean {
  return isRecord(value) && typeof value.id === "string" && statuses.includes(String(value.status))
    && (value.title === null || typeof value.title === "string") && (value.requester === null || typeof value.requester === "string")
    && (value.durationMs === null || typeof value.durationMs === "number")
    && (value.holdReason === null || value.holdReason === "over-limit" || value.holdReason === "unknown-length")
    && isRecord(value.source) && typeof value.source.provider === "string"
    && (!requireLink || typeof value.link === "string");
}

function parseQueue(value: unknown): VideoQueueResponse {
  const current = isRecord(value) ? value.current : undefined;
  if (!isRecord(value) || (value.purpose !== "live" && value.purpose !== "test") || typeof value.revision !== "number"
    || typeof value.queuePaused !== "boolean" || typeof value.serverTimeEpochMs !== "number"
    || !Array.isArray(value.items) || !value.items.every(item => isQueueItem(item, true))
    || (current !== null && !(isRecord(current) && typeof current.itemId === "string" && typeof current.positionMs === "number"
      && typeof current.atEpochMs === "number" && ["loading", "playing", "paused"].includes(String(current.phase)) && isRecord(current.controls)))) {
    throw new TypeError("The video queue returned an invalid response. Reload and retry.");
  }
  return value as unknown as VideoQueueResponse;
}

function parseModuleState(value: unknown): VideosModuleState {
  if (!isRecord(value) || typeof value.enabled !== "boolean" || !isRecord(value.config)
    || typeof value.config.maxLengthSeconds !== "number" || typeof value.config.gapSeconds !== "number"
    || !Array.isArray(value.config.allowedDirectHosts) || !Array.isArray(value.config.audioDeviceIds) || !Array.isArray(value.config.rewardMappings)
    || typeof value.config.obsAudio !== "boolean" || typeof value.config.streamerBotAutoplay !== "boolean") {
    throw new TypeError("Videos settings returned an invalid response. Reload and retry.");
  }
  const layout = value.config.layout;
  // Placement is rendered and saved as-is, so a missing or partial box fails closed.
  if (!isRecord(layout) || !["x", "y", "width", "height"].every(key => typeof layout[key] === "number")) {
    throw new TypeError("Videos settings returned an invalid response. Reload and retry.");
  }
  const delays = value.config.audioDeviceDelaysMs;
  if (delays !== undefined && (!isRecord(delays) || !Object.values(delays).every(delay => typeof delay === "number"))) {
    throw new TypeError("Videos settings returned an invalid response. Reload and retry.");
  }
  return { enabled: value.enabled, config: { ...value.config, audioDeviceDelaysMs: delays ?? {} } as unknown as VideosModuleConfig };
}

function parseBrowserSource(value: unknown): readonly VideosBrowserSource[] {
  if (!isRecord(value) || value.scope !== "module" || value.moduleId !== "videos" || value.targetProfileId !== null) return [];
  if (typeof value.id !== "string" || typeof value.label !== "string" || (value.purpose !== "live" && value.purpose !== "test")
    || typeof value.overlayId !== "string" || typeof value.enabled !== "boolean" || (value.url !== null && typeof value.url !== "string")
    || !["available", "create-required", "regenerate-required"].includes(String(value.copyableUrlStatus))) return [];
  return [{ id: value.id, label: value.label, purpose: value.purpose, overlayId: value.overlayId, enabled: value.enabled,
    url: value.url as string | null, status: value.copyableUrlStatus as VideosBrowserSource["status"] }];
}

function outputRequest(source: VideosBrowserSource) {
  return { overlayId: source.overlayId, scope: "module", moduleId: "videos", purpose: source.purpose, targetProfileId: null };
}
