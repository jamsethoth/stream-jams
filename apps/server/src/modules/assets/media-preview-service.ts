import { randomUUID } from "node:crypto";
import { mediaVersionSnapshotSchema, type MediaPreviewDescriptor, type ManagementSessionService, type MediaVersionSnapshot } from "@stream-jams/core";
import { MediaCapacityError, MediaUnavailableError, type LocalMediaService } from "./local-media-service.js";

interface Entry { readonly sessionId: string; readonly owner: string; readonly assetId: string; readonly strictVersion: boolean; descriptor: MediaPreviewDescriptor; timer: ReturnType<typeof setTimeout> }
export interface MediaPreviewServiceOptions {
  readonly media: LocalMediaService;
  readonly sessions: Pick<ManagementSessionService, "verifySession"> & { onInvalidated(listener: (sessionId: string) => Promise<void>): () => void };
  readonly now?: () => number;
  readonly onCleanupError?: (error: unknown) => void;
}

/** Management-only ownership; native media reads use the existing scoped capability route. */
export class MediaPreviewService {
  readonly #entries = new Map<string, Entry>();
  readonly #now: () => number;
  readonly #unsubscribe: () => void;
  #pending: Promise<unknown> = Promise.resolve();
  #closed = false;
  constructor(private readonly options: MediaPreviewServiceOptions) {
    this.#now = options.now ?? Date.now;
    this.#unsubscribe = options.sessions.onInvalidated(sessionId => this.#exclusive(async () => {
      for (const [id, entry] of this.#entries) if (entry.sessionId === sessionId) await this.#release(id);
    }));
  }
  create(sessionId: string, assetId: string): Promise<MediaPreviewDescriptor> {
    return this.#create(sessionId, assetId);
  }
  createVersioned(sessionId: string, reference: MediaVersionSnapshot): Promise<MediaPreviewDescriptor> {
    const parsed = mediaVersionSnapshotSchema.parse(reference);
    return this.#create(sessionId, parsed.assetId, parsed);
  }
  #create(sessionId: string, assetId: string, expected?: MediaVersionSnapshot): Promise<MediaPreviewDescriptor> {
    return this.#exclusive(async () => {
      const expiresAt = await this.#expiry(sessionId);
      if (this.#entries.size >= 4096) throw new MediaCapacityError();
      const id = randomUUID();
      const owner = `preview:${sessionId}:${id}`;
      await this.options.media.acquire(owner, [assetId], expiresAt, false,
        expected === undefined ? undefined : { [assetId]: expected.version });
      try {
        const grant = this.options.media.issueTrustedGrant(owner, assetId, `preview:${sessionId}`, expiresAt);
        if (expected !== undefined && (grant.snapshot.mimeType !== expected.mimeType ||
          grant.snapshot.sizeBytes !== expected.sizeBytes || grant.snapshot.durationMs !== expected.durationMs)) throw new MediaUnavailableError();
        const descriptor = { id, snapshot: grant.snapshot, url: `/media/${grant.handle}`, expiresAt };
        const entry = { sessionId, owner, assetId, strictVersion: expected !== undefined, descriptor, timer: this.#timer(id, expiresAt) };
        this.#entries.set(id, entry);
        return descriptor;
      } catch (error) { await this.options.media.release(owner); throw error; }
    });
  }
  renew(sessionId: string, id: string): Promise<MediaPreviewDescriptor> {
    return this.#exclusive(async () => {
      const entry = this.#entries.get(id);
      if (entry === undefined || entry.sessionId !== sessionId) throw new MediaUnavailableError();
      if (entry.descriptor.expiresAt <= this.#now()) { await this.#release(id); throw new MediaUnavailableError(); }
      if (entry.strictVersion && await this.options.media.currentVersion(entry.assetId) !== entry.descriptor.snapshot.version) {
        await this.#release(id);
        throw new MediaUnavailableError();
      }
      const expiresAt = await this.#expiry(sessionId);
      this.options.media.renewOwner(entry.owner, expiresAt);
      this.options.media.renew(entry.descriptor.url.slice("/media/".length), entry.owner, expiresAt);
      clearTimeout(entry.timer);
      entry.timer = this.#timer(id, expiresAt);
      entry.descriptor = { ...entry.descriptor, expiresAt };
      return entry.descriptor;
    });
  }
  release(sessionId: string, id: string): Promise<void> {
    return this.#exclusive(async () => { if (this.#entries.get(id)?.sessionId === sessionId) await this.#release(id); });
  }
  invalidateAsset(assetId: string): Promise<void> {
    return this.#exclusive(async () => {
      for (const [id, entry] of this.#entries) if (entry.assetId === assetId && entry.strictVersion) await this.#release(id);
    });
  }
  close(): Promise<void> {
    this.#closed = true;
    this.#unsubscribe();
    return this.#exclusive(async () => { for (const id of this.#entries.keys()) await this.#release(id); });
  }
  async #expiry(sessionId: string): Promise<number> {
    if (this.#closed) throw new MediaUnavailableError();
    const verified = await this.options.sessions.verifySession(sessionId);
    if (!verified.authorized) throw new MediaUnavailableError();
    const expiresAt = Math.min(this.#now() + 300000, Date.parse(verified.session.expiresAt));
    if (expiresAt <= this.#now()) throw new MediaUnavailableError();
    return expiresAt;
  }
  #timer(id: string, expiresAt: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => { void this.#exclusive(() => this.#release(id)).catch((error: unknown) => this.options.onCleanupError?.(error)); }, expiresAt - this.#now());
    timer.unref();
    return timer;
  }
  async #release(id: string): Promise<void> {
    const entry = this.#entries.get(id);
    if (entry === undefined) return;
    this.#entries.delete(id);
    clearTimeout(entry.timer);
    await this.options.media.release(entry.owner);
  }
  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(work);
    this.#pending = result.catch(
      // error-provenance: allow cleanup -- caller receives rejection; serialization must remain usable
      () => undefined);
    return result;
  }
}
