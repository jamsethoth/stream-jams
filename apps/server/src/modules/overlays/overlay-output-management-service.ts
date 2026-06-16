import {
  moduleOverlayPath,
  unifiedOverlayPath,
  type CreateOverlayKeyInput,
  type OverlayAccessKey,
  type OverlayAccessKeyRepository,
  type OverlayAccessService,
  type OverlayModuleConfigService,
  type OverlayModuleRegistry,
  type OverlayOutputKeyResult,
  type OverlayOutputView,
  type OverlayPurpose,
  type SecretRef,
  type SecretStore
} from "@stream-jams/core";

const defaultOverlayId = "default";
const purposes = ["live", "test"] as const satisfies readonly OverlayPurpose[];

export interface OverlayOutputManagementServiceOptions {
  readonly overlayAccessService: Pick<OverlayAccessService, "createKey" | "revokeKey">;
  readonly overlayKeyRepository: Pick<OverlayAccessKeyRepository, "findByOutput" | "findById">;
  readonly overlayModuleRegistry: Pick<OverlayModuleRegistry, "getModule" | "listModules">;
  readonly overlayModuleConfigService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly secretStore: Pick<SecretStore, "setSecret" | "getSecret" | "deleteSecret">;
}

export class OverlayOutputManagementService {
  readonly #overlayAccessService: Pick<OverlayAccessService, "createKey" | "revokeKey">;
  readonly #overlayKeyRepository: Pick<OverlayAccessKeyRepository, "findByOutput" | "findById">;
  readonly #overlayModuleRegistry: Pick<OverlayModuleRegistry, "getModule" | "listModules">;
  readonly #overlayModuleConfigService: Pick<OverlayModuleConfigService, "getModuleConfig">;
  readonly #secretStore: Pick<SecretStore, "setSecret" | "getSecret" | "deleteSecret">;

  constructor(options: OverlayOutputManagementServiceOptions) {
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
      for (const purpose of purposes) {
        outputs.push(
          await this.#toOutputView(
            {
              overlayId: defaultOverlayId,
              scope: "module",
              moduleId: moduleDefinition.id,
              purpose
            },
            `${moduleDefinition.displayName} ${capitalize(purpose)}`,
            config.enabled,
            origin
          )
        );
      }
    }

    for (const purpose of purposes) {
      outputs.push(
        await this.#toOutputView(
          {
            overlayId: defaultOverlayId,
            scope: "unified",
            moduleId: null,
            purpose
          },
          `Unified ${capitalize(purpose)}`,
          true,
          origin
        )
      );
    }

    return outputs;
  }

  async createKey(input: CreateOverlayKeyInput, origin: string): Promise<OverlayOutputKeyResult> {
    this.#assertKnownOutput(input);
    const created = await this.#overlayAccessService.createKey(input);
    await this.#storeRouteKey(created.record, created.rawKey);

    return {
      keyId: created.record.id,
      url: this.#urlFor(input, created.rawKey, origin),
      output: await this.#toOutputView(input, this.#labelFor(input), true, origin)
    };
  }

  async regenerateKey(input: CreateOverlayKeyInput, origin: string): Promise<OverlayOutputKeyResult> {
    this.#assertKnownOutput(input);
    const currentKeys = await this.#overlayKeyRepository.findByOutput(input);
    for (const key of currentKeys.filter((candidate) => candidate.revokedAt === null)) {
      await this.#overlayAccessService.revokeKey(key.id);
      if (key.routeKeySecretRef !== null) {
        await this.#secretStore.deleteSecret(key.routeKeySecretRef);
      }
    }

    return this.createKey(input, origin);
  }

  async revokeKey(keyId: string): Promise<OverlayAccessKey | null> {
    const existing = await this.#overlayKeyRepository.findById(keyId);
    if (existing?.routeKeySecretRef !== null && existing?.routeKeySecretRef !== undefined) {
      await this.#secretStore.deleteSecret(existing.routeKeySecretRef);
    }

    return this.#overlayAccessService.revokeKey(keyId);
  }

  async #toOutputView(
    input: CreateOverlayKeyInput,
    label: string,
    enabled: boolean,
    origin: string
  ): Promise<OverlayOutputView> {
    const activeKey = (await this.#overlayKeyRepository.findByOutput(input)).find((key) => key.revokedAt === null);
    if (activeKey === undefined) {
      return {
        ...input,
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
      id: outputId(input),
      label,
      enabled,
      keyId: activeKey.id,
      url: rawKey === null ? null : this.#urlFor(input, rawKey, origin),
      copyableUrlStatus: rawKey === null ? "regenerate-required" : "available"
    };
  }

  #assertKnownOutput(input: CreateOverlayKeyInput): void {
    if (input.scope === "module") {
      const moduleDefinition = input.moduleId === null ? null : this.#overlayModuleRegistry.getModule(input.moduleId);
      if (moduleDefinition === null || !moduleDefinition.renderer.supportedOutputs.includes("module")) {
        throw new UnknownOverlayOutputError(input);
      }
      return;
    }

    if (input.moduleId !== null) {
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
    const path =
      input.scope === "module"
        ? moduleOverlayPath({ moduleId: input.moduleId ?? "", purpose: input.purpose, overlayKey: rawKey })
        : unifiedOverlayPath({ purpose: input.purpose, overlayKey: rawKey });
    return `${origin}${path}`;
  }

  #labelFor(input: CreateOverlayKeyInput): string {
    if (input.scope === "unified") {
      return `Unified ${capitalize(input.purpose)}`;
    }

    const moduleDefinition = input.moduleId === null ? null : this.#overlayModuleRegistry.getModule(input.moduleId);
    return `${moduleDefinition?.displayName ?? input.moduleId ?? "Module"} ${capitalize(input.purpose)}`;
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
  return input.scope === "module" ? `module:${input.moduleId}:${input.purpose}` : `unified:${input.purpose}`;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
