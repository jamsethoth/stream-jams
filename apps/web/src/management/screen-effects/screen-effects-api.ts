import {
  screenEffectDocumentSchema,
  type ScreenEffectDocument
} from "@stream-jams/core";
import {
  createManagementHttpClient,
  type HttpManagementClientOptions
} from "../management-http-client.js";

export type EffectLiveTestStatus = "queued" | "full" | "no-output" | "missing-reference";

export interface EffectLiveTestResult {
  readonly effectId: string;
  readonly status: EffectLiveTestStatus;
  readonly occurrenceId?: string;
}

export interface ScreenEffectBrowserSource {
  readonly id: string;
  readonly label: string;
  readonly purpose: "live" | "test";
  readonly enabled: boolean;
  readonly status: "available" | "create-required" | "regenerate-required";
}

export interface ScreenEffectsApi {
  list(): Promise<readonly ScreenEffectDocument[]>;
  listBrowserSources(): Promise<readonly ScreenEffectBrowserSource[]>;
  get(effectId: string): Promise<ScreenEffectDocument>;
  create(document: ScreenEffectDocument): Promise<ScreenEffectDocument>;
  update(
    effectId: string,
    document: ScreenEffectDocument,
    confirmLiveImpact: boolean
  ): Promise<ScreenEffectDocument>;
  remove(effectId: string): Promise<void>;
  test(effectId: string, variantId: string, confirmLiveImpact: true): Promise<EffectLiveTestResult>;
}

export function createHttpScreenEffectsApi(options: HttpManagementClientOptions = {}): ScreenEffectsApi {
  const client = createManagementHttpClient(options);
  const path = (effectId: string) => `/screen-effects/${encodeURIComponent(effectId)}`;
  return {
    async list() {
      const response = await client.getJson<unknown>("/screen-effects", "Unable to load Screen Effects.");
      if (!Array.isArray(response)) throw new TypeError("Expected a Screen Effects response array");
      return response.map((item) => screenEffectDocumentSchema.parse(item));
    },
    async listBrowserSources() {
      const response = await client.getJson<unknown>(
        "/management/overlay-outputs",
        "Unable to load Screen Effects Browser Sources."
      );
      if (!Array.isArray(response)) throw new TypeError("Expected a Browser Sources response array");
      return response.flatMap((candidate) => parseBrowserSource(candidate));
    },
    async get(effectId) {
      return screenEffectDocumentSchema.parse(
        await client.getJson(path(effectId), "Unable to load the Screen Effect.")
      );
    },
    async create(document) {
      const candidate = screenEffectDocumentSchema.parse(document);
      return screenEffectDocumentSchema.parse(
        await client.postJson("/screen-effects", candidate, "Unable to create the Screen Effect.")
      );
    },
    async update(effectId, document, confirmLiveImpact) {
      const candidate = screenEffectDocumentSchema.parse(document);
      return screenEffectDocumentSchema.parse(await client.putJson(
        path(effectId),
        { document: candidate, confirmLiveImpact },
        "Unable to save the Screen Effect."
      ));
    },
    async remove(effectId) {
      await client.deleteRequest(path(effectId), "Unable to delete the Screen Effect.");
    },
    async test(effectId, variantId, confirmLiveImpact) {
      const response = await client.postJson<unknown>(
        `${path(effectId)}/test`,
        { variantId, confirmLiveImpact },
        "Unable to send the Screen Effect test."
      );
      return parseTestResult(response);
    }
  };
}

function parseTestResult(candidate: unknown): EffectLiveTestResult {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError("The Screen Effect test returned an invalid response");
  }
  const value = candidate as Record<string, unknown>;
  if (
    typeof value.effectId !== "string"
    || !["queued", "full", "no-output", "missing-reference"].includes(String(value.status))
    || (value.occurrenceId !== undefined && typeof value.occurrenceId !== "string")
  ) {
    throw new TypeError("The Screen Effect test returned an invalid response");
  }
  return {
    effectId: value.effectId,
    status: value.status as EffectLiveTestStatus,
    ...(typeof value.occurrenceId === "string" ? { occurrenceId: value.occurrenceId } : {})
  };
}

function parseBrowserSource(candidate: unknown): readonly ScreenEffectBrowserSource[] {
  if (typeof candidate !== "object" || candidate === null) return [];
  const value = candidate as Record<string, unknown>;
  if (value.scope !== "module" || value.moduleId !== "screen-effects") return [];
  if (
    typeof value.id !== "string"
    || typeof value.label !== "string"
    || (value.purpose !== "live" && value.purpose !== "test")
    || typeof value.enabled !== "boolean"
    || !["available", "create-required", "regenerate-required"].includes(String(value.copyableUrlStatus))
  ) return [];
  return [{
    id: value.id,
    label: value.label,
    purpose: value.purpose,
    enabled: value.enabled,
    status: value.copyableUrlStatus as ScreenEffectBrowserSource["status"]
  }];
}

export const defaultScreenEffectsApi = createHttpScreenEffectsApi();
