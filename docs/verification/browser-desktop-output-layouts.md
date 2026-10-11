# Browser and desktop output layouts

This record covers `separate-browser-desktop-output-layouts`, implemented in ordered slices through S10 (`395d16e3`) and final S11 integration. The [accepted baseline and S01–S10 slice records, including the Timer correction](browser-desktop-output-layouts/slice-acceptance.md) retain the accepted S10 text; only the relative plan link is adjusted for the sibling location. The active change remains unarchived. Final S11 executed gate results are recorded below; earlier slice results are supporting evidence, not a fresh final-suite result.

Ordinary setup has eight choices: Alerts, Music and Timers in Landscape/Vertical, plus Videos and Screen Effects without profiles. Music/Timers/Videos use saved local CSS-pixel content canvases independently of desktop placement. Alerts/Effects retain scene placement. Manual sends use the shared bus with explicit manual provenance and ordinary playback. Videos has one durable ordinary queue and independent migration-review/length holds. Public test/unified recipients are retired; trusted private desktop composition remains supported.

## Reproducible baseline and candidate measurements

The pinned baseline is source `b64b2e79c9790d899736895c7cbcb74387c2d0d5`, with empty tracked diff. [Provenance](browser-desktop-output-layouts/provenance.json) records original and promoted hashes separately. [Saved configurations](browser-desktop-output-layouts/baseline/saved-configs.json) and [baseline metrics](browser-desktop-output-layouts/baseline/metrics.json) are copied byte for byte; the compiled input hash manifest is retained. Two selected synthetic captures show the original Music and fractional Timer fixture. Other repetitive scratch captures remain unpromoted; original scratch evidence is retained.

The shared tracked controller removes raw diff capture and declares standard runtime globals/imports. The candidate adapter validates saved Music and upgrades Timer/Video configurations using production pure helpers. It preserves the pinned Timer Landscape region640×280/capacity12 and Vertical984×480/capacity12, including fractional slots. It does not adjust the baseline to fit new validation.

From a freshly built Windows repository root:

```powershell
corepack.cmd pnpm exec node scripts/browser-desktop-output-benchmark.mjs --mode comparable --output .superpowers/sdd/2026-10-10-browser-desktop-output-layouts/performance/runs/comparable-01
corepack.cmd pnpm exec node scripts/browser-desktop-output-benchmark.mjs --mode compact --output .superpowers/sdd/2026-10-10-browser-desktop-output-layouts/performance/runs/compact-01
```

Use a new output directory for a diagnosed rerun. Environment/browser/hash mismatches abort rather than silently replacing the baseline. A new baseline would require the exact old source/build; running the candidate against current source never creates an old baseline.

Comparable load retains three outputs 1920×1080/1080×1920/1920×1080, 14 running 600-second timers/capacity12,10-second idle/max phases, five 3.2-second track changes,20 subscribed events with immediate redelivery and 100ms spacing, and five offline non-autoplay Video requests. The original 1.485-second admission tail and old unknown response-item parser labels remain explicit in pinned metrics. Compact measurement changes only the same three recipients' dimensions. Extra candidate mixed manual/subscribed latency and real-scheduler formatted-clock observations run after the pinned samples and are labeled separately.

Node CPU is percent of one logical core and includes service plus controller; RSS includes adapter allocations. Chromium CDP task time/JS heap and requestAnimationFrame intervals are browser observations. Neither establishes browser process CPU/RSS, native GPU, OBS encoding, video decoder pacing or audibility. Baseline native/OBS/GPU/audio/video decoding metrics do not exist. A short single run cannot establish a numerical speedup or long-duration retention. Bounded journal, receiver and receipt retention is separately covered by owning tests.

## Integrated cases and owning coverage

`tests/e2e/browser-desktop-output-layouts.spec.ts` adds three real built-runtime cases using the existing disposable fixture:

- I1 checks all eight ordinary choices, disabled/reconnect saved bounds, fixed CSS-pixel clipping, desktop-independent Music dimensions, a real private Timer presentation and a held stale bootstrap after Timer config save.
- I2 checks distinct manual IDs, subscribed redelivery, all four independent consumer receipts, null manual registration/correlation, strict forged-input rejection and one durable queued Video admission. Default nonmatching/disabled consumer outcomes are deliberately truthful; this case does not claim active playback solely from receipt count.
- I3 opens a genuine pre044 SQLite prefix with the unchanged pinned legacy Timer configuration and ordinary key, upgrades/restarts once, then round-trips legacy/current portable archives with exact normalized output identities and geometry. Portable desktop binding/consent clears, and previous keys reject.

