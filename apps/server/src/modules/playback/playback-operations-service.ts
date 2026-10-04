import {
  mergeOperations,
  defaultModuleMuteState,
  type ModuleMuteState,
  type MutablePlaybackModuleId,
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
  #pendingSafetyMutation: Promise<unknown> = Promise.resolve();
  #muteOutputStatus: { status: "applied" | "failed"; message: string | null } = { status: "applied", message: null };
  #revision = 0;
  #fingerprint: string | null = null;

  constructor(options: PlaybackOperationsServiceOptions) {
    const owners = new Map<string, QueueOwner>();
    for (const owner of options.owners) {
      if (owners.has(owner.moduleId)) throw new TypeError(`Duplicate playback owner "${owner.moduleId}"`);
      owners.set(owner.moduleId, owner);
    }
    this.#owners = owners;
    this.#safety = normalizeSafety(options.initialSafety);
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

  getModuleMuteState(): ModuleMuteState { return { ...(this.#safety.moduleMutes ?? defaultModuleMuteState) }; }

  getMuteOutputStatus(): Readonly<{ status: "applied" | "failed"; message: string | null }> { return { ...this.#muteOutputStatus }; }

  setModulesMuted(moduleIds: readonly MutablePlaybackModuleId[], muted: boolean): Promise<MergedOperationsSnapshot> {
    return this.#serialize(async () => {
      const moduleMutes = { ...this.getModuleMuteState() };
      for (const id of moduleIds) {
        if (id !== "alerts" && id !== "screen-effects") throw new UnknownPlaybackOwnerError(id);
        moduleMutes[id] = muted;
      }
      return this.#setSafety({ moduleMutes, muted: moduleMutes.alerts && moduleMutes["screen-effects"] });
    });
  }

  toggleModulesMuted(moduleIds: readonly MutablePlaybackModuleId[]): Promise<MergedOperationsSnapshot> {
    return this.#serialize(async () => {
      const moduleMutes = { ...this.getModuleMuteState() };
      const muted = !moduleIds.every(id => moduleMutes[id]);
      for (const id of moduleIds) {
        if (id !== "alerts" && id !== "screen-effects") throw new UnknownPlaybackOwnerError(id);
        moduleMutes[id] = muted;
      }
      return this.#setSafety({ moduleMutes, muted: moduleMutes.alerts && moduleMutes["screen-effects"] });
    });
  }

  #serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#pendingSafetyMutation.then(action);
    this.#pendingSafetyMutation = result.catch(
      // error-provenance: allow expected -- keep the mutation queue available after an unsuccessful command
      () => undefined);
    return result;
  }

  setSafety(patch: Partial<PlaybackSafetyState>): Promise<MergedOperationsSnapshot> {
    const result = this.#pendingSafetyMutation.then(() => this.#setSafety(patch));
    this.#pendingSafetyMutation = result.catch(
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    () => undefined);
    return result;
  }

  async #setSafety(patch: Partial<PlaybackSafetyState>): Promise<MergedOperationsSnapshot> {
    if (patch.muted !== undefined && patch.moduleMutes === undefined) {
      patch = { ...patch, moduleMutes: { alerts: patch.muted, "screen-effects": patch.muted } };
    }
    const candidate = playbackSafetyStateSchema.parse({ ...this.#safety, ...patch });
    const persisted = normalizeSafety(await this.#persistSafety(patch));
    if (
      persisted.paused !== candidate.paused
      || persisted.muted !== candidate.muted
      || persisted.doNotDisturb !== candidate.doNotDisturb
      || JSON.stringify(persisted.moduleMutes) !== JSON.stringify(candidate.moduleMutes)
    ) {
      throw new Error("Persisted playback safety state did not match the requested state");
    }
    this.#safety = persisted;
    await this.#applySafetyAndReport(persisted);
    return this.getSnapshot();
  }

  restoreSafety(state: PlaybackSafetyState): Promise<MergedOperationsSnapshot> {
    return this.#serialize(async () => {
      this.#safety = normalizeSafety(state);
      await this.#applySafetyAndReport(this.#safety);
      return this.getSnapshot();
    });
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

  setModulePaused(moduleId: string, paused: boolean): Promise<MergedOperationsSnapshot> {
    return this.#serialize(async () => {
      await this.#owner(moduleId).setPaused(paused);
      return this.getSnapshot();
    });
  }

  toggleModulePaused(moduleId: string): Promise<MergedOperationsSnapshot> {
    return this.#serialize(async () => {
      const owner = this.#owner(moduleId);
      await owner.setPaused(!owner.snapshot().paused);
      return this.getSnapshot();
    });
  }

  async clearPendingGuarded(moduleId: string, expectedPendingCount: number, expectedPendingIds: readonly string[]): Promise<MergedOperationsSnapshot> {
    const owner = this.#owner(moduleId);
    const rows = owner.snapshot().queued;
    if (rows.length !== expectedPendingCount || JSON.stringify(rows.map(row => row.occurrenceId)) !== JSON.stringify(expectedPendingIds)) {
      throw this.#conflict("The pending queue changed before it could be cleared.");
    }
    const removed = await owner.clearPending();
    if (removed !== expectedPendingCount) throw this.#conflict("The pending queue changed before it could be cleared.");
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
      this.#muteOutputStatus = { status: "applied", message: null };
    } catch (error) {
      this.#muteOutputStatus = { status: "failed", message: "Saved mute policy could not be applied to every output. Retry output recovery." };
      try {
        await this.#onSafetyApplyFailure?.(error);
      }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch {
        // Applying persisted safety state is best-effort; reporting must not
        // turn a durable state change into an apparent request failure.
      }
    }
  }
}

function normalizeSafety(state: PlaybackSafetyState): PlaybackSafetyState {
  const parsed = playbackSafetyStateSchema.parse(state);
  const moduleMutes = parsed.moduleMutes ?? { ...defaultModuleMuteState };
  return { ...parsed, moduleMutes, muted: moduleMutes.alerts && moduleMutes["screen-effects"] };
}
