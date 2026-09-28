# Repository Error-Provenance Verification

Date: 2026-09-28
Change: `preserve-error-provenance`
Branch: `codex/repository-error-provenance`

## Scope

This report verifies the repository-wide error-provenance contract across core
serialization, server persistence, browser-source overlays, management browser
boundaries, Electron processes, and static enforcement. The change does not
include the separate alert-set landscape/vertical enablement refactor. No
hosted telemetry or automatic dump upload was added.

## OpenSpec scenario traceability

| Requirement and scenario | Owning source | Regression evidence |
| --- | --- | --- |
| Raw diagnostics: nested operational exception | `packages/core/src/diagnostics/serialized-exception.ts`; `apps/server/src/modules/diagnostics/runtime-jsonl-logger.ts` | `serialized-exception.test.ts` — “serializes Error name message stack code and nested cause”; `runtime-jsonl-logger.test.ts` — “writes a redacted structured exception with code and nested cause” |
| Raw diagnostics: historical runtime log | `apps/server/src/modules/diagnostics/runtime-jsonl-logger.ts` | `runtime-jsonl-logger.test.ts` — “normalizes historical JSONL entries without an exception field” |
| Raw diagnostics: non-Error value | `packages/core/src/diagnostics/serialized-exception.ts` | `serialized-exception.test.ts` — “serializes primitive and cross-realm error-like throws” and “survives throwing getters and cyclic causes” |
| Diagnostic fallback: normal JSONL append fails | `apps/server/src/modules/diagnostics/runtime-jsonl-logger.ts`; `emergency-log-writer.ts` | `runtime-jsonl-logger.test.ts` — append-failure emergency record; `emergency-log-writer.test.ts` — independent bounded synchronous record and recursion guard |
| Diagnostic fallback: cleanup also fails | audited ownership paths; primary/secondary aggregate handling in configuration backup and runtime shutdown | `serialized-exception.test.ts` and `runtime-jsonl-logger.test.ts` — primary cause plus bounded, redacted secondary failures; `configuration-backup-service.test.ts` — cleanup failure after restore; `shutdown-log.test.ts` — structured shutdown failure evidence |
| Catch classification: context added | repository production TypeScript; `scripts/error-provenance-check.mjs` | `scripts/error-provenance-check.test.mjs` — rejects contextual errors without `cause` |
| Catch classification: expected outcome | repository production TypeScript; `scripts/error-provenance-check.mjs` | `scripts/error-provenance-check.test.mjs` — accepts exact reasoned exemptions and rejects malformed exemptions |
| Overlay: timed video preparation fails | `packages/core/src/audio/prepare-timed-media.ts`; `apps/web/src/overlay/components/OverlaySurface.tsx` | `prepare-timed-media.test.ts` — seek/metadata/media-error cause tests; `OverlaySurface.test.tsx` — timed-video preparation behavior |
| Overlay: browser rejects playback | `apps/web/src/overlay/components/OverlaySurface.tsx`; `OverlayApp.tsx`; `overlay-client.ts` | `OverlaySurface.test.tsx` — rejected starts; `OverlayApp.lifecycle.test.tsx` — transparent removal and one failed report; `overlay-client.test.ts` — failure envelope transport |
| Overlay: untrusted route identity | `apps/server/src/websocket/overlay-gateway.ts` | `overlay-gateway.test.ts` — registered-client lifecycle report uses authoritative identity |
| Overlay: malformed or oversized payload | `packages/core/src/overlays/playback-failure.ts`; `apps/server/src/websocket/overlay-gateway.ts` | `playback-failure.test.ts` — strict bounded schema; `overlay-gateway.test.ts` — malformed report rejection |
| Management: React rendering fails | `apps/web/src/management/foundation/ManagementErrorBoundary.tsx`; `client-error-reporter.ts` | `ManagementErrorBoundary.test.tsx` — one report, safe recovery copy, same reference; `tests/e2e/management.spec.ts` — controlled bootstrap failure to Raw logs |
| Management: failure outside React | `apps/web/src/management/diagnostics/client-error-reporter.ts`; `apps/web/src/main.tsx` | `client-error-reporter.test.ts` — window error and unhandled rejection registration, reporting, and cleanup |
| Management: reporting also fails | `apps/web/src/management/diagnostics/client-error-reporter.ts` | `client-error-reporter.test.ts` — one console fallback without recursive retry |
| Management: authorization absent | `apps/server/src/http/routes/management-diagnostics.ts`; management auth and CSRF prehandlers | `management-diagnostics.test.ts` — auth, CSRF, strict validation, and one bounded report |
| Desktop: worker command fails | `apps/desktop/src/service-worker.ts`; `service-supervisor.ts`; `desktop-ipc.ts`; `overlay/overlay-ipc.ts` | `service-supervisor.test.ts` and `worker-overlay-client.test.ts` — worker and renderer exceptions cross process boundaries with the same reference; diagnostic-persistence failure retains the original report |
| Desktop: renderer or child terminates | `apps/desktop/src/main.ts`; `overlay/private-overlay-window.ts`; `overlay/overlay-window.ts` | `overlay-window.test.ts` — renderer exit details before transparent failure; focused desktop diagnostics tests cover bounded process fields |
| Desktop: prior native crash dump | `apps/desktop/src/desktop-diagnostics.ts`; `main.ts` | `desktop-diagnostics.test.ts` — bounded basename/timestamp only; `tests/desktop/shutdown-diagnostics.spec.ts` — Crashpad upload disabled |
| Desktop: fatal JavaScript entry point | `apps/server/src/runtime/fatal-process-errors.ts`; `apps/desktop/src/main.ts`; `service-worker.ts`; renderer entry points | `fatal-process-errors.test.ts`; packaged shutdown diagnostics exercises renderer failure and local evidence |

