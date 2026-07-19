import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  CreateOverlayKeyInput,
  CreatedOverlayAccessKey,
  OverlayAccessKey,
  OverlayAccessKeyCreateRecordInput,
  OverlayAccessKeyRepository,
  OverlayAccessService,
  OverlayAccessVerification,
  OverlayRouteAccessRequest,
  SecretRef
} from "@stream-jams/core";

export interface LocalOverlayAccessServiceOptions {
  readonly repository?: OverlayAccessKeyRepository;
  readonly clock?: () => Date;
  readonly generateId?: () => string;
  readonly generateRawKey?: () => string;
  readonly createRouteKeySecretRef?: (keyId: string) => SecretRef;
}

/** Stores MVP overlay access records in process memory while preserving hash-only key storage. */
export class InMemoryOverlayAccessKeyRepository implements OverlayAccessKeyRepository {
  readonly #records = new Map<string, OverlayAccessKey>();

  get records(): readonly OverlayAccessKey[] {
    return Array.from(this.#records.values());
  }

  async create(input: OverlayAccessKeyCreateRecordInput): Promise<OverlayAccessKey> {
    const record: OverlayAccessKey = {
      ...input,
      targetProfileId: input.targetProfileId ?? null,
      revokedAt: null
    };
    this.#records.set(record.id, record);
    return record;
  }

  async findById(keyId: string): Promise<OverlayAccessKey | null> {
    return this.#records.get(keyId) ?? null;
  }

  async findCandidates(overlayId: string): Promise<readonly OverlayAccessKey[]> {
    return this.records.filter((record) => record.overlayId === overlayId);
  }

  async findByOutput(input: CreateOverlayKeyInput): Promise<readonly OverlayAccessKey[]> {
    return this.records.filter(
      (record) =>
        record.overlayId === input.overlayId &&
        record.scope === input.scope &&
        record.moduleId === input.moduleId &&
        (record.targetProfileId ?? null) === (input.targetProfileId ?? null) &&
        record.purpose === input.purpose
    );
  }

  async update(record: OverlayAccessKey): Promise<OverlayAccessKey | null> {
    if (!this.#records.has(record.id)) {
      return null;
    }

    this.#records.set(record.id, record);
    return record;
  }
}

/** Creates and verifies scoped overlay route keys without exposing raw keys after creation. */
export class LocalOverlayAccessService implements OverlayAccessService {
  readonly #repository: OverlayAccessKeyRepository;
  readonly #clock: () => Date;
  readonly #generateId: () => string;
  readonly #generateRawKey: () => string;
  readonly #createRouteKeySecretRef: (keyId: string) => SecretRef | null;

  constructor(options: LocalOverlayAccessServiceOptions = {}) {
    this.#repository = options.repository ?? new InMemoryOverlayAccessKeyRepository();
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? generateOverlayAccessKeyId;
    this.#generateRawKey = options.generateRawKey ?? generateRawOverlayRouteKey;
    this.#createRouteKeySecretRef = options.createRouteKeySecretRef ?? (() => null);
  }

  async createKey(input: CreateOverlayKeyInput): Promise<CreatedOverlayAccessKey> {
    assertValidScopeInput(input);

    const rawKey = this.#generateRawKey();
    const keyId = this.#generateId();
    const record = await this.#repository.create({
      ...input,
      id: keyId,
      keyHash: hashOverlayRouteKey(rawKey),
      routeKeySecretRef: this.#createRouteKeySecretRef(keyId),
      createdAt: this.#clock().toISOString()
    });

    return { rawKey, record };
  }

  async verifyRouteAccess(request: OverlayRouteAccessRequest): Promise<OverlayAccessVerification> {
    const requestedKeyHash = hashOverlayRouteKey(request.rawKey);
    const candidates = await this.#repository.findCandidates(request.overlayId);
    const hashMatch = candidates.find((candidate) => safeEqual(candidate.keyHash, requestedKeyHash));

    if (hashMatch !== undefined) {
      if (hashMatch.revokedAt !== null) {
        return {
          authorized: false,
          reason: "revoked" as const
        };
      }

      if (hashMatch.scope !== request.scope) {
        return {
          authorized: false,
          reason: "scope-mismatch" as const
        };
      }

      if (hashMatch.purpose !== request.purpose) {
        return {
          authorized: false,
          reason: "purpose-mismatch" as const
        };
      }

      if (hashMatch.moduleId !== request.moduleId) {
        return {
          authorized: false,
          reason: "module-mismatch" as const
        };
      }

      if ((hashMatch.targetProfileId ?? null) !== (request.targetProfileId ?? null)) {
        return {
          authorized: false,
          reason: "profile-mismatch" as const
        };
      }

      return {
        authorized: true,
        record: hashMatch
      };
    }

    const outputMatch = candidates.some(
      (candidate) =>
        candidate.scope === request.scope &&
        candidate.purpose === request.purpose &&
        candidate.moduleId === request.moduleId &&
        (candidate.targetProfileId ?? null) === (request.targetProfileId ?? null)
    );

    return {
      authorized: false,
      reason: outputMatch ? ("key-mismatch" as const) : ("not-found" as const)
    };
  }

  async revokeKey(keyId: string): Promise<OverlayAccessKey | null> {
    const record = await this.#repository.findById(keyId);
    if (record === null) {
      return null;
    }

    return this.#repository.update({
      ...record,
      revokedAt: this.#clock().toISOString()
    });
  }
}

export function generateRawOverlayRouteKey(): string {
  return `ovl_${randomBytes(32).toString("base64url")}`;
}

export function generateOverlayAccessKeyId(): string {
  return `overlay-key_${randomBytes(16).toString("base64url")}`;
}

export function hashOverlayRouteKey(rawKey: string): string {
  return `sha256:${createHash("sha256").update(rawKey, "utf8").digest("hex")}`;
}

function assertValidScopeInput(input: CreateOverlayKeyInput): void {
  if (input.scope === "module" && input.moduleId === null) {
    throw new Error("Module overlay keys require a module id");
  }

  if (input.scope === "unified" && input.moduleId !== null) {
    throw new Error("Unified overlay keys cannot include a module id");
  }

  if (input.scope === "unified" && input.targetProfileId !== null && input.targetProfileId !== undefined) {
    throw new Error("Unified overlay keys cannot include a target profile");
  }

  if (
    input.targetProfileId !== null &&
    input.targetProfileId !== undefined &&
    input.targetProfileId !== "landscape" &&
    input.targetProfileId !== "vertical"
  ) {
    throw new Error("Overlay target profile must be landscape or vertical");
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
