import {
  moduleOverlayPath,
  isOrdinaryOverlayOutput,
  type CreateOverlayKeyInput,
  type OverlayAccessKey,
  type OverlayAccessKeyRepository,
  type OverlayAccessService,
  type OverlayModuleConfigService,
  type OverlayModuleRegistry,
  type OverlayOutputKeyResult,
  type OverlayOutputView,
  type OverlayTargetProfileId,
  type SecretRef,
  type SecretStore
} from "@stream-jams/core";

const defaultOverlayId = "default";
const alertTargetProfileIds = ["landscape", "vertical"] as const satisfies readonly OverlayTargetProfileId[];

export interface OverlayOutputManagementServiceOptions {
  readonly listLegacyKeys?: () => Promise<readonly OverlayAccessKey[]>;
  readonly onKeyRevoked?: (keyId: string) => void;
  readonly onCleanupFailure?: () => Promise<void>;
  readonly getCanvas?: (moduleId: string, profile: OverlayTargetProfileId | null | undefined) => Promise<import("@stream-jams/core").OutputCanvas>;
  readonly overlayAccessService: Pick<OverlayAccessService, "createKey" | "revokeKey">;
  readonly overlayKeyRepository: Pick<OverlayAccessKeyRepository, "findByOutput" | "findById">;
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "getModule" | "listModules">;
  readonly overlayModuleConfigService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly secretStore: Pick<SecretStore, "setSecret" | "getSecret" | "deleteSecret">;
}

export class OverlayOutputManagementService {
  readonly #options: OverlayOutputManagementServiceOptions;
  readonly #getCanvas: OverlayOutputManagementServiceOptions["getCanvas"];
  readonly #overlayAccessService: Pick<OverlayAccessService, "createKey" | "revokeKey">;
  readonly #overlayKeyRepository: Pick<OverlayAccessKeyRepository, "findByOutput" | "findById">;
  readonly #overlayModuleRegistry: Pick<OverlayModuleRegistry, "getModule" | "listModules">;
  readonly #overlayModuleConfigService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly #secretStore: Pick<SecretStore, "setSecret" | "getSecret" | "deleteSecret">;

  constructor(options: OverlayOutputManagementServiceOptions) {
    this.#options = options;
    this.#getCanvas = options.getCanvas;
    this.#overlayAccessService = options.overlayAccessService;
    this.#overlayKeyRepository = options.overlayKeyRepository;
    this.#overlayModuleRegistry = options.overlayModuleRegistry;
    this.#overlayModuleConfigService = options.overlayModuleConfigService;
    this.#secretStore = options.secretStore;
  }

