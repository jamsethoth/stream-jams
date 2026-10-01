import { createHash, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { mediaVersionSnapshotSchema, type AssetRecord, type AssetRepository, type MediaVersionSnapshot, type TrustedMediaGrant } from "@stream-jams/core";
import { AssetFileChangedError, type LocalAssetStore, type MediaFileIdentity } from "./local-asset-store.js";
import type { AssetRetirementRepository } from "./sqlite-asset-retirement-repository.js";

export interface LocalMediaServiceOptions {
  readonly assets: Pick<AssetRepository, "findManyByIds">;
  readonly store: Pick<LocalAssetStore, "openRead" | "delete">;
  readonly retirements: AssetRetirementRepository;
  readonly now?: () => number;
  readonly onCleanupError?: (error: unknown) => void;
}

interface Grant {
  readonly owner: string;
  readonly recipient: string;
  readonly record: AssetRecord;
  readonly controller: AbortController;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

interface Owner {
  readonly records: ReadonlyMap<string, AssetRecord>;
  readonly controller: AbortController;
  readonly verified: Map<string, MediaFileIdentity>;
  readonly timer?: ReturnType<typeof setTimeout>;
}

interface PreparationVerification {
  readonly controller: AbortController;
  promise: Promise<void>;
  waiters: number;
  settled: boolean;
}

export class MediaUnavailableError extends Error {
  constructor() { super("Media reference unavailable"); this.name = "MediaUnavailableError"; }
}

export class MediaCapacityError extends MediaUnavailableError {
  constructor() { super(); this.name = "MediaCapacityError"; this.message = "Media unavailable: capacity exhausted. Close unused previews or wait for playback to finish, then retry."; }
}

/** Owns metadata and lifetimes only. File bodies and verification results are never cached. */
export class LocalMediaService {
  readonly #owners = new Map<string, Owner>();
  readonly #sharedParents = new Map<string, Set<string>>();
  readonly #grants = new Map<string, Grant>();
  readonly #reads = new Map<string, number>();
  readonly #readClosers = new Set<() => Promise<void>>();
  readonly #admission = new AsyncLocalStorage<{ owner: string; committed: boolean }>();
  readonly #preparation = new AsyncLocalStorage<Map<string, PreparationVerification>>();
  readonly #now: () => number;
  #pending: Promise<unknown> = Promise.resolve();
  #closed = false;
  #maintenanceCount = 0;
  #maintenanceTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LocalMediaServiceOptions) {
    this.#now = options.now ?? Date.now;
  }

  get counts(): { readonly owners: number; readonly grants: number; readonly readers: number } {
    return { owners: this.#owners.size, grants: this.#grants.size, readers: [...this.#reads.values()].reduce((sum, count) => sum + count, 0) };
  }

  /** A content admission owns every metadata lookup until its queue/run identity is committed. */
  async runAdmission<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closed || this.#maintenanceCount > 0) throw new MediaUnavailableError();
    const admission = { owner: `admission:${randomBytes(16).toString("hex")}`, committed: false };
    return this.#admission.run(admission, async () => {
      try { return await work(); }
      finally { if (!admission.committed) await this.release(admission.owner); }
    });
  }

  captureAdmission(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> {
    if (this.#closed || this.#maintenanceCount > 0) return Promise.reject(new MediaUnavailableError());
    const admission = this.#admission.getStore();
    if (admission === undefined) throw new MediaUnavailableError();
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0) throw new MediaUnavailableError();
      let owner = this.#owners.get(admission.owner);
      if (owner === undefined) {
        if (this.#owners.size >= 4096) throw new MediaCapacityError();
        owner = { records: new Map(), controller: new AbortController(), verified: new Map() };
        this.#owners.set(admission.owner, owner);
      }
      const records = new Map(owner.records);
      const missing = [...new Set(assetIds)].filter(id => !records.has(id));
      const found = await this.options.assets.findManyByIds(missing);
      if (missing.some(id => !found.has(id))) throw new MediaUnavailableError();
      for (const [id, record] of found) records.set(id, Object.freeze({ ...record }));
      this.#owners.set(admission.owner, { ...owner, records });
      return new Map(assetIds.map(id => [id, records.get(id)!]));
    });
  }

  commitAdmission(owner: string): void {
    const admission = this.#admission.getStore();
    if (admission === undefined || admission.committed || this.#closed || this.#maintenanceCount > 0 || this.#owners.has(owner)) throw new MediaUnavailableError();
    const captured = this.#owners.get(admission.owner);
    if (captured === undefined) throw new MediaUnavailableError();
    this.#owners.delete(admission.owner);
    this.#owners.set(owner, captured);
    admission.committed = true;
  }

  hasOwner(owner: string): boolean { return this.#owners.has(owner); }

  records(owner: string, assetIds: readonly string[]): ReadonlyMap<string, AssetRecord> {
    return new Map(assetIds.map(id => [id, this.get(owner, id)]));
  }

  descriptor(owner: string, assetId: string): MediaVersionSnapshot {
    const record = this.get(owner, assetId);
    return mediaVersionSnapshotSchema.parse({ assetId: record.id, version: mediaVersion(record), mimeType: record.mimeType, sizeBytes: record.sizeBytes, durationMs: record.durationMs });
  }

  issueTrustedGrant(owner: string, assetId: string, recipient: string, expiresAt: number): TrustedMediaGrant {
    return { snapshot: this.descriptor(owner, assetId), ...this.issue(owner, assetId, recipient, expiresAt) };
  }

  renewOwner(owner: string, expiresAt: number): void {
    const lifetime = this.#owners.get(owner);
    if (this.#closed || this.#maintenanceCount > 0 || lifetime === undefined || !Number.isSafeInteger(expiresAt) || expiresAt <= this.#now() || expiresAt - this.#now() > 3600000) throw new MediaUnavailableError();
    clearTimeout(lifetime.timer);
    const timer = setTimeout(() => {
      void this.release(owner).catch((error: unknown) => this.options.onCleanupError?.(error));
    }, expiresAt - this.#now());
    timer.unref();
    this.#owners.set(owner, { ...lifetime, timer });
  }

  admissionActive(): boolean { return this.#admission.getStore() !== undefined; }

  admissionVersions(): Readonly<Record<string, string>> {
    const admission = this.#admission.getStore();
    if (admission === undefined) throw new MediaUnavailableError();
    return this.versions(admission.owner);
  }

  versions(owner: string): Readonly<Record<string, string>> {
    if (this.#closed || this.#maintenanceCount > 0) throw new MediaUnavailableError();
    const records = this.#owners.get(owner)?.records;
    if (records === undefined) throw new MediaUnavailableError();
    return Object.fromEntries([...records].map(([id, record]) => [id, mediaVersion(record)]));
  }

  acquireVersion(owner: string, assetId: string, version: string, moduleId: string | null): Promise<AssetRecord> {
    if (this.#closed || this.#maintenanceCount > 0) return Promise.reject(new MediaUnavailableError());
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0 || this.#owners.has(owner) || !/^[a-f0-9]{64}$/.test(version)) throw new MediaUnavailableError();
      if (this.#owners.size >= 4096) throw new MediaCapacityError();
      let record: AssetRecord | undefined;
      for (const [identity, candidate] of this.#owners) {
        if (!identity.startsWith("[")) continue;
        if (moduleId !== null && !identity.startsWith(`${JSON.stringify([moduleId]).slice(0, -1)},`)) continue;
        const pinned = candidate.records.get(assetId);
        if (pinned !== undefined && mediaVersion(pinned) === version) { record = pinned; break; }
      }
      if (record === undefined) {
        const current = (await this.options.assets.findManyByIds([assetId])).get(assetId);
        if (current !== undefined && mediaVersion(current) === version) record = current;
      }
      if (record === undefined) throw new MediaUnavailableError();
      this.#owners.set(owner, { records: new Map([[assetId, record]]), controller: new AbortController(), verified: new Map() });
      return record;
    });
  }

  acquire(owner: string, assetIds: readonly string[], expiresAt?: number, allowMissing = false): Promise<ReadonlyMap<string, AssetRecord>> {
    if (this.#closed || this.#maintenanceCount > 0) return Promise.reject(new MediaUnavailableError());
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0 || this.#owners.has(owner)) throw new MediaUnavailableError();
      if (this.#owners.size >= 4096) throw new MediaCapacityError();
      if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= this.#now() || expiresAt - this.#now() > 3600000)) throw new MediaUnavailableError();
      const records = await this.options.assets.findManyByIds([...new Set(assetIds)]);
      if (!allowMissing && new Set(assetIds).size !== records.size) throw new MediaUnavailableError();
      const snapshot = new Map([...records].map(([id, record]) => [id, Object.freeze({ ...record })]));
      const timer = expiresAt === undefined ? undefined : setTimeout(() => {
        void this.release(owner).catch((error: unknown) => this.options.onCleanupError?.(error));
      }, expiresAt - this.#now());
      timer?.unref();
      this.#owners.set(owner, { records: snapshot, controller: new AbortController(), verified: new Map(), ...(timer === undefined ? {} : { timer }) });
      return new Map(snapshot);
    });
  }

  acquireFromOwner(owner: string, sourceOwner: string, assetIds: readonly string[]): Promise<void> {
    if (this.#closed || this.#maintenanceCount > 0) return Promise.reject(new MediaUnavailableError());
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0 || this.#owners.has(owner)) throw new MediaUnavailableError();
      if (this.#owners.size >= 4096) throw new MediaCapacityError();
      const source = this.#owners.get(sourceOwner);
      if (source === undefined) throw new MediaUnavailableError();
      const records = new Map(assetIds.map(id => [id, this.get(sourceOwner, id)]));
      this.#owners.set(owner, { records, controller: new AbortController(), verified: new Map(assetIds.flatMap(id => {
        const identity = source.verified.get(id); return identity === undefined ? [] : [[id, identity] as const];
      })) });
    });
  }

  /** A persistent icon shared by several runs survives until the last content owner ends. */
  shareVersion(owner: string, sourceOwner: string, assetId: string, version: string): void {
    if (!sourceOwner.startsWith('["timers",') || this.#sharedParents.has(sourceOwner)) throw new MediaUnavailableError();
    const record = this.get(sourceOwner, assetId);
    if (mediaVersion(record) !== version) throw new MediaUnavailableError();
    const existing = this.#owners.get(owner);
    if (existing === undefined) {
      if (this.#owners.size >= 4096) throw new MediaCapacityError();
      const identity = this.#owners.get(sourceOwner)!.verified.get(assetId);
      this.#owners.set(owner, { records: new Map([[assetId, record]]), controller: new AbortController(), verified: new Map(identity === undefined ? [] : [[assetId, identity]]) });
      this.#sharedParents.set(owner, new Set());
    } else if (!this.#sharedParents.has(owner) || mediaVersion(this.get(owner, assetId)) !== version) throw new MediaUnavailableError();
    this.#sharedParents.get(owner)!.add(sourceOwner);
  }

  get(owner: string, assetId: string): AssetRecord {
    const record = this.#owners.get(owner)?.records.get(assetId);
    if (this.#closed || this.#maintenanceCount > 0 || record === undefined) throw new MediaUnavailableError();
    return record;
  }

  /** Internal owner context: callers cannot substitute a path or version in its reader. */
  context(owner: string, assetId: string): { readonly record: AssetRecord; readonly signal: AbortSignal; readonly reader: Pick<LocalAssetStore, "openRead"> } {
    const record = this.get(owner, assetId);
    const lifetime = this.#owners.get(owner)!;
    return { record, signal: lifetime.controller.signal, reader: { openRead: async () => {
      lifetime.controller.signal.throwIfAborted();
      return this.#openRead(record, lifetime.verified.get(assetId));
    } } };
  }

  issue(owner: string, assetId: string, recipient: string, expiresAt: number): { readonly handle: string; readonly expiresAt: number } {
    const record = this.get(owner, assetId);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.#now() || expiresAt - this.#now() > 3600000) throw new MediaUnavailableError();
    for (const [handle, grant] of this.#grants) {
      if (grant.owner === owner && grant.record.id === assetId && grant.recipient === recipient) {
        this.renew(handle, owner, expiresAt);
        return { handle, expiresAt };
      }
    }
    if (this.#grants.size >= 4096) throw new MediaCapacityError();
    const handle = `med_${randomBytes(32).toString("base64url")}`;
    const timer = setTimeout(() => this.revoke(handle), expiresAt - this.#now());
    timer.unref();
    this.#grants.set(handle, { owner, recipient, record, expiresAt, timer, controller: new AbortController() });
    return { handle, expiresAt };
  }

  resolve(handle: string, recipient: string): { readonly record: AssetRecord; readonly signal: AbortSignal; readonly reader: Pick<LocalAssetStore, "openRead"> } {
    const grant = this.#grants.get(handle);
    if (this.#closed || this.#maintenanceCount > 0 || grant === undefined || grant.recipient !== recipient) throw new MediaUnavailableError();
    if (grant.expiresAt <= this.#now()) { this.revoke(handle); throw new MediaUnavailableError(); }
    const context = this.context(grant.owner, grant.record.id);
    return { record: grant.record, signal: AbortSignal.any([context.signal, grant.controller.signal]), reader: { openRead: async () => {
      grant.controller.signal.throwIfAborted();
      return context.reader.openRead(grant.record.storagePath, grant.record.sizeBytes);
    } } };
  }

  /** Capability requests carry only the secret; scope comes from the trusted issuance registry. */
  resolveForDelivery(handle: string): ReturnType<LocalMediaService["resolve"]> {
    const grant = this.#grants.get(handle);
    if (grant === undefined) throw new MediaUnavailableError();
    return this.resolve(handle, grant.recipient);
  }

  renew(handle: string, owner: string, expiresAt: number): void {
    const grant = this.#grants.get(handle);
    if (this.#closed || this.#maintenanceCount > 0 || grant === undefined || grant.owner !== owner || grant.expiresAt <= this.#now() || !Number.isSafeInteger(expiresAt) || expiresAt <= this.#now() || expiresAt - this.#now() > 3600000) throw new MediaUnavailableError();
    clearTimeout(grant.timer);
    grant.expiresAt = expiresAt;
    grant.timer = setTimeout(() => this.revoke(handle), expiresAt - this.#now());
    grant.timer.unref();
  }

  revoke(handle: string): void {
    const grant = this.#grants.get(handle);
    if (grant === undefined) return;
    this.#grants.delete(handle);
    clearTimeout(grant.timer);
    grant.controller.abort();
  }

  release(owner: string): Promise<void> {
    return this.#exclusive(async () => {
      this.#releaseOwned(owner);
      await this.#cleanupCommitted();
    });
  }

  #releaseOwned(owner: string): void {
    for (const [handle, grant] of this.#grants) if (grant.owner === owner) this.revoke(handle);
    this.#owners.get(owner)?.controller.abort();
    clearTimeout(this.#owners.get(owner)?.timer);
    this.#owners.delete(owner);
    this.#sharedParents.delete(owner);
    for (const [dependent, parents] of this.#sharedParents) {
      if (parents.delete(owner) && parents.size === 0) this.#releaseOwned(dependent);
    }
  }

  /** All registered storage mutations share this boundary with admission and retirement. */
  mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0) throw new MediaUnavailableError();
      const result = await work();
      // Metadata is already committed. Cleanup failure retains journal intent for retry.
      await this.#cleanupCommitted();
      return result;
    });
  }

  async openRead(record: AssetRecord): Promise<Awaited<ReturnType<LocalAssetStore["openRead"]>>> {
    return this.#openRead(record);
  }

  #openRead(record: AssetRecord, expectedIdentity?: MediaFileIdentity): Promise<Awaited<ReturnType<LocalAssetStore["openRead"]>>> {
    if (this.#closed || this.#maintenanceCount > 0) return Promise.reject(new MediaUnavailableError());
    return this.#exclusive(async () => {
      if (this.#closed || this.#maintenanceCount > 0) throw new MediaUnavailableError();
      const opened = await this.options.store.openRead(record.storagePath, record.sizeBytes);
      if (expectedIdentity !== undefined && !sameIdentity(expectedIdentity, opened.identity)) {
        await opened.close();
        throw new AssetFileChangedError();
      }
      this.#reads.set(record.storagePath, (this.#reads.get(record.storagePath) ?? 0) + 1);
      let closing: Promise<void> | undefined;
      const close = () => closing ??= (async () => {
        try { await opened.close(); } finally {
          await this.#exclusive(async () => {
            const remaining = (this.#reads.get(record.storagePath) ?? 1) - 1;
            if (remaining === 0) this.#reads.delete(record.storagePath); else this.#reads.set(record.storagePath, remaining);
            await this.#cleanupCommitted();
          });
          this.#readClosers.delete(close);
        }
      })();
      // Register before the sequencing barrier settles so maintenance cannot miss queued opens.
      this.#readClosers.add(close);
      return { ...opened, close };
    });
  }

  async verify(owner: string, assetId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const record = this.get(owner, assetId);
    const lifetime = this.#owners.get(owner)!.controller.signal;
    const verificationSignal = AbortSignal.any([signal, lifetime]);
    const opened = await this.openRead(record);
    try {
      verificationSignal.throwIfAborted();
      const before = opened.identity;
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of opened.handle.createReadStream({ highWaterMark: 65536, autoClose: false, signal: verificationSignal })) {
        size += chunk.byteLength;
        if (size > record.sizeBytes) throw new Error("Media integrity verification failed");
        hash.update(chunk);
      }
      const after = await opened.handle.stat();
      if (size !== record.sizeBytes || `sha256:${hash.digest("hex")}` !== record.checksum || !sameIdentity(before, after)) throw new Error("Media integrity verification failed");
      // Detect a path replacement while the old handle was being verified.
      const current = await this.openRead(record);
      try { if (!sameIdentity(before, current.identity)) throw new AssetFileChangedError(); }
      finally { await current.close(); }
      verificationSignal.throwIfAborted();
      const retained = this.#owners.get(owner);
      for (const [id, candidate] of retained?.records ?? []) {
        if (candidate.storagePath === record.storagePath && candidate.checksum === record.checksum) retained!.verified.set(id, before);
      }
    } finally { await opened.close(); }
  }

  runPreparation<T>(work: () => T): T {
    return this.#preparation.run(new Map(), work);
  }

  /** One call is one preparation group. Duplicate recipients share work only within this call. */
  async verifyGroup(owner: string, assetIds: readonly string[], signal: AbortSignal): Promise<void> {
    const versions = new Map(assetIds.map(id => {
      const record = this.get(owner, id);
      return [`${record.storagePath}\0${record.checksum}`, id];
    }));
    // Sequential bounded reads avoid multiplying hash buffers for a multi-layer preparation.
    const group = this.#preparation.getStore() ?? new Map<string, PreparationVerification>();
    for (const [version, id] of versions) {
      signal.throwIfAborted();
      const key = `${owner}\0${version}`;
      let proof = group.get(key);
      if (proof === undefined || proof.controller.signal.aborted) {
        proof = { controller: new AbortController(), promise: Promise.resolve(), waiters: 0, settled: false };
        const current = proof;
        current.promise = this.verify(owner, id, current.controller.signal).then(
          () => { current.settled = true; },
          (error: unknown) => { current.settled = true; throw error; }
        );
        group.set(key, current);
      }
      await this.#waitForVerification(proof, signal);
    }
  }

  async #waitForVerification(proof: PreparationVerification, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    proof.waiters++;
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    try { await Promise.race([proof.promise, cancelled]); }
    finally {
      signal.removeEventListener("abort", abort);
      proof.waiters--;
      if (proof.waiters === 0 && !proof.settled) {
        proof.controller.abort();
        // Drain the final consumer's cancelled file read before releasing its accounting.
        await proof.promise.catch(
          // error-provenance: allow cleanup -- each waiter already receives the original verification or cancellation failure
          () => undefined);
      }
    }
  }

  reconcile(): Promise<void> { return this.#exclusive(() => this.#cleanup(true)); }

  async close(): Promise<void> {
    this.#closed = true;
    await this.invalidate();
  }

  /** Fence acquisition synchronously, settle queued opens, then drain outside exclusive accounting. */
  maintenance<T>(work: () => Promise<T>): Promise<T> {
    this.#maintenanceCount++;
    const result = this.#maintenanceTail.then(async () => {
      await this.#exclusive(async () => {
        for (const handle of this.#grants.keys()) this.revoke(handle);
        for (const owner of this.#owners.values()) {
          owner.controller.abort();
          clearTimeout(owner.timer);
        }
        this.#owners.clear();
        this.#sharedParents.clear();
      });
      await Promise.all([...this.#readClosers].map(close => close()));
      return this.#exclusive(async () => {
        const value = await work();
        await this.#cleanupCommitted();
        return value;
      });
    });
    const finished = result.finally(() => { this.#maintenanceCount--; });
    this.#maintenanceTail = finished.then(() => undefined, () => undefined);
    return finished;
  }

  invalidate(): Promise<void> { return this.maintenance(async () => undefined); }

  async #cleanup(deferInaccessibleFiles = false): Promise<void> {
    const pinned = new Set([...this.#owners.values()].flatMap(owner => [...owner.records.values()].map(record => record.storagePath)));
    for (const retired of this.options.retirements.list()) {
      if (pinned.has(retired.storagePath) || this.#reads.has(retired.storagePath)) continue;
      if (!this.options.retirements.isCurrent(retired.storagePath)) {
        try { await this.options.store.delete(retired.storagePath); }
        catch (error) {
          if (!deferInaccessibleFiles || !(error instanceof Error) || !("code" in error) || !["EBUSY", "EACCES", "EPERM"].includes(String(error.code))) throw error;
          // The durable retirement remains pending; a locked file must not block startup.
          this.options.onCleanupError?.(error);
          continue;
        }
      }
      this.options.retirements.forget(retired.storagePath);
    }
  }

  async #cleanupCommitted(): Promise<void> {
    try { await this.#cleanup(); } catch (error) { this.options.onCleanupError?.(error); }
  }

  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(work);
    // The caller receives the failure; retain a settled sequencing tail for subsequent work.
    this.#pending = result.then(() => undefined, () => undefined);
    return result;
  }
}

function sameIdentity(left: MediaFileIdentity, right: MediaFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function mediaVersion(record: AssetRecord): string {
  return createHash("sha256").update(record.storagePath).update("\0").update(record.checksum).digest("hex");
}
