import {
  audioOutputRouteCreateSchema,
  audioOutputRoutePatchSchema,
  audioOutputRouteSchema,
  audioOutputStatusSchema,
  audioRouteIdSchema,
  type AudioOutputRoute,
  type AudioOutputStatus
} from "@stream-jams/core";
import {
  createManagementHttpClient,
  type HttpManagementClientOptions
} from "../management-http-client.js";

export type AudioRouteCreateInput = {
  readonly name: string;
  readonly deviceId: string | null;
};

export type AudioRouteUpdateInput = {
  readonly name?: string | undefined;
  readonly deviceId?: string | null | undefined;
  readonly confirmLiveImpact?: boolean | undefined;
};

export interface AudioRouteTestResult {
  readonly routeId: string;
  readonly muted: boolean;
}

export interface AudioApi {
  getStatus(): Promise<AudioOutputStatus>;
  createRoute(input: AudioRouteCreateInput): Promise<AudioOutputRoute>;
  updateRoute(routeId: string, input: AudioRouteUpdateInput): Promise<AudioOutputRoute>;
  deleteRoute(routeId: string): Promise<void>;
  testRoute(routeId: string): Promise<AudioRouteTestResult>;
  retry(): Promise<void>;
}

export function createHttpAudioApi(options: HttpManagementClientOptions = {}): AudioApi {
  const client = createManagementHttpClient(options);
  const routePath = (routeId: string) => `/audio/routes/${encodeURIComponent(audioRouteIdSchema.parse(routeId))}`;

  return {
    async getStatus() {
      return audioOutputStatusSchema.parse(await client.getJson("/audio/status", "Unable to load audio outputs."));
    },
    async createRoute(input) {
      const body = audioOutputRouteCreateSchema.parse(input);
      return audioOutputRouteSchema.parse(await client.postJson("/audio/routes", body, "Unable to create the audio output."));
    },
    async updateRoute(routeId, input) {
      const body = audioOutputRoutePatchSchema.parse({ confirmLiveImpact: false, ...input });
      return audioOutputRouteSchema.parse(await client.patchJson(routePath(routeId), body, "Unable to save the audio output."));
    },
    async deleteRoute(routeId) {
      await client.deleteRequest(routePath(routeId), "Unable to delete the audio output.");
    },
    async testRoute(routeId) {
      return parseTestResult(await client.postJson(`${routePath(routeId)}/test`, undefined, "Unable to test the audio output."));
    },
    async retry() {
      await client.postRequest("/audio/retry", "Unable to retry the audio player.");
    }
  };
}

function parseTestResult(candidate: unknown): AudioRouteTestResult {
  if (typeof candidate !== "object" || candidate === null) throw new Error("The audio test returned an invalid response.");
  if (!("routeId" in candidate) || !("muted" in candidate)) throw new Error("The audio test returned an invalid response.");
  return {
    routeId: audioRouteIdSchema.parse(candidate.routeId),
    muted: typeof candidate.muted === "boolean"
      ? candidate.muted
      : (() => { throw new Error("The audio test returned an invalid response."); })()
  };
}

export const defaultAudioApi: AudioApi = createHttpAudioApi();
