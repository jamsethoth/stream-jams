import type { NormalizedStreamEvent } from "../events/types.js";

export interface PlaybackDedupeService {
  accept(event: NormalizedStreamEvent): boolean;
}

export interface PlaybackDedupeKeyService {
  acceptKey(namespace: string, key: string): boolean;
}

export interface PlaybackDedupeServiceDependencies {
  readonly clock?: () => Date;
  readonly windowMs?: number;
  readonly maxEntries?: number;
}

export class DefaultPlaybackDedupeService implements PlaybackDedupeService, PlaybackDedupeKeyService {
  readonly #clock: () => Date;
  readonly #windowMs: number;
  readonly #maxEntries: number;
  readonly #acceptedUntil = new Map<string, number>();

  constructor(dependencies: PlaybackDedupeServiceDependencies = {}) {
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#windowMs = dependencies.windowMs ?? 5 * 60_000;
    this.#maxEntries = dependencies.maxEntries ?? 1_000;
  }

  accept(event: NormalizedStreamEvent): boolean {
    return this.acceptKey("alerts", `${event.providerId}:${event.id}`);
  }

  acceptKey(namespace: string, key: string): boolean {
    const now = this.#clock().getTime();
    this.#purgeExpired(now);
    const namespacedKey = JSON.stringify([namespace, key]);
    if ((this.#acceptedUntil.get(namespacedKey) ?? 0) > now) {
      return false;
    }

    this.#acceptedUntil.set(namespacedKey, now + this.#windowMs);
    while (this.#acceptedUntil.size > this.#maxEntries) {
      const oldest = this.#acceptedUntil.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#acceptedUntil.delete(oldest);
    }
    return true;
  }

  #purgeExpired(now: number): void {
    for (const [key, expiresAt] of this.#acceptedUntil) {
      if (expiresAt <= now) {
        this.#acceptedUntil.delete(key);
      }
    }
  }
}