Active cross-consumer matching/rejection, device-only output and once-only manual redelivery belong to `manual-alert-effect-service.test.ts`, `manual-event-service.test.ts`, `video-bus-admission.test.ts` and Timer event-rule tests. `manual-event-delivery.spec.ts` verifies real editor Preview never journals or plays devices and saved/draft sends reach ordinary browser/private desktop once. `unified-streaming-layering.spec.ts` verifies healthy Alert/Effect/cue media occurrences survive Timer/surface changes through the production private renderer; its injected imports intentionally require Vite development. `video-output-placement.spec.ts` and native `video-mirror.spec.ts` verify primary/session/peer identity through geometry changes without comparing advancing frames as static images. The frozen Timer old-renderer browser fixture proves ordinary clock/icon decoded pixels and fractional rectangles independently; very long countdown ellipsis is intentional and saved paused-border alpha quantization is bounded to one color step.

## Canonical reconciliation

All 39 requirements across 16 deltas were matched to accepted source and owning tests before intelligent canonical merge; the [exact requirement trace](browser-desktop-output-layouts/requirements.md) maps each title. Unrelated 151 requirement blocks remain unchanged after line-ending normalization. Six additional supersession blocks reconcile scene fit vs content 1:1 rendering, transparent playback failure, local Music preview, ordinary key smoke setup, independent Video review/length holds and the sole Video queue/Recent 10. The historically named requirement `Management Test Audio Can Be Activated In Place` retains the approved title with the new ordinary no-prompt behavior. Dated plans/audits/verification records retain their original evidence under the documentation policy.

## Final gates and native limits

Final root lint/error-provenance and strict typecheck passed. After the last I1/OBS test-only corrections, scoped lint and strict typecheck passed again. The root unit command initially passed 400 files/3,894 tests and failed four files/eight stale S10-contract assertions; corrected affected rerun passed four files/52 tests. This is a repaired full-tree run plus affected rerun, not a second wholly green root invocation. The exact 17 Node script files separately passed 132 tests with one existing platform skip.

| Gate | Executed result |
| --- | --- |
| Production build/fresh runnable desktop package | Passed via `desktop:package`; ASAR 41,878,732 bytes, SHA256 `C82A6563359FBD93E412673B65441FEFAA78D0C7B396A9F98EC673D141B5A2A3` |
| I1-I3 | Initial I2/I3 passed; I1 lacked an active Timer and correctly received null. Silent start/pause setup plus static pixel assertion corrected; scoped I1 passed. |
| Built owning browser | 18/18 passed: canvas, local/manual delivery, Music placement, persistent crash, frozen Timer, Video admission/placement/migration and retirement restore |
| Ordinary production audio failure | 1/1 passed; exactly one denied attempt, transparent/no retained replay and explicit next-occurrence recovery |
| Private layering | 1/1 passed through production private renderer on Vite development; this injected fixture is intentionally separate from built-shell evidence |
| Production Storybook | Build passed; selected 16 suites/82 interactions passed, 33 suites excluded; accessibility and console gate clean |
| Native workspace/window | 2/2 passed; copied production-window/software renderer and actual loopback mirror, distinct from full ASAR |
| Fresh packaged host/Music/Timer | 3/3 passed on the fresh ASAR |
| Silent two-sink Timer destinations | 1/1 passed; renderer recovery/paused generation, destination isolation, no cue replay and Quit; physical audibility false |
| Portable OBS 32.2.2 | Final 1/1 passed in 3.7 minutes after two diagnosed harness failures; ordinary geometry plus retired actual 401 completion/reconnect and warped uploaded-font assertions |
| Comparable and compact performance | Each matched environment/Chromium and pinned fixtures, completed and cleaned owned resources; separate metrics and diagnostic below |
| Strict OpenSpec | Named change valid; all 50 canonical specs passed |

Startup gzip graph bytes are bootstrap 73,937, overlay 158,197, Operator 195,683 and management 255,545, within unchanged respective 100/154.75/191.25/250 KiB limits and dependency checks. Overlay/Operator increased 464/366 bytes versus S09, a startup cost, not a runtime claim.

