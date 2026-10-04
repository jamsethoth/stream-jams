import {
  musicCredentialReplacementInputSchema,
  musicCredentialReplacementResultSchema,
  musicManagementStatusSchema,
  musicPairingAttemptViewSchema,
  musicModuleConfigSchema,
  pearConfigurationSchema,
  type MusicCredentialReplacementInput,
  type MusicCredentialReplacementResult,
  type MusicManagementStatus,
  type MusicPairingAttemptView,
  type PearConfiguration,
  type MusicModuleConfig,
  type OverlayOutputView,
} from "@stream-jams/core";
import type { ManagementHttpClient } from "../management-http-client.js";

export interface MusicApi {
  getMusicConfig(): Promise<{ readonly enabled: boolean; readonly config: MusicModuleConfig }>;
  saveMusicConfig(enabled: boolean, config: MusicModuleConfig): Promise<{ readonly enabled: boolean; readonly config: MusicModuleConfig }>;
  listMusicOutputs(): Promise<readonly OverlayOutputView[]>;
  beginMusicPairing(config: PearConfiguration): Promise<MusicPairingAttemptView>;
  getMusicPairing(attemptId: string): Promise<MusicPairingAttemptView>;
  cancelMusicPairing(attemptId: string): Promise<void>;
  getMusicStatus(): Promise<MusicManagementStatus>;
  reconnectMusicSource(providerId: string): Promise<MusicManagementStatus>;
  replaceMusicCredential(providerId: string, input: MusicCredentialReplacementInput): Promise<MusicCredentialReplacementResult>;
}

export function createMusicApi(client: ManagementHttpClient): MusicApi {
  return {
    async getMusicConfig() {
      return parseMusicConfig(await client.getJson<unknown>("/overlay-modules/music/config", "Unable to load Music appearance."));
    },
    async saveMusicConfig(enabled, config) {
      return parseMusicConfig(await client.putJson<unknown>("/overlay-modules/music/config", { enabled, config: musicModuleConfigSchema.parse(config) }, "Unable to save Music appearance."));
    },
    async listMusicOutputs() {
      const response = await client.getJson<unknown>("/management/overlay-outputs", "Unable to load Music output links.");
      if (!Array.isArray(response)) throw new Error("Music output response is invalid. Reload the page and retry.");
      const music = response.filter(item => typeof item === "object" && item !== null && "moduleId" in item && item.moduleId === "music");
      if (!music.every(isMusicOutput)) throw new Error("Music output response is invalid. Reload the page and retry.");
      return music;
    },
    async beginMusicPairing(config) {
      return musicPairingAttemptViewSchema.parse(await client.postJson<unknown>("/management/music/pairing", pearConfigurationSchema.parse(config), "Unable to start Pear pairing."));
    },
    async getMusicPairing(attemptId) {
      return musicPairingAttemptViewSchema.parse(await client.getJson<unknown>(`/management/music/pairing/${encodeURIComponent(attemptId)}`, "Unable to check Pear pairing."));
    },
    cancelMusicPairing(attemptId) {
      return client.deleteRequest(`/management/music/pairing/${encodeURIComponent(attemptId)}`, "Unable to cancel Pear pairing.");
    },
    async getMusicStatus() {
      return musicManagementStatusSchema.parse(await client.getJson<unknown>("/management/music/status", "Unable to load Music status."));
    },
    async reconnectMusicSource(providerId) {
      return musicManagementStatusSchema.parse(await client.postJson<unknown>(`/management/music/providers/${encodeURIComponent(providerId)}/reconnect`, undefined, "Unable to reconnect Music source."));
    },
    async replaceMusicCredential(providerId, input) {
      return musicCredentialReplacementResultSchema.parse(await client.postJson<unknown>(`/management/music/providers/${encodeURIComponent(providerId)}/credential`, musicCredentialReplacementInputSchema.parse(input), "Unable to replace Pear authorization."));
    }
  };
}

function isMusicOutput(value: unknown): value is OverlayOutputView {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return item.moduleId === "music" && item.scope === "module" && (item.purpose === "live" || item.purpose === "test")
    && (item.targetProfileId === "landscape" || item.targetProfileId === "vertical")
    && typeof item.id === "string" && typeof item.label === "string" && typeof item.overlayId === "string" && typeof item.enabled === "boolean"
    && (item.keyId === null || typeof item.keyId === "string") && (item.url === null || typeof item.url === "string")
    && ["available", "create-required", "regenerate-required"].includes(String(item.copyableUrlStatus))
    && (item.copyableUrlStatus !== "available" || (typeof item.url === "string" && URL.canParse(item.url) && ["http:", "https:"].includes(new URL(item.url).protocol)));
}

function parseMusicConfig(value: unknown) {
  if (typeof value !== "object" || value === null || !("enabled" in value) || !("config" in value) || typeof value.enabled !== "boolean") {
    throw new Error("Music appearance response is invalid. Reload the page and retry.");
  }
  return { enabled: value.enabled, config: musicModuleConfigSchema.parse(value.config) };
}
