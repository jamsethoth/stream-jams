import type { RetiredOutputAttempt, RetiredOverlayOutputKind } from "@stream-jams/core";

/**
 * Process-local, bounded counter of requests that still use retired test/unified overlay URLs. It stores only the
 * retired kind, a count and the last time seen, never keys, paths, origins or client identities.
 */
export class RetiredOutputAttemptTracker {
  readonly #attempts = new Map<RetiredOverlayOutputKind, { count: number; lastSeenAt: string }>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  record(kind: RetiredOverlayOutputKind): void {
    const previous = this.#attempts.get(kind);
    this.#attempts.set(kind, {
      count: Math.min((previous?.count ?? 0) + 1, Number.MAX_SAFE_INTEGER),
      lastSeenAt: this.#now().toISOString()
    });
  }

  list(): readonly RetiredOutputAttempt[] {
    return [...this.#attempts.entries()]
      .map(([kind, attempt]) => ({ kind, lastSeenAt: attempt.lastSeenAt, count: attempt.count }))
      .sort((left, right) => left.kind.localeCompare(right.kind));
  }
}
