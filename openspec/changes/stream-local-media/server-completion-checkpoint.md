# Server media completion checkpoint

September 30, 2026. Continuation of `shared-checkpoint.md`; these changes remain uncommitted. This records implementation and focused verification, not packaged/physical acceptance or publication.

## Completed production integrations

- Restore now uses one `LocalMediaService.maintenance(work)` boundary. The synchronous fence rejects new admission, preview acquisition, grants and opens; queued open registration settles before readers drain. Close accounting runs outside the exclusive storage mutation, avoiding deadlock. Concurrent maintenance remains fenced until all mutations finish, including failure recovery.
- Desktop audio and visual resolver consume occurrence-owned immutable records, incremental preparation verification and `{assetId, grant}` payloads. Registered media bodies are never read/copied into transport payloads. Audio grants are scoped by playback plus document, so a shorter overlapping document cannot shorten a longer document's grant. Existing explicit routing, common start, mute/stop and diagnostics remain.
- Alert replay retains authored timing documents only while its queue/recent items are retained. Replay reacquires current registered versions, resolves media-mode duration and source lengths from those same records, then admits a new owner. It does not retain old file pins for history.
- Effect preparation validates its owned records instead of current repository metadata and binds `assetVersions` to browser and desktop instructions.
- Timer run generations capture icon/start/end records. Icons verify freshly on start/restart; pause, hide, reorder and ordinary transport revisions retain that content owner and proof. Per-card `iconVersion` addresses the retained version. Stop/restart/completed-hold expiry/service close release run owners.
- Timer cues fork exact run records and duration into a separate cue owner. End cues survive completed-card hold expiry. Browser cues include version identity; device batches use the cue owner key. Device terminal completion/failure releases immediately; browser delivery has no completion acknowledgement, so its existing nominal duration plus five-second grace bounds ownership. Stop/close cancel those owners.
- Shared desktop timer icons have narrow version owners linked to every timer run using them. Finishing the first run cannot revoke another run's identical icon; different versions of one asset remain separate. Shared owners/grants release after the final run parent ends. Timer desktop snapshots refresh stable grants every minute; expiry remains bounded to one hour per issuance.
- One ALS preparation group coalesces simultaneous destination hashing, with owner/group cancellation and independent abort waiters. Cancelling either recipient leaves a healthy recipient's verification intact. Cancelling the last waiter aborts and drains its read. Every later group performs a fresh hash; identity proof is owner-scoped and subsequent range opens validate it.
- Owner/grant exhaustion has actionable `MEDIA_CAPACITY` 503 classification, distinct from unavailable references. Active stream capacity retains its existing 503 contract.
- Retirement deletion refuses canonical aliases, including in-root parent junctions, instead of deleting an alias's current/unrelated target. It unlinks the validated original retirement spelling. Filesystem confinement remains change detection, not protection against a hostile process racing directory changes.
- Generated server web shells now set both `Referrer-Policy: no-referrer` and document meta policy; the Vite template alone was not the served management document.

## Integration interfaces

Occurrence owners remain `JSON.stringify([moduleId, occurrenceId])`. Alert and effect audio playback IDs already carry that complete key. Timer run owners are `timerRunOwner(generation)`; cue owners are `JSON.stringify(["timers", "cue:<generation>:<start|end>"])`.

`runPreparation(work)` defines one preparation group. `verifyGroup(owner, ids, signal)` deduplicates per version within that group and scopes each caller's cancellation. `acquireFromOwner` creates independent cue ownership. `shareVersion` accepts only non-shared timer run sources and retains a persistent icon until its last source owner ends. `maintenance(work)` replaces the previous separated invalidate/mutate restore calls.

Desktop timer payloads can include one asset ID with different snapshot versions; the desktop contracts/controller resolve by asset ID plus version. Server grant handles remain stable across renewal, and renderer-private handles remain owned by main.

## Verification

- Consolidated affected server verification passed 379 tests across 22 files, including backup restore, HTTP, runtime, queues, admission, timers and desktop sinks.
- After the final per-recipient verification cancellation fix, seven focused suites passed 153 tests, including both cancelling-recipient orders, last-consumer read drain, real-service timer/replay lifecycles and audio/visual preparation. The separate long-running paused timer grant refresh regression passed with all seven module-snapshot tests.
- `tsc -b apps/server/tsconfig.json` passed and server dist was rebuilt after production edits. Changed server ESLint and error-provenance checks passed; strict OpenSpec validation passed.
- Real TCP HTTP regression serves a five-byte suffix from a 100 MiB sparse fixture and asserts exactly five file-stream bytes read. A paused recipient's disk reads plateau before the full file is consumed, the file stream buffers at most 64 KiB, and abort returns active readers to zero. This is bounded transport evidence, not a total-process/decoder memory measurement.
- Native browser seek/referrer/preview integration and packaged private-protocol acceptance are owned by the final web/package gates. Physical OBS/devices and original private large-media acceptance remain separate; none is claimed here.

No remaining known server production integration gap is deferred by this checkpoint. OpenSpec task completion and publication remain the coordinating agent's requirement/evidence reconciliation.