## Automated gates

Results are filled from fresh commands run against the final Task 8 working
tree. A command is not marked passing merely because an earlier task ran a
subset.

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused provenance Vitest matrix | Pass | Final remediation run exited 0; 6 files, 105 tests. Earlier 10-file and broader focused matrices also passed. |
| `corepack.cmd pnpm lint` | Pass | Exit 0; ESLint and the repository provenance checker reported zero violations after the final audit corrections. |
| `corepack.cmd pnpm typecheck` | Pass | Exit 0; `tsc -b tsconfig.json`. |
| `corepack.cmd pnpm test:unit` | Pass | Final exit 0; 259 Vitest files and 2,238 tests, then 22 Node helper tests. |
| `corepack.cmd pnpm build` | Pass | Exit 0; all five workspace projects built and all web route bundle budgets passed. |
| `corepack.cmd pnpm test:storybook:ci` | Pass | Exit 0; 24 suites and 245 browser tests. Existing Story Store deprecation warnings did not fail the console-error gate. |
| `corepack.cmd pnpm test:e2e` | Pass | Exit 0; 55 Chromium tests against the rebuilt web/server output. |
| `corepack.cmd pnpm desktop:package` | Pass | Exit 0; rebuilt, staged 169 runtime packages without source-tree links, and produced the Windows x64 runnable folder. |
| `corepack.cmd pnpm test:desktop` | Pass | Final exit 0; 24 packaged Electron tests. |
| `corepack.cmd pnpm exec openspec validate preserve-error-provenance --strict` | Pass | Exit 0; change valid with no issues. |
| `corepack.cmd pnpm exec openspec validate --all --strict --json` | Pass | Exit 0; 47 of 47 changes/specifications valid, zero failures. Informational long-requirement notices remain in unrelated existing specs. |
| `git diff --check origin/main...HEAD` and working-tree `git diff --check` | Pass | Exit 0; no whitespace errors. |

## Live browser and packaged-runtime evidence