[Native evidence](browser-desktop-output-layouts/native-evidence.json) retains sanitized package/exit/silent Timer observations. [OBS asserted coverage](browser-desktop-output-layouts/obs/asserted-coverage.json) covers every executed phase with exact asserted dimensions and paired coverage/hash relationships. Selected actual native Music black/white captures and source receipts are retained alongside it. OBS frontend PNGs are RGB, so decoded PNG alpha is unusable: native black/white matte composites prove empty/extra-area transparency. The list reporter did not persist the body-only complete geometry attachment; exact per-phase raw hashes/counts were not retained after cleanup. The promoted summary labels asserted bounds/equalities explicitly and does not invent raw samples. The initial RGB-alpha failure and later Windows atomic-file publication race remain recorded; only bounded publication of the same request ID is retried.

[Performance summary and narrow diagnostic](browser-desktop-output-layouts/performance-summary.json), [comparable metrics](browser-desktop-output-layouts/comparable/metrics.json) and [compact metrics](browser-desktop-output-layouts/compact/metrics.json) retain the measured costs. Comparable offline Video HTTP latency increased from 9.30-13.99 ms to 79.34-175.93 ms. A separate three-request probe measured 344.33 ms of SQLite statement work within 411.35 ms summed Video HTTP wall time: manual journal/intake, all four consumer outcomes/cursors and transactional item/receipt are now durable. The 100 ms outcome wait is a pending deadline, not a fixed sleep.

Canonical p95 nearest rank increased 112.02 to 181.61 ms (baseline maximum 1,484.91 ms remains retained). Event Node CPU increased 0.563 to 0.891 seconds per ten-second phase; 20/20 Timer frame totals increased 85,100/79,240 to 106,500/99,960 bytes. Baseline already had four consumers. The exact causal split between validation/payload work, storage latency and noise is unmeasured; this is an observed increase. Comparable idle RSS 203.01 MiB fell to 152.56 MiB next phase; compact idle was 149.97 MiB. Diagnostic forced GC lowered heapUsed 118.63 to 78.97 MiB while RSS stayed about 220 MiB, so GC alone does not explain the RSS delta. Each extra real-scheduler eight-second probe saw eight formatted second changes and zero Timer messages. The separate compact run includes a 511.65 ms Video tail. No numerical speedup or no-regression claim follows. OBS copies installed binaries/data only into an isolated portable profile, with muted sources/no monitoring. The Video OBS no-clip notice geometry is complemented by native/browser active Video evidence; it does not claim OBS provider playback. Workspace software-renderer Video probes remain distinct from full packaged ASAR tests. Silent observations do not establish physical audibility, input focus or real-game behavior.

## S11 accepted — integrated verification and canonical delivery

Parent reviewed the final integration cases, test corrections, benchmark/provenance tooling, native OBS harness, canonical reconciliation and current documentation. Earlier accepted slice evidence is preserved in a linked record. All 39 approved delta requirements are mapped; 16 canonical capabilities are synchronized, all 50 canonical specifications validate, and implemented BL-068 is removed. The OpenSpec change remains unarchived.

Final verification includes root lint/error provenance and strict typecheck; fresh production build/package; 132 script checks with one existing platform skip; three integration cases, 18 owning browser cases and separate production audio/private-layering checks; 82 Storybook interactions; native workspace 2/2, packaged 3/3, silent Timer destination 1/1, and portable OBS 1/1. The original full Vitest run passed 3,894/3,902 tests; eight stale expectations in four files were corrected and the affected 52/52 passed. It is not represented as a second green full invocation.

The native OBS probe uses actual black/white matte composites because its screenshot format has no alpha channel. The diagnosed Windows coordination fix retries atomic publication of the same command ID, never the native action. Selected actual native captures/receipts and an explicitly labeled asserted-coverage summary are retained; complete raw per-phase observations were not retained after successful cleanup. Fresh ASAR SHA256: C82A6563359FBD93E412673B65441FEFAA78D0C7B396A9F98EC673D141B5A2A3.

Performance costs remain explicit: comparable Video admission rose from 9.30–13.99 ms to 79.34–175.93 ms, with a separate compact-run 511.65 ms tail. A bounded diagnostic attributes most sampled Video admission time to durable SQLite work. Canonical event CPU/payload increases and transient RSS observations are retained with their causal uncertainty. No numerical speedup, universal memory/GPU/decoder claim, or physical audibility/input/game acceptance is inferred.

Final independent review by a gpt-6.1-sol/light review subagent found no actionable defects or required fixes across the final tracked changes and S11 additions. It explicitly checked retirement/legacy scopes, selective revoke versus restore fencing, durable admission/review holds, migration/restore, canvas revisions, fractional Timer geometry and frontend media identity. The reviewer confirmed readiness for parent acceptance while retaining the documented performance and physical-evidence limits. Parent accepts S11 for commit, push and PR; no in-scope blocker remains.
