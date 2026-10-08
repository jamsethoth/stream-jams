import type {
  OverlayModuleRuntime,
  OverlayModuleSnapshot,
  OverlayModuleSnapshotRequest,
  OverlayPurpose,
  VideoShoutoutCommand,
  VideoShoutoutErrorReason,
  VideoShoutoutProjection
} from "@stream-jams/core";

export interface VideoShoutoutClock { now(): number; }

export interface VideoShoutoutScheduler {
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}

export interface VideoShoutoutTransition {
  readonly purpose: OverlayPurpose;
  readonly from: VideoShoutoutProjection["status"];
  readonly to: VideoShoutoutProjection["status"];
  readonly activationId: string | null;
  readonly cause: "command" | "loading-timeout" | "duration-elapsed" | "player-started" | "player-completed" | "player-failed" | "error-elapsed";
}

export interface VideoShoutoutServiceOptions {
  readonly clock: VideoShoutoutClock;
  readonly scheduler: VideoShoutoutScheduler;
  readonly generateActivationId: () => string;
  /** How long a browser source may take to report the Twitch player loaded before the shoutout is abandoned. */
  readonly loadingTimeoutMs?: number | undefined;
  /** How long the bounded no-clip/error state stays visible before returning to idle. */
  readonly errorDisplayMs?: number | undefined;
  readonly onTransition?: ((transition: VideoShoutoutTransition) => void) | undefined;
}

interface PurposeState {
  projection: VideoShoutoutProjection;
  scheduled: { cancel(): void } | null;
}

const idle: VideoShoutoutProjection = { status: "idle" };

/**
 * Holds one active manual video shoutout per overlay purpose, in memory only.
 * A new command replaces the active clip; nothing is queued or persisted.
 */
export class VideoShoutoutService implements OverlayModuleRuntime {
  readonly #clock: VideoShoutoutClock;
  readonly #scheduler: VideoShoutoutScheduler;
  readonly #generateActivationId: () => string;
  readonly #loadingTimeoutMs: number;
  readonly #errorDisplayMs: number;
  readonly #onTransition: (transition: VideoShoutoutTransition) => void;
  readonly #states = new Map<OverlayPurpose, PurposeState>();
  readonly #listeners = new Set<(purpose: OverlayPurpose) => void>();

  constructor(options: VideoShoutoutServiceOptions) {
    this.#clock = options.clock;
    this.#scheduler = options.scheduler;
    this.#generateActivationId = options.generateActivationId;
    this.#loadingTimeoutMs = options.loadingTimeoutMs ?? 15_000;
    this.#errorDisplayMs = options.errorDisplayMs ?? 5_000;
    this.#onTransition = options.onTransition ?? (() => undefined);
  }

  getProjection(purpose: OverlayPurpose): VideoShoutoutProjection {
    return this.#states.get(purpose)?.projection ?? idle;
  }

  apply(command: VideoShoutoutCommand): VideoShoutoutProjection {
    if (command.kind === "clear") {
      this.#transition(command.purpose, idle, null, "command");
    } else if (command.kind === "no-clip") {
      this.#showError(command.purpose, this.#nextActivationId(), "no-clip", command.displayName, "command");
    } else {
      const activationId = this.#nextActivationId();
      this.#transition(command.purpose, { status: "loading", activationId, clip: command.clip }, {
        delayMs: this.#loadingTimeoutMs,
        // A source that never reports the player loaded must not leave chrome on stream.
        expire: () => this.#transitionIfActive(command.purpose, activationId, ["loading"], idle, null, "loading-timeout")
      }, "command");
    }
    return this.getProjection(command.purpose);
  }

  /** Applies a browser-source player report. Returns true when the report matched the active shoutout. */
  reportPlayback(activationId: string, status: "started" | "completed" | "failed"): boolean {
    for (const [purpose, state] of this.#states) {
      const current = state.projection;
      if (current.status !== "loading" && current.status !== "playing") continue;
      if (current.activationId !== activationId) continue;
      if (status === "started") {
        if (current.status === "playing") return true;
        const endsAtEpochMs = this.#clock.now() + current.clip.durationMs;
        this.#transition(purpose, { status: "playing", activationId, clip: current.clip, endsAtEpochMs }, {
          delayMs: current.clip.durationMs,
          expire: () => this.#transitionIfActive(purpose, activationId, ["playing"], idle, null, "duration-elapsed")
        }, "player-started");
      } else if (status === "completed") {
        this.#transition(purpose, idle, null, "player-completed");
      } else {
        this.#showError(purpose, activationId, "playback-failed", current.clip.displayName, "player-failed");
      }
      return true;
    }
    return false;
  }

  subscribe(listener: (purpose: OverlayPurpose) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    // Unified participation is deferred; only module-specific sources render shoutouts.
    if (request.scope !== "module") return { moduleId: "video-shoutout", enabled: true, instructions: [] };
    return {
      moduleId: "video-shoutout",
      enabled: true,
      instructions: [],
      presentation: { kind: "video-shoutout", shoutout: this.getProjection(request.purpose) }
    };
  }

  dispose(): void {
    for (const state of this.#states.values()) state.scheduled?.cancel();
    this.#states.clear();
    this.#listeners.clear();
  }

  #nextActivationId(): string {
    return `video-shoutout:${this.#generateActivationId()}`;
  }

  #showError(
    purpose: OverlayPurpose,
    activationId: string,
    reason: VideoShoutoutErrorReason,
    displayName: string | null,
    cause: VideoShoutoutTransition["cause"]
  ): void {
    this.#transition(purpose, { status: "error", activationId, reason, displayName }, {
      delayMs: this.#errorDisplayMs,
      expire: () => this.#transitionIfActive(purpose, activationId, ["error"], idle, null, "error-elapsed")
    }, cause);
  }

  #transitionIfActive(
    purpose: OverlayPurpose,
    activationId: string,
    statuses: readonly VideoShoutoutProjection["status"][],
    next: VideoShoutoutProjection,
    expiry: { readonly delayMs: number; readonly expire: () => void } | null,
    cause: VideoShoutoutTransition["cause"]
  ): void {
    const current = this.getProjection(purpose);
    if (current.status === "idle" || current.activationId !== activationId || !statuses.includes(current.status)) return;
    this.#transition(purpose, next, expiry, cause);
  }

  #transition(
    purpose: OverlayPurpose,
    next: VideoShoutoutProjection,
    expiry: { readonly delayMs: number; readonly expire: () => void } | null,
    cause: VideoShoutoutTransition["cause"]
  ): void {
    const state = this.#states.get(purpose) ?? { projection: idle, scheduled: null };
    const previous = state.projection;
    state.scheduled?.cancel();
    state.scheduled = expiry === null ? null : this.#scheduler.schedule(expiry.delayMs, expiry.expire);
    this.#states.set(purpose, state);
    if (previous.status === "idle" && next.status === "idle") return;
    state.projection = next;
    // Idle carries no identity, so report the shoutout that just ended.
    const activationId = next.status !== "idle" ? next.activationId : previous.status === "idle" ? null : previous.activationId;
    this.#onTransition({ purpose, from: previous.status, to: next.status, activationId, cause });
    for (const listener of this.#listeners) listener(purpose);
  }
}
