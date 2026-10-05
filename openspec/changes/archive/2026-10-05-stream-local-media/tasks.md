## 1. Baseline And Contract Preparation

- [x] 1.1 Fetch origin/main, confirm the Windows worktree/branch and unimplemented scope, and create the first slice branch from the current remote baseline with this committed proposal available.
- [x] 1.2 Reconcile current canonical media/timing/security specs and map every registered-asset consumer, including timer icons/cues and all management preview helpers; record the applicable format/output matrix. See consumer-map.md.
- [x] 1.3 Add positive and rejected reference/grant contract fixtures and define private protocol version negotiation, version snapshots, ownership identities, and the documented resource limits.

## 2. Slice One: Shared Streaming And File Lifetimes

- [x] 2.1 Verify the installed @fastify/static/@fastify/send supported APIs against pinned-file identity, path confinement, bounded reads, cancellation, and the HTTP contract. Document any gap before selecting a narrow Node file-handle adapter or revising the integration; do not introduce a parallel range/precondition implementation. See library-findings.md: use Node FileHandle/Fastify with jshttp utilities.
- [x] 2.2 Integrate library-backed file delivery and switch existing management/overlay media routes to streaming through thin authorized handlers; test GET/HEAD, all supported ranges, 200/206/304/416, ETag/preconditions, MIME/no-store headers, overflow input, same-file identity, path confinement, cancellation/close failures, and authorization before metadata disclosure.
- [x] 2.3 Implement pinned version ownership at admission, preview acquisition, and persistent module revision boundaries; test rejection, purge, skip, completion, concurrent recipients, visibility/reorder, and service loss release.
- [x] 2.4 Implement recoverable retirement intent and deferred deletion; test replacement while queued/reading, failed metadata update, interruption/restart, Windows delete behavior, restore invalidation, and protection of current/unrelated files.
- [x] 2.5 Implement cancellable incremental desktop integrity verification coalesced within preparation groups; test mismatched checksum/size, changed file identity, missing files, and verification deadline expiry without full-body allocation.
- [x] 2.6 Add scoped media grant create/read/revoke operations for trusted owners, bounded capacity, read cancellation, generation invalidation, and token redaction; verify that neither grants nor overlay credentials authorize management operations.
- [x] 2.7 Exercise a real HTTP media seek and slow/aborted reader against the rebuilt service; prove interval-only body reads, backpressure, and reader counts returning to baseline. Run affected core/server tests, typecheck, lint, and build before handing off the first slice.

## 3. Slice Two: Desktop References And Protocol Adapters

- [x] 3.1 Validate session-local Electron media handlers with real packaged ranged media, streaming Response bodies, cancellation, and same-origin Web Audio gain; record pass/failure evidence before committing to the transport switch.
- [x] 3.2 Implement the trusted main-process grant registry and fixed-origin HTTP adapter; test recipient/generation scoping, GET/HEAD-only access, redirect rejection, allowed header forwarding, CSP, teardown, and absence of renderer paths/tokens.
- [x] 3.3 Switch selected-device audio preparation/player ownership from bulk bytes/Blobs to references; test original-size videos above 25 MiB, independent audio, two device routes, aliases, gain/fades, and unsupported/trackless media.
- [x] 3.4 Switch desktop transient visuals and persistent timer media to references; test transparent video, images/GIFs, module revision changes, missing icons, hide/re-show, and shared version retention.
- [x] 3.5 Remove obsolete audio/visual bulk transport caps and ownership code after all desktop consumers switch; retain import limits, bounded counts, stop/mute enforcement, strict schemas, and explicit incompatible-runtime diagnostics.
- [x] 3.6 Verify prepare-before-start and actual-onset durations under slow preparation, failed recipients, rapid skip, stream stalls, worker/renderer loss, and recovery; healthy configured recipients must continue without rerouting or replay.
- [x] 3.7 Run affected core/server/desktop/web tests and typecheck; rebuild/package and verify the new private media paths in an isolated runtime, including background playback and bounded Quit. Record any outstanding physical gate explicitly.

## 4. Slice Three: Management Previews And Acceptance

