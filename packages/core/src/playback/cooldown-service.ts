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

export interface PlaybackCooldownServiceDependencies {
  readonly clock?: () => Date;
}

export class DefaultPlaybackCooldownService implements PlaybackCooldownService {
  readonly #clock: () => Date;
  readonly #ruleCooldownUntil = new Map<string, number>();
  readonly #eventTypeCooldownUntil = new Map<StreamEventType, number>();

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
      (this.#ruleCooldownUntil.get(subject.ruleId) ?? 0) <= now &&
      (this.#eventTypeCooldownUntil.get(subject.eventType) ?? 0) <= now
    );
  }

  filterReady<TSubject extends PlaybackCooldownSubject>(subjects: readonly TSubject[]): readonly TSubject[] {
    return subjects.filter((subject) => this.canPlay(subject));
  }

  recordPlayback(subject: PlaybackCooldownSubject): void {
    if (subject.cooldownSeconds <= 0) {
      return;
    }

    const expiresAt = this.#now() + subject.cooldownSeconds * 1000;
    this.#ruleCooldownUntil.set(subject.ruleId, Math.max(this.#ruleCooldownUntil.get(subject.ruleId) ?? 0, expiresAt));
    this.#eventTypeCooldownUntil.set(
      subject.eventType,
      Math.max(this.#eventTypeCooldownUntil.get(subject.eventType) ?? 0, expiresAt)
    );
  }

  #purgeExpired(now: number): void {
    for (const [ruleId, expiresAt] of this.#ruleCooldownUntil) {
      if (expiresAt <= now) {
        this.#ruleCooldownUntil.delete(ruleId);
      }
    }

    for (const [eventType, expiresAt] of this.#eventTypeCooldownUntil) {
      if (expiresAt <= now) {
        this.#eventTypeCooldownUntil.delete(eventType);
      }
    }
  }

  #now(): number {
    return this.#clock().getTime();
  }
}
