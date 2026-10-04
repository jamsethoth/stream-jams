# Task 7 report — Music runtime ownership

Status: implemented in the Task 7 checkpoint. The runtime is composed but no Music output route or presentation sink is installed; Task 10 owns delivery to browser and desktop outputs. No user Pear instance was contacted and no live playback is persisted.

## Interfaces for Tasks 8, 10 and 12

- `MusicRuntimeCoordinator` accepts `getConfig`, `getActiveSource`, `createSource`, optional `sink`, `now`, `schedule` and `cancel`. Source selection supplies validated Pear configuration and a server-only token. The coordinator gives each adapter a fresh generation and abort signal.
- `reconcile(): Promise<void>` synchronously clears and invalidates the current generation, then stops the old adapter and starts the selected source when Music is enabled. Provider-management activation/deletion calls it. `refreshConfig(): Promise<void>` updates a saved appearance without restarting an already active source or resetting its appearance epoch; disable or first enable reconciles. `stop(): Promise<void>` aborts and stops the adapter, cancels deadlines, clears the projection and removes listeners.
- `getStatus(): MusicStatus`, `getProjection(targetProfileId): MusicWidgetProjection | null`, `generation`, `revision` and `subscribe((revision) => void): () => void` expose current live state. Subscription immediately reports the current revision. Publication revisions increase on snapshots, status/clear transitions, config changes and idle/stale deadlines.
- Optional `sink(publication)` gets `{ revision, generation, status, getProjection(targetProfileId) }`. Each event captures its own snapshot, config, status, appearance epoch and time. There is at most one active sink call and one latest pending event; a stalled recipient cannot delay adapter shutdown. Task 10 should compare revisions and use the injected sink or subscription to deliver current projections.
- `getArtworkDescriptor(ref, { providerId, generation })` delegates to the current Pear adapter only when the requested opaque reference belongs to the current live snapshot. Task 8 can use this to resolve private artwork before applying its fetch/cache policy.

## Behavior and verification

The accepted generation and highest source revision are kept in memory. Source switches invalidate callbacks before awaiting old shutdown. New tracks or genuine recovery establish a new server-owned appearance epoch; polls, pause/resume, new subscribers and appearance edits keep it. Independent profile idle deadlines and the 45-second stale deadline publish without another provider event. A rejected adapter start preserves `auth-required` if the adapter already reported it.

RED was observed with the coordinator absent using the workspace Vitest binary, and further focused RED runs demonstrated the deadline, publication-capture, auth-status and blocked-recipient defects before their fixes. The requested Corepack command failed with Corepack-cache `EPERM`; workspace binaries were used for the same gates.

- Coordinator and affected runtime/provider tests: 4 files, 70 tests passed.
- `tsc -b packages/test-support/tsconfig.json apps/server/tsconfig.json`: passed.
- Targeted ESLint on changed server TypeScript files: passed.
- `git diff --check`: passed.

## File changes and reasons

- `apps/server/src/modules/music/music-runtime-coordinator.ts`: live generation/revision ownership, appearance epoch, deadlines, bounded publication, subscription and artwork descriptor boundary.
- `apps/server/src/modules/music/music-runtime-coordinator.test.ts`: disabled startup, source switch and late work, revision/epoch, both profile idle deadlines, stale expiry, config refresh, auth failure, slow recipients, shutdown and restart regressions.
- `apps/server/src/runtime/runtime-composition.ts`: construct Pear sources from active registration and server-only secret, reconcile on provider activation and enable/disable, refresh appearance config, register awaited shutdown, expose coordinator to later tasks.
- `apps/server/src/runtime/runtime-composition.smoke.test.ts` and `runtime-composition.test.ts`: update registry expectations for the already registered disabled Music module, so affected runtime gates reflect the current module list.

Remaining integration: Task 8 provides secure artwork bytes and authorized reads; Task 10 supplies output sinks/routes and current-state delivery; Task 12 provides management status/reconnect. No production output listener is wired in this checkpoint.
