import type { NormalizedStreamEvent } from "../events/types.js";

export interface PlaybackDedupeService {
  accept(event: NormalizedStreamEvent): boolean;
}

export interface PlaybackDedupeServiceDependencies {
  readonly clock?: () => Date;
  readonly windowMs?: number;
}

export class DefaultPlaybackDedupeService implements PlaybackDedupeService {
  readonly #clock: () => Date;
  readonly #windowMs: number;
  readonly #acceptedUntil = new Map<string, number>();

  constructor(dependencies: PlaybackDedupeServiceDependencies = {}) {
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#windowMs = dependencies.windowMs ?? 5 * 60_000;
  }

  accept(event: NormalizedStreamEvent): boolean {
    const now = this.#clock().getTime();
    this.#purgeExpired(now);
    const key = `${event.providerId}:${event.id}`;
    if ((this.#acceptedUntil.get(key) ?? 0) > now) {
      return false;
    }

    this.#acceptedUntil.set(key, now + this.#windowMs);
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
