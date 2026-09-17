import {
  screenEffectDocumentSchema,
  screenEffectSetSchema,
  screenEffectSetInputSchema,
  type ScreenEffectSet,
  type ScreenEffectSetInput,
  type ScreenEffectDocument
} from "@stream-jams/core";
import {
  createManagementHttpClient,
  type HttpManagementClientOptions
} from "../management-http-client.js";

export type EffectLiveTestStatus =
  | "queued"
  | "full"
  | "no-output"
  | "missing-reference"
  | "unavailable-output"
  | "module-disabled";

export interface EffectLiveTestResult {
  readonly effectId: string;
  readonly status: EffectLiveTestStatus;
  readonly occurrenceId?: string;
}

export interface ScreenEffectBrowserSource {
  readonly id: string;
  readonly label: string;
  readonly purpose: "live" | "test";
  readonly overlayId: string;
  readonly scope: "module";
  readonly moduleId: "screen-effects";
  readonly targetProfileId: null;
  readonly enabled: boolean;
  readonly keyId: string | null;
  readonly url: string | null;
  readonly status: "available" | "create-required" | "regenerate-required";
}

export interface ScreenEffectsApi {
  listSets(): Promise<readonly ScreenEffectSet[]>;
  createSet(input: ScreenEffectSetInput, sourceId?: string): Promise<ScreenEffectSet>;
  renameSet(id: string, name: string): Promise<ScreenEffectSet>;
  activateSet(id: string): Promise<void>;
  removeSet(id: string): Promise<void>;
  list(): Promise<readonly ScreenEffectDocument[]>;
  listBrowserSources(): Promise<readonly ScreenEffectBrowserSource[]>;
  getModuleEnabled(): Promise<boolean>;
  setModuleEnabled(enabled: boolean): Promise<boolean>;
  createBrowserSource(source: ScreenEffectBrowserSource): Promise<ScreenEffectBrowserSource>;
  regenerateBrowserSource(source: ScreenEffectBrowserSource): Promise<ScreenEffectBrowserSource>;
  get(effectId: string): Promise<ScreenEffectDocument>;
  create(document: ScreenEffectDocument, setId?: string): Promise<ScreenEffectDocument>;
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
    async listSets() {
      return screenEffectSetSchema.array().parse(await client.getJson("/screen-effect-sets", "Unable to load Screen Effect sets."));
    },
    async createSet(input, sourceId) {
      return screenEffectSetSchema.parse(await client.postJson("/screen-effect-sets", {
        ...screenEffectSetInputSchema.parse(input), ...(sourceId === undefined ? {} : { sourceId })
      }, "Unable to create Screen Effect set."));
    },
    async renameSet(id, name) {
      return screenEffectSetSchema.parse(await client.putJson(`/screen-effect-sets/${encodeURIComponent(id)}`, { name }, "Unable to rename Screen Effect set."));
    },
    async activateSet(id) {
      await client.postRequest(`/screen-effect-sets/${encodeURIComponent(id)}/activate`, "Unable to activate Screen Effect set.", { confirmLiveImpact: true });
    },
    async removeSet(id) {
      await client.deleteRequest(`/screen-effect-sets/${encodeURIComponent(id)}`, "Unable to delete Screen Effect set.");
    },
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
    async getModuleEnabled() {
      return parseModuleEnabled(await client.getJson(
        "/overlay-modules/screen-effects/config",
        "Unable to load the Screen Effects module status."
      ));
    },
    async setModuleEnabled(enabled) {
      return parseModuleEnabled(await client.patchJson(
        "/overlay-modules/screen-effects/enabled",
        { enabled },
        `Unable to ${enabled ? "enable" : "disable"} the Screen Effects module.`
      ));
    },
    async createBrowserSource(source) {
      return parseBrowserSourceMutation(await client.postJson(
        "/management/overlay-outputs/keys",
        outputRequest(source),
        "Unable to create the Screen Effects Browser Source URL."
      ));
    },
    async regenerateBrowserSource(source) {
      return parseBrowserSourceMutation(await client.postJson(
        "/management/overlay-outputs/keys/regenerate",
        outputRequest(source),
        "Unable to regenerate the Screen Effects Browser Source URL."
      ));
    },
    async get(effectId) {
      return screenEffectDocumentSchema.parse(
        await client.getJson(path(effectId), "Unable to load the Screen Effect.")
      );
    },
    async create(document, setId) {
      const candidate = screenEffectDocumentSchema.parse(document);
      return screenEffectDocumentSchema.parse(
        await client.postJson(setId === undefined ? "/screen-effects" : `/screen-effects?set=${encodeURIComponent(setId)}`, candidate, "Unable to create the Screen Effect.")
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
    || !["queued", "full", "no-output", "missing-reference", "unavailable-output", "module-disabled"].includes(String(value.status))
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
    || typeof value.overlayId !== "string"
    || value.targetProfileId !== null
    || (value.keyId !== null && typeof value.keyId !== "string")
    || (value.url !== null && typeof value.url !== "string")
    || !["available", "create-required", "regenerate-required"].includes(String(value.copyableUrlStatus))
  ) return [];
  return [{
    id: value.id,
    label: value.label,
    purpose: value.purpose,
    overlayId: value.overlayId,
    scope: "module",
    moduleId: "screen-effects",
    targetProfileId: null,
    enabled: value.enabled,
    keyId: value.keyId as string | null,
    url: value.url as string | null,
    status: value.copyableUrlStatus as ScreenEffectBrowserSource["status"]
  }];
}

function parseModuleEnabled(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError("The Screen Effects module returned an invalid response");
  }
  const value = candidate as Record<string, unknown>;
  if (value.moduleId !== "screen-effects" || typeof value.enabled !== "boolean") {
    throw new TypeError("The Screen Effects module returned an invalid response");
  }
  return value.enabled;
}

function parseBrowserSourceMutation(candidate: unknown): ScreenEffectBrowserSource {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError("The Screen Effects Browser Source returned an invalid response");
  }
  const parsed = parseBrowserSource((candidate as Record<string, unknown>).output)[0];
  if (parsed === undefined) {
    throw new TypeError("The Screen Effects Browser Source returned an invalid response");
  }
  return parsed;
}

function outputRequest(source: ScreenEffectBrowserSource) {
  return {
    overlayId: source.overlayId,
    scope: source.scope,
    moduleId: source.moduleId,
    purpose: source.purpose,
    targetProfileId: source.targetProfileId
  };
}

export const defaultScreenEffectsApi = createHttpScreenEffectsApi();