- [x] 4.1 Implement typed management preview create/renew/release operations using the existing session/origin/CSRF controls, five-minute expiry, one-minute renewal, stable version URLs, no-referrer/no-store, and redaction.
- [x] 4.2 Replace fetched registered-media Blobs across Assets, Alerts, Screen Effects, and Timers with owned streaming references; preserve silent previews, explicit audition behavior, local File previews, and cleanup on selection/navigation.
- [x] 4.3 Add focused component, Storybook, and browser coverage per the frontend guide for stable renewal, replaced media, expired/background sessions, read failures, and teardown without live-output side effects.
- [x] 4.4 Complete format/output acceptance using redistributable fixtures, including transparent WebM, MP4 with beginning/end metadata, GIF/WebP/images, all accepted audio containers, unsupported codecs, and no-audio-track videos.
- [x] 4.5 Measure cold/warm preparation and onset, server/host external memory, renderer memory, IPC payload size, and active reader/grant cleanup with 1/25/100 MiB controlled fixtures; prove no whole-file application transfer and document decoder-memory limits separately.
- [x] 4.6 Verify the original large Clean Screen/Snowball files in an isolated runtime without committing private media; record physical OBS and selected-device tests, amplification, mute/stop, hidden management, and shutdown against the rebuilt package.
- [x] 4.7 Run the required publication matrix for affected code: lint, typecheck, tests, build, relevant Storybook gates, Playwright, and packaged checks. Resolve relevant failures without weakening tests and keep missing physical acceptance explicitly incomplete.
- [x] 4.8 Reconcile every requirement against implementation/evidence, update current delivery documentation, strict-validate the OpenSpec change, and sync canonical specs only after completion. Archive only when requested under the matching workflow; do not replace the user's installed runtime without authorization.

Final evidence and the explicitly approved storage-read/memory observation limits: see final-acceptance.md. All in-scope acceptance is reconciled; publication, installation and archive are not implied.

## 5. Repeatable Automated Acceptance

- [x] 5.1 Add repeatable native format and compositing regression tests for end-metadata MP4 seeking, unsupported codecs, animated GIF continuity, audio-only WebM, and transparent streamed visuals using small licensed or generated fixtures.
- [x] 5.2 Add failure-injection coverage for slow preparation, failed-recipient isolation, rapid skip, stalled streams, renderer/worker loss, and future-only recovery; assert observable playback and ownership cleanup rather than only mocked calls.
- [x] 5.3 Add repeatable 1/25/100 MiB resource tests for bounded interval reads, fresh verification, small private IPC payloads, and owner/grant/reader cleanup, with memory measurements that distinguish retained application buffers from native decoder allocation.
- [x] 5.4 Run the affected automated suites and package checks, document their reproducible commands and evidence, and reconcile remaining manual physical-output and true OS-cold-cache criteria without changing the installed runtime.
- [x] 5.5 Add a packaged native decoder-body stall regression that demonstrates advancing playback before withholding delivery, bounded stall failure and cancellation, healthy-layer continuity, and fresh subsequent playback without replay. Leave physical-output, OBS and OS-cold acceptance unchanged.
- [x] 5.6 Add a default nonmutating, explicitly acknowledged Windows cache-purge timing runner with reviewed signed-tool command evidence, bounded pairs/children, disposable fixtures, zero ownership cleanup, fail-closed prerequisites and focused safety tests. Verify dry-run and actual service warm-only measurement; see cold-timing-plan.md and cold-timing-checkpoint.md.
- [x] 5.7 Run the opt-in cache-purge path from an elevated Windows terminal with user-accepted RAMMap EULA and retain request/timing/cleanup evidence. The approved ETW alternative in 5.9–5.11 supersedes the original whole-file/physical-media-cold criterion: accept only exact-file storage reads within measured startup windows, without claiming complete eviction or hardware-cold access. Native clock advancement and physical output acceptance have separate evidence.
- [x] 5.8 Extend the runner with valid fully materialized imported/probed MP4s and muted packaged native clock-advancement observations; verify warm-only operation and retain artifact/runtime/cleanup evidence. See schema 2 cold-timing checkpoint.
- [x] 5.9 Investigate trusted exact-file residency evidence using the supplied RAMMap 1.63 snapshot. Document the unvalidated PFN join/completeness gap and adopt the approved ETW storage-read alternative without claiming whole-file eviction. See cold-timing-plan.md; the earlier full-eviction approach is superseded.
- [x] 5.10 Integrate maintained-library ETW capture/analysis into the local runner, with nonpurging attribution validation, owned bounded sessions, exact-fixture/window storage-read evidence, loss checks, per-pair aggregation and failure-safe cleanup. Verify the helper, focused automated checks, default dry-run and packaged warm mode; see cold-timing-etw-plan.md.
- [x] 5.11 Validate the nonpurging trace control and explicitly acknowledged purge/storage-read comparison from an existing Administrator PowerShell. Retain actual local evidence before accepting startup with verified storage reads after OS-cache purge; whole-file eviction and SSD/controller-cold claims remain excluded.
