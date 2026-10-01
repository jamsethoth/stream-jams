# Streaming media final acceptance — October 1, 2026

The original acceptance pass completed all in-scope tasks with the measurement boundaries below. Subsequent independent-review corrections and current PR status are recorded in [review-fixes.md](review-fixes.md). This acceptance evidence is not installation or archive. Earlier dated checkpoints retain their original evidence; this record supersedes their pending acceptance lists.

## Final verified matrix

| Gate | Current result | Local ignored evidence |
| --- | --- | --- |
| Full Vitest suite | 292 files, 2,543 tests passed; exit 0 | `apps/desktop/out/final-unit.log` |
| Node script tests | 52 passed, zero failures; exit 0 | `apps/desktop/out/final-node-tests.log` |
| Workspace ESLint and TypeScript | Both exit 0; new test/helper checks also pass | `final-lint.log`, `final-typecheck.log`, scoped final checks |
| Production workspace build and Forge package | Both exit 0; initial Corepack sandbox access and live-file-lock failures were environmental, corrected before the passing runs | `final-build.log`, `final-package-retry.log` |
| Storybook build and affected interaction/accessibility/console checks | Build exit 0; 94 tests in six suites passed; 21 unrelated suites excluded by the streaming tag | `final-storybook-build.log`, `final-storybook-tests.log` |
| Affected browser workflows | 11 media/overlay/asset cases, nine Effects/Timers/real-preview cases, and one new unified layering case passed | `final-e2e.log`, `final-preview-consumers.log`, `final-unified.log` |
| Built service resource/recovery regressions and benchmark | Eight tests passed; benchmark exit 0 | `final-streaming-benchmark.log`, `streaming-automation-resources/server-worker-memory.json` |
| Packaged native software format checks | Five passed | `final-native-software.log` |
| Packaged selected-device format, recovery and advancing decoder-stall checks | Three passed, muted/zero gain in disposable profiles | `final-native-hardware.log` |
| Direct instrumented packaged service resources | One test, six size/pass measurements; all counters zero, read chunks at most 64 KiB, no complete-body store reads, small IPC and normal Quit/PID exit | `streaming-automation-resources/packaged-resources.json` |
| Physical desktop/OBS and SFX/Game | User-confirmed original large effects, transparency, routing/aliases, gain, fades, mute/stop, cross-module coexistence; additional image/video/audio formats confirmed | [manual-physical-checkpoint.md](manual-physical-checkpoint.md) |
| Post-purge storage-read timing | User's elevated run passed all fixture mappings and exact-file storage reads with zero lost events/buffers and completed cleanup | [cold-timing-checkpoint.md](cold-timing-checkpoint.md) |

The original acceptance rebuild's ASAR SHA-256 was `14c343e31dff3a7c44efe831acbe823830f9e6984433641bedf5d6f6fb23ca14`, identical to the application used for those user-assisted physical/cold timing checks. That final validation pass added tests and documentation only; the later review corrections are separately identified above. No installed executable, production configuration or user assets were replaced.

## Closed remaining gaps

`tests/e2e/unified-streaming-layering.spec.ts` now verifies real HTTP 206 video delivery and advancing native clocks, unified surface paint/hit ordering, preserved video identity through reordering, and effect-only stop preserving the advancing alert and timer. Composition/WebSocket inputs are mocked; asset routes and Chromium playback are real. Separate user OBS observations cover physical output coexistence.

`tests/desktop/utility-resource-observer.ts` instruments a disposable packaged Electron utility process using the unchanged ASAR service/store/worker. It records process memory and existing internal counters through a test-only loader, forbids complete-body reads during playback, and observes stream chunk lengths without collecting bodies. Six runs measured peak external growth up to 70,320,592 bytes, with no positive retained external/ArrayBuffer growth after GC. All owners/grants/service readers/store readers returned to zero. The largest renderer IPC envelope was 1,064 bytes. Quit took 358 ms; exit was zero and all captured PIDs exited.

## Acceptance boundaries

- Post-purge startup measurements are combined integrity verification through at least 50 ms of native audio clock advancement: 236/271/365 ms versus 234/272/340 ms warm for 1/25/100 MiB. One pair is an observation, not a statistical latency guarantee or isolated checksum duration.
- Exact-file storage reads totaled 1/25/7 MiB during those windows. System-process reads are identified separately and do not establish causal ownership or unique range coverage. The approved ETW alternative closes startup with observed storage reads after a requested OS-cache purge. Complete file eviction, SSD/controller cache state and hardware-cold access are excluded; the earlier stronger task 5.7 approach was superseded rather than silently passed.
- Packaged direct counters/memory use a test loader and explicit GC; they do not claim the untouched shipping entrypoint has the same GC schedule. Peaks sampled every 1 ms can miss transient allocations. Incremental file chunks, forbidden body reads, retained-buffer checks and bounded IPC provide complementary evidence. No constant total-process, decoder or working-set limit is claimed.
- The true audio-only Opus fixture is intentionally silent: it proves decoding/seek and absence of unexpected sound, not audible Opus output. User-confirmed original WebM soundtracks provide audible selected-device coverage separately. Unsupported-codec failures are bounded software checks, not audible tests.

## Delivery state

The five canonical capabilities are synced, preserving unrelated existing requirements/scenarios. Strict change and canonical-spec validation pass. OBS Effects, Alerts and Timers ports were restored by the user to the installed configuration's port 39187. The disposable manual app was closed before repackaging; no normal-Quit timing claim is inferred from that launcher interruption. Independent packaged tests provide the normal-Quit evidence.

At this acceptance checkpoint the change was active and uncommitted. No commit, push, PR, archive, install or additional cache purge was performed during validation. Subsequent publication is separately authorized and does not alter these recorded results.
