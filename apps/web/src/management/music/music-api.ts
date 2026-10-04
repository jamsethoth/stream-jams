import {
  musicCredentialReplacementInputSchema,
  musicCredentialReplacementResultSchema,
  musicManagementStatusSchema,
  musicPairingAttemptViewSchema,
  pearConfigurationSchema,
  type MusicCredentialReplacementInput,
  type MusicCredentialReplacementResult,
  type MusicManagementStatus,
  type MusicPairingAttemptView,
  type PearConfiguration,
} from "@stream-jams/core";
import type { ManagementHttpClient } from "../management-http-client.js";

export interface MusicApi {
  beginMusicPairing(config: PearConfiguration): Promise<MusicPairingAttemptView>;
  getMusicPairing(attemptId: string): Promise<MusicPairingAttemptView>;
  cancelMusicPairing(attemptId: string): Promise<void>;
  getMusicStatus(): Promise<MusicManagementStatus>;
  reconnectMusicSource(providerId: string): Promise<MusicManagementStatus>;
  replaceMusicCredential(providerId: string, input: MusicCredentialReplacementInput): Promise<MusicCredentialReplacementResult>;
}

export function createMusicApi(client: ManagementHttpClient): MusicApi {
  return {
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
