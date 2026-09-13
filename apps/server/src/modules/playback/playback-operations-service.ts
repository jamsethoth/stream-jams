import {
  mergeOperations,
  playbackSafetyStateSchema,
  type MergedOperationsSnapshot,
  type PlaybackSafetyState,
  type QueueOwner
} from "@stream-jams/core";

export interface PlaybackOperationsServiceOptions {
  readonly owners: readonly QueueOwner[];
  readonly initialSafety: PlaybackSafetyState;
  readonly persistSafety: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
  readonly applySafety: (state: PlaybackSafetyState) => Promise<void>;
  readonly onSafetyApplyFailure?: ((error: unknown) => void | Promise<void>) | undefined;
}

export class UnknownPlaybackOwnerError extends Error {
  constructor(readonly moduleId: string) {
    super(`Playback module "${moduleId}" was not found`);
    this.name = "UnknownPlaybackOwnerError";
  }
}

export class PlaybackOperationsConflictError extends Error {
  constructor(
    message: string,
    readonly snapshot: MergedOperationsSnapshot
  ) {
    super(message);
    this.name = "PlaybackOperationsConflictError";
  }
}

export class PlaybackOperationsService {
  readonly #owners: ReadonlyMap<string, QueueOwner>;
  readonly #persistSafety: PlaybackOperationsServiceOptions["persistSafety"];
  readonly #applySafety: PlaybackOperationsServiceOptions["applySafety"];
  readonly #onSafetyApplyFailure: NonNullable<PlaybackOperationsServiceOptions["onSafetyApplyFailure"]> | null;
  #safety: PlaybackSafetyState;
  #revision = 0;
  #fingerprint: string | null = null;

  constructor(options: PlaybackOperationsServiceOptions) {
    const owners = new Map<string, QueueOwner>();
    for (const owner of options.owners) {
      if (owners.has(owner.moduleId)) throw new TypeError(`Duplicate playback owner "${owner.moduleId}"`);
      owners.set(owner.moduleId, owner);
    }
    this.#owners = owners;
    this.#safety = playbackSafetyStateSchema.parse(options.initialSafety);
    this.#persistSafety = options.persistSafety;
    this.#applySafety = options.applySafety;
    this.#onSafetyApplyFailure = options.onSafetyApplyFailure ?? null;
  }

  getSnapshot(): MergedOperationsSnapshot {
    const ownerSnapshots = [...this.#owners.values()].map((owner) => owner.snapshot());
    const fingerprint = JSON.stringify({ ownerSnapshots, safety: this.#safety });
    if (this.#fingerprint === null) this.#fingerprint = fingerprint;
    else if (this.#fingerprint !== fingerprint) {
      this.#revision += 1;
      this.#fingerprint = fingerprint;
    }
    return mergeOperations(ownerSnapshots, this.#safety, this.#revision);
  }

  async setSafety(patch: Partial<PlaybackSafetyState>): Promise<MergedOperationsSnapshot> {
    const candidate = playbackSafetyStateSchema.parse({ ...this.#safety, ...patch });
    const persisted = playbackSafetyStateSchema.parse(await this.#persistSafety(patch));
    if (
      persisted.paused !== candidate.paused
      || persisted.muted !== candidate.muted
      || persisted.doNotDisturb !== candidate.doNotDisturb
    ) {
      throw new Error("Persisted playback safety state did not match the requested state");
    }
    this.#safety = persisted;
    await this.#applySafetyAndReport(persisted);
    return this.getSnapshot();
  }

  async restoreSafety(state: PlaybackSafetyState): Promise<MergedOperationsSnapshot> {
    this.#safety = playbackSafetyStateSchema.parse(state);
    await this.#applySafetyAndReport(this.#safety);
    return this.getSnapshot();
  }

  async skip(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    if (owner.snapshot().current?.occurrenceId !== occurrenceId || !await owner.skip(occurrenceId)) {
      throw this.#conflict("The current playback changed before it could be skipped.");
    }
    return this.getSnapshot();
  }

  async remove(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    if (!owner.snapshot().queued.some((row) => row.occurrenceId === occurrenceId) || !await owner.remove(occurrenceId)) {
      throw this.#conflict("The queued playback changed before it could be removed.");
    }
    return this.getSnapshot();
  }

  async replay(moduleId: string, occurrenceId: string): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    if (!owner.snapshot().recent.some((row) => row.occurrenceId === occurrenceId) || !await owner.replay(occurrenceId)) {
      throw this.#conflict("The recent playback is no longer available to replay.");
    }
    return this.getSnapshot();
  }

  async clear(
    moduleId: string,
    expectedPendingCount: number,
    observedRevision: number
  ): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    const current = this.getSnapshot();
    if (
      current.revision !== observedRevision
      || owner.snapshot().queued.length !== expectedPendingCount
    ) {
      throw new PlaybackOperationsConflictError("The pending queue changed before it could be cleared.", current);
    }
    const removed = await owner.clearPending();
    if (removed !== expectedPendingCount) {
      throw this.#conflict("The pending queue changed before it could be cleared.");
    }
    return this.getSnapshot();
  }

  async setModulePaused(moduleId: string, paused: boolean): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    await owner.setPaused(paused);
    return this.getSnapshot();
  }

  #owner(moduleId: string): QueueOwner {
    const owner = this.#owners.get(moduleId);
    if (owner === undefined) throw new UnknownPlaybackOwnerError(moduleId);
    return owner;
  }

  #conflict(message: string): PlaybackOperationsConflictError {
    return new PlaybackOperationsConflictError(message, this.getSnapshot());
  }

  async #applySafetyAndReport(state: PlaybackSafetyState): Promise<void> {
    try {
      await this.#applySafety(state);
    } catch (error) {
      try {
        await this.#onSafetyApplyFailure?.(error);
      } catch {
        // Applying persisted safety state is best-effort; reporting must not
        // turn a durable state change into an apparent request failure.
      }
    }
  }
}
