import type { CreateOverlayKeyInput, OverlayAccessKeyRepository } from "@stream-jams/core";
import { InMemoryOverlayAccessKeyRepository, LocalOverlayAccessService, hashOverlayRouteKey,
  type LocalOverlayAccessServiceOptions } from "../../modules/overlays/overlay-access-service.js";

/** Explicitly stores credentials created by a historical release; it does not mint through current admission. */
export class HistoricalOverlayKeyFixture extends LocalOverlayAccessService {
  readonly #repository: OverlayAccessKeyRepository;
  readonly #historicalOptions: LocalOverlayAccessServiceOptions;
  constructor(options: LocalOverlayAccessServiceOptions = {}) {
    const repository = options.repository ?? new InMemoryOverlayAccessKeyRepository();
    super({ ...options, repository });
    this.#repository = repository;
    this.#historicalOptions = options;
  }
  async seedHistoricalKey(input: CreateOverlayKeyInput) {
    const id = this.#historicalOptions.generateId?.() ?? "historical-key";
    const rawKey = this.#historicalOptions.generateRawKey?.() ?? "historical-key-value";
    const record = await this.#repository.create({ ...input, id, keyHash: hashOverlayRouteKey(rawKey),
      routeKeySecretRef: this.#historicalOptions.createRouteKeySecretRef?.(id) ?? null,
      createdAt: (this.#historicalOptions.clock?.() ?? new Date("2026-05-29T12:00:00Z")).toISOString() });
    return { rawKey, record };
  }
}