  async listOutputs(origin: string): Promise<readonly OverlayOutputView[]> {
    const outputs: OverlayOutputView[] = [];
    for (const moduleDefinition of this.#overlayModuleRegistry.listModules()) {
      if (!moduleDefinition.renderer.supportedOutputs.includes("module")) {
        continue;
      }

      const config = await this.#overlayModuleConfigService.getModuleConfig(moduleDefinition.id);
      const targetProfileIds: readonly (OverlayTargetProfileId | null)[] =
        moduleDefinition.id === "alerts" || moduleDefinition.id === "timers" || moduleDefinition.id === "music"
          ? alertTargetProfileIds
          : [null];
      for (const targetProfileId of targetProfileIds) {
        const input = {
          overlayId: defaultOverlayId,
          scope: "module" as const,
          moduleId: moduleDefinition.id,
          purpose: "live" as const,
          targetProfileId
        };
        if (!isOrdinaryOverlayOutput(input)) continue;
        outputs.push(await this.#toOutputView(input, this.#labelFor(input), config.enabled, origin));
      }
    }

    return outputs;
  }

  async listLegacyKeys() {
    return (await this.#options.listLegacyKeys?.() ?? []).filter(key =>
      isOrdinaryOverlayOutput(key, true) && !isOrdinaryOverlayOutput(key) && key.revokedAt === null
    ).map(key => ({ keyId: key.id, moduleId: key.moduleId, createdAt: key.createdAt }));
  }

  async createKey(input: CreateOverlayKeyInput, origin: string): Promise<OverlayOutputKeyResult> {
    this.#assertKnownOutput(input);
    const created = await this.#overlayAccessService.createKey(input);
    try {
      await this.#storeRouteKey(created.record, created.rawKey);
    } catch (error) {
      await this.revokeKey(created.record.id);
      throw error;
    }

    return {
      keyId: created.record.id,
      url: this.#urlFor(input, created.rawKey, origin),
      output: await this.#toOutputView(input, this.#labelFor(input), true, origin)
    };
  }

  async regenerateKey(input: CreateOverlayKeyInput, origin: string): Promise<OverlayOutputKeyResult> {
    this.#assertKnownOutput(input);
    const currentKeys = await this.#overlayKeyRepository.findByOutput(input);
    const replacement = await this.createKey(input, origin);
    for (const key of currentKeys.filter((candidate) => candidate.revokedAt === null)) {
      await this.revokeKey(key.id);
    }

    return {
      ...replacement,
      output: await this.#toOutputView(input, this.#labelFor(input), true, origin)
    };
  }

  async revokeKey(keyId: string): Promise<OverlayAccessKey | null> {
    const revoked = await this.#overlayAccessService.revokeKey(keyId);
    if (revoked === null) return null;
    this.#options.onKeyRevoked?.(keyId);
    const ref = revoked.routeKeySecretRef;
    if (ref?.namespace === "overlay" && ref.accountId === keyId && ref.name === "route-key") {
      try { await this.#secretStore.deleteSecret(ref); }
      // error-provenance: allow cleanup -- database authority is already revoked; keyring cleanup cannot reactivate it
      catch { await this.#options.onCleanupFailure?.(); }
    }
    return revoked;
  }

  async #toOutputView(
    input: CreateOverlayKeyInput,
    label: string,
    enabled: boolean,
    origin: string
  ): Promise<OverlayOutputView> {
    const canvas = input.moduleId === null ? undefined : await this.#getCanvas?.(input.moduleId, input.targetProfileId);
    const activeKey = (await this.#overlayKeyRepository.findByOutput(input)).find((key) => key.revokedAt === null);
    if (activeKey === undefined) {
      return {
        ...input,
        ...(canvas === undefined ? {} : { canvas }),
        id: outputId(input),
        label,
        enabled,
        keyId: null,
        url: null,
        copyableUrlStatus: "create-required"
      };
    }

    const rawKey = await this.#readRouteKey(activeKey.routeKeySecretRef);
    return {
      ...input,
      ...(canvas === undefined ? {} : { canvas }),
      id: outputId(input),
      label,
      enabled,
      keyId: activeKey.id,
      url: rawKey === null ? null : this.#urlFor(input, rawKey, origin),
      copyableUrlStatus: rawKey === null ? "regenerate-required" : "available"
    };
  }

  #assertKnownOutput(input: CreateOverlayKeyInput): void {
    if (!isOrdinaryOverlayOutput(input)) throw new UnknownOverlayOutputError(input);
    const moduleDefinition = input.moduleId === null ? null : this.#overlayModuleRegistry.getModule(input.moduleId);
    if (moduleDefinition === null || !moduleDefinition.renderer.supportedOutputs.includes("module")) {
      throw new UnknownOverlayOutputError(input);
    }
  }

  async #storeRouteKey(record: OverlayAccessKey, rawKey: string): Promise<void> {
    if (record.routeKeySecretRef === null) {
      throw new UnrecoverableOverlayRouteKeyError(record.id);
    }

    await this.#secretStore.setSecret(record.routeKeySecretRef, rawKey);
  }

  async #readRouteKey(ref: SecretRef | null): Promise<string | null> {
    return ref === null ? null : this.#secretStore.getSecret(ref);
  }

  #urlFor(input: CreateOverlayKeyInput, rawKey: string, origin: string): string {
    if (input.moduleId === null) throw new UnknownOverlayOutputError(input);
    const path = moduleOverlayPath({
      moduleId: input.moduleId,
      purpose: input.purpose,
      overlayKey: rawKey,
      ...(input.targetProfileId === undefined ? {} : { targetProfileId: input.targetProfileId })
    });
    return `${origin}${path}`;
  }

  #labelFor(input: CreateOverlayKeyInput): string {
    const moduleDefinition = input.moduleId === null ? null : this.#overlayModuleRegistry.getModule(input.moduleId);
    const profileLabel = input.targetProfileId === null || input.targetProfileId === undefined
      ? ""
      : ` ${capitalize(input.targetProfileId)}`;
    return `${moduleDefinition?.displayName ?? input.moduleId ?? "Module"}${profileLabel} ${capitalize(input.purpose)}`;
  }
}

export class UnknownOverlayOutputError extends Error {
  readonly code = "OVERLAY_OUTPUT_NOT_FOUND";

  constructor(readonly output: CreateOverlayKeyInput) {
    super("Overlay output not found");
  }
}

export class UnrecoverableOverlayRouteKeyError extends Error {
  readonly code = "OVERLAY_ROUTE_KEY_UNRECOVERABLE";

  constructor(readonly keyId: string) {
    super("Overlay route key is not recoverable");
  }
}

export function createOverlayRouteKeySecretRef(keyId: string): SecretRef {
  return {
    namespace: "overlay",
    accountId: keyId,
    name: "route-key"
  };
}

function outputId(input: CreateOverlayKeyInput): string {
  return input.targetProfileId === null || input.targetProfileId === undefined
    ? `module:${input.moduleId}:${input.purpose}`
    : `module:${input.moduleId}:${input.targetProfileId}:${input.purpose}`;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
