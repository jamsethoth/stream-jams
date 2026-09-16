import type { StreamEventType } from "../events/types.js";

export interface PlaybackCooldownSubject {
  readonly ruleId: string;
  readonly eventType: StreamEventType;
  readonly cooldownSeconds: number;
}

export interface PlaybackCooldownService {
  canPlay(subject: PlaybackCooldownSubject): boolean;
  filterReady<TSubject extends PlaybackCooldownSubject>(subjects: readonly TSubject[]): readonly TSubject[];
  recordPlayback(subject: PlaybackCooldownSubject): void;
}

export interface PlaybackCooldownKeyService {
  canPlayKey(namespace: string, key: string, cooldownSeconds: number): boolean;
  recordPlaybackKey(namespace: string, key: string, cooldownSeconds: number): void;
}

export interface PlaybackCooldownServiceDependencies {
  readonly clock?: () => Date;
}

export class DefaultPlaybackCooldownService implements PlaybackCooldownService, PlaybackCooldownKeyService {
  readonly #clock: () => Date;
  readonly #cooldownUntil = new Map<string, number>();

  constructor(dependencies: PlaybackCooldownServiceDependencies = {}) {
    this.#clock = dependencies.clock ?? (() => new Date());
  }

  canPlay(subject: PlaybackCooldownSubject): boolean {
    if (subject.cooldownSeconds <= 0) {
      return true;
    }

    const now = this.#now();
    this.#purgeExpired(now);
    return (
      this.#isReady("alerts-rule", subject.ruleId, now) &&
      this.#isReady("alerts-event-type", subject.eventType, now)
    );
  }

  canPlayKey(namespace: string, key: string, cooldownSeconds: number): boolean {
    if (cooldownSeconds <= 0) return true;
    const now = this.#now();
    this.#purgeExpired(now);
    return this.#isReady(namespace, key, now);
  }

  filterReady<TSubject extends PlaybackCooldownSubject>(subjects: readonly TSubject[]): readonly TSubject[] {
    return subjects.filter((subject) => this.canPlay(subject));
  }

  recordPlayback(subject: PlaybackCooldownSubject): void {
    if (subject.cooldownSeconds <= 0) {
      return;
    }

    const expiresAt = this.#now() + subject.cooldownSeconds * 1000;
    this.#record("alerts-rule", subject.ruleId, expiresAt);
    this.#record("alerts-event-type", subject.eventType, expiresAt);
  }

  recordPlaybackKey(namespace: string, key: string, cooldownSeconds: number): void {
    if (cooldownSeconds <= 0) return;
    this.#record(namespace, key, this.#now() + cooldownSeconds * 1000);
  }

  #purgeExpired(now: number): void {
    for (const [key, expiresAt] of this.#cooldownUntil) {
      if (expiresAt <= now) {
        this.#cooldownUntil.delete(key);
      }
    }
  }

  #isReady(namespace: string, key: string, now: number): boolean {
    return (this.#cooldownUntil.get(JSON.stringify([namespace, key])) ?? 0) <= now;
  }

  #record(namespace: string, key: string, expiresAt: number): void {
    const namespacedKey = JSON.stringify([namespace, key]);
    this.#cooldownUntil.set(
      namespacedKey,
      Math.max(this.#cooldownUntil.get(namespacedKey) ?? 0, expiresAt)
    );
  }

  #now(): number {
    return this.#clock().getTime();
  }
}