`corepack.cmd pnpm test:e2e` rebuilt the workspace and started the repository's
local test service before its 55 Chromium checks. It verified the management
shell, a landscape alert browser source, the native 1080 x 1920 vertical
profile, and controlled timed-video `play()` and seek failures. Both failures
removed the media node, left the body free of exception text and `err_`
references, and emitted one structured failure with stage, type, message, and
cause. The management bootstrap failure check independently proved that safe UI
copy reuses the Raw-log reference while exception detail appears only after
opening Raw logs. Gateway and runtime tests prove that the validated overlay
failure is persisted using authoritative registered-client identity. The
browser rejection is injected before the WebSocket boundary, so the browser
and server halves are deliberately tested separately rather than placing an
overlay route key in a Playwright fixture.

`corepack.cmd pnpm desktop:package` rebuilt the runnable folder, and the final
`corepack.cmd pnpm test:desktop` passed all 24 packaged checks. The shutdown
diagnostics scenario confirms `crashReporter.getUploadToServer()` is false,
injects a controlled `render-process-gone` event in the packaged main process,
and reads back `desktop.renderer.gone` from the authenticated Raw-log route with
the same `err_` reference, `crashed` reason, and exit code. It then confirms the
ordinary shutdown phase sequence and native exit. Other packaged checks cover
the utility worker, transparent overlay host, and WebM/MP4 decoder paths.

## Failures found and corrected during final verification

The first full unit run failed 2 of 2,232 tests. Two nested cleanup paths kept
both failures in `AggregateError.errors` but omitted the primary failure from
standard `cause`. The final audit found the same issue in five additional
primary/cleanup or diagnostic/fallback paths and found that the AST rule checked
`Error` but not `AggregateError`. The constructors now identify the primary
cause, the serializer retains up to four distinct secondary failures, and the
rule covers custom `*Error` constructors without treating shadowed identifiers
or property names as caught-value use.

The independent review then found that the fatal-process listener set an exit
code without guaranteeing termination, renderer failure provenance stopped at
the Electron main-process boundary, management URL validation discarded its
cause, and emergency text redaction did not cover common credential assignments.
Those paths now explicitly exit after the synchronous emergency write, carry the
same renderer reference and serialized exception through the worker response,
retain URL parsing causes, and redact free-text password, token, client-secret,
and API-key assignments in both ordinary and emergency records. Final focused,
full-unit, packaged-desktop, and static-gate runs are green.

A final scoped re-review found and corrected two edge cases: the playback
coordinator created a second record for an already-owned desktop renderer
failure, and opaque `authorization=` / `credential=` assignments were not yet
covered. Cause-chain reference detection now suppresses that duplicate owner,
and both logging sinks redact `authorization`, `credential`, and `credentials`
assignments. The follow-up independent review reported no remaining actionable
issue.

Three attempts at the new packaged Raw-log assertion failed before the final
green run. In every failed profile the renderer-loss JSONL record existed; the
test's direct fetch omitted the management bearer session, and its failure-path
ordinary Quit did not complete. Each retained profile showed the same rejected
unauthenticated GET. Only the exact validated isolated test process tree was
force-stopped after approval; the installed Stream Jams process was identified
separately and untouched. The final test creates its own management session,
uses the bearer ID, passes in 2.6 seconds, and exits normally. These failed runs
are test-harness defects, not evidence that runtime provenance was missing.

## Security and practical limits

The serializers and schemas apply fixed depth, character, and total-byte
bounds. Raw exception structure is absent from production overlay DOM and safe
management responses. The server derives overlay identity from authorization,
not a client failure body. Tests use synthetic messages and references rather
than credentials, route keys, copied URLs, or private provider payloads.

Abrupt native termination can prevent all JavaScript callbacks. A local dump
basename, timestamp, platform reason, or exit code is therefore valid terminal
evidence when no exception reached application code. Dump contents are neither
read nor uploaded automatically, and the presence of a dump does not prove a
specific root cause.
