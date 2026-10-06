/** One active output refresh and one coalesced latest-state refresh. */
export function createMusicOutputSyncQueue(sync: (includeTest: boolean) => Promise<void>): (includeTest?: boolean) => Promise<void> {
  let activeMusicOutputSync: Promise<void> | null = null;
  let activeMusicIncludesTest = false;
  let pendingMusicOutputSync: { includeTest: boolean; promise: Promise<void>; resolve(): void; reject(error: unknown): void } | null = null;
  const launchMusicOutputSync = (includeTest: boolean): Promise<void> => {
    activeMusicIncludesTest = includeTest;
    const work = sync(includeTest);
    activeMusicOutputSync = work;
    const finish = () => {
      activeMusicOutputSync = null;
      const pending = pendingMusicOutputSync;
      pendingMusicOutputSync = null;
      if (pending !== null) {
        const next = launchMusicOutputSync(pending.includeTest);
        void next.then(pending.resolve, pending.reject);
      }
    };
    void work.then(finish, finish);
    return work;
  };
  return (includeTest = false): Promise<void> => {
    if (activeMusicOutputSync === null) return launchMusicOutputSync(includeTest);
    if (pendingMusicOutputSync === null) {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
      void promise.catch(
        // error-provenance: allow expected -- tracked output work records failures; callers choose whether refresh failure is fatal
        () => {}
      );
      pendingMusicOutputSync = { includeTest: includeTest || activeMusicIncludesTest, promise, resolve, reject };
    } else {
      pendingMusicOutputSync.includeTest ||= includeTest;
    }
    return pendingMusicOutputSync.promise;
  };
}
