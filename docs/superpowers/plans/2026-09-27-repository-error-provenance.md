# Repository-wide Error Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every available exception's redacted type, message, stack, code, and causal chain from the point it reaches Stream Jams application code through the owning raw diagnostic record.

**Architecture:** Add one framework-independent `SerializedException` contract and total serializer in core, extend the existing JSONL logger with a dedicated exception field and emergency sink, then carry that contract across HTTP, WebSocket, browser, React, Electron, IPC, and worker boundaries. Each runtime records a failure once at its owning boundary; intermediate layers rethrow or wrap with `cause`, expected outcomes remain typed results, and a repository-local AST check prevents the known provenance-discarding patterns from returning.

**Tech Stack:** Node.js 24.16.0, TypeScript 6.0.3, Zod 4.6.5, Fastify 5.12.5, React 19.3.0, Electron 44.4.4, ESLint 10.11.0, typescript-eslint 8.70.1, Vitest 5.0.1, Playwright 1.63.0, pnpm 11.2.2.

**Spec:** `docs/superpowers/specs/2026-09-27-repository-error-provenance-design.md`

## Global Constraints

- Do not add a hosted logging service, telemetry upload, or automatic crash-dump upload.
- Do not expose stack traces or serialized exceptions in management error copy, browser-source DOM, or ordinary API error responses.
- Production overlays must fail closed and transparent.
- Redact secrets, credentials, authorization values, overlay route keys, sensitive URL values, and control characters before persistence or export.
- Limit cause depth to 5, message and thrown-value fields to 4,096 characters, stack fields to 32,768 characters, and one serialized exception to 65,536 UTF-8 bytes.
- `Logger.error(message, context, exception?)` accepts `unknown`; catch variables and promise rejection reasons remain `unknown` until serialized or narrowed.
- Intermediate code rethrows unchanged failures or wraps with `{ cause }`; the owning boundary records once.
- Cleanup failures remain secondary and must not replace the primary failure.
- Historical JSONL entries without `exception` remain readable as `exception: null`.
- New transport inputs are strict, authenticated where applicable, and bounded before logging.
- No new dependency is permitted unless the standard library, TypeScript compiler API, Zod, and existing packages cannot implement the requirement.
- A demonstrably non-error catch may use `// error-provenance: allow <expected|cleanup> -- <non-empty reason>` immediately before the handler; operational failures may not be exempted.

## Review Focus

- A cyclic or hostile error-like object whose getters throw must still produce one bounded safe record; Task 1 pins this in serializer tests.
- Redaction or file append failure while logging an original exception must preserve a minimal redacted emergency record without recursion; Task 2 pins this in logger tests.
- A browser video failure before metadata, during seek, during decode/readiness, or at `play()` must identify the stage and original cause while leaving the overlay transparent; Task 3 pins all stages.
- A management renderer failure whose diagnostic POST also fails must show a safe reference and stop after one reporting attempt; Task 5 pins the recursion/fallback behavior.
- A service worker, renderer, or child process that exits without a JavaScript exception must still leave platform reason, exit code, and local crash evidence where available; Task 6 pins these termination paths.

---

### Task 1: Define the core exception contract and OpenSpec change

**Files:**
- Create: `packages/core/src/diagnostics/serialized-exception.ts`
- Create: `packages/core/src/diagnostics/serialized-exception.test.ts`
- Modify: `packages/core/src/diagnostics/logging.ts`
- Modify: `packages/core/src/diagnostics/logging.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `openspec/changes/preserve-error-provenance/.openspec.yaml`
- Create: `openspec/changes/preserve-error-provenance/proposal.md`
- Create: `openspec/changes/preserve-error-provenance/design.md`
- Create: `openspec/changes/preserve-error-provenance/tasks.md`
- Create: `openspec/changes/preserve-error-provenance/specs/runtime-log-operations/spec.md`
- Create: `openspec/changes/preserve-error-provenance/specs/overlay-browser-resilience/spec.md`
- Create: `openspec/changes/preserve-error-provenance/specs/management-ui-resilience/spec.md`
- Create: `openspec/changes/preserve-error-provenance/specs/windows-desktop-runtime/spec.md`

**Interfaces:**
- Consumes: existing `LogContext`, `Logger`, Zod schemas, and the approved design specification.
- Produces: `serializedExceptionSchema`; `SerializedException`; `ExceptionSerializationLimits`; `defaultExceptionSerializationLimits`; `serializeException(value: unknown, limits?: Partial<ExceptionSerializationLimits>): SerializedException`; and `Logger.error(message: string, context: LogContext, exception?: unknown): Promise<void>`.

- [ ] **Step 1: Write the OpenSpec proposal and delta requirements**

Copy the approved behavior into the four capability deltas: structured/bounded/redacted raw exceptions and logger fallback; transparent overlay failure reporting; safe management references without stacks; and desktop/worker/native termination evidence. Record Tasks 1-8 in `tasks.md` and keep every checkbox unchecked.

- [ ] **Step 2: Validate the proposal before implementation**

Run: `openspec.cmd validate preserve-error-provenance --strict`

Expected: PASS with the proposal, design, task list, and four delta specifications valid.

- [ ] **Step 3: Write failing serializer and logger-contract tests**

Add tests named:

- `serializes Error name message stack code and nested cause`;
- `serializes primitive and cross-realm error-like throws`;
- `survives throwing getters and cyclic causes`;
- `bounds depth fields and total UTF-8 bytes`;
- `recognizes an already serialized transport exception without inventing a new stack`;
- `exposes an optional unknown exception argument on Logger.error`.

Assert the exact null-bearing shape from the design and the limits in Global Constraints. The hostile-object test must define throwing getters for `name`, `message`, `stack`, `code`, and `cause` and still receive a `SerializedException` rather than a thrown serializer error.

- [ ] **Step 4: Run the focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run packages/core/src/diagnostics/serialized-exception.test.ts packages/core/src/diagnostics/logging.test.ts`

Expected: FAIL because the new schema, serializer, limits, and logger signature do not exist.

- [ ] **Step 5: Implement the total serializer and export the contract**

Implement the interfaces exactly as listed above. Use guarded property reads, `WeakSet<object>` cycle detection, deterministic safe primitive rendering, cause depth 5, and final UTF-8 size enforcement. Never invoke `toJSON`, custom inspection, or unrestricted object serialization.

- [ ] **Step 6: Run the core tests and typecheck**

Run: `corepack.cmd pnpm exec vitest run packages/core/src/diagnostics/serialized-exception.test.ts packages/core/src/diagnostics/logging.test.ts`

Expected: PASS.

Run: `corepack.cmd pnpm --filter @stream-jams/core typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the core contract and OpenSpec baseline**

```bash
git add packages/core/src/diagnostics packages/core/src/index.ts openspec/changes/preserve-error-provenance
git commit -m "feat: define structured exception provenance"
```

### Task 2: Make JSONL diagnostics loss-resistant

**Files:**
- Create: `apps/server/src/modules/diagnostics/emergency-log-writer.ts`
- Create: `apps/server/src/modules/diagnostics/emergency-log-writer.test.ts`
- Modify: `apps/server/src/modules/diagnostics/runtime-jsonl-logger.ts`
- Modify: `apps/server/src/modules/diagnostics/runtime-jsonl-logger.test.ts`
- Modify: `apps/server/src/modules/security/redactor.ts`
- Modify: `apps/server/src/modules/security/redactor.test.ts`
- Modify: `apps/server/src/modules/diagnostics/diagnostics-service.ts`
- Modify: `apps/server/src/modules/diagnostics/diagnostics-service.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.tsx`
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx`

**Interfaces:**
- Consumes: `serializeException`, `SerializedException`, `Logger.error(..., exception?)`, the existing `Redactor`, and current JSONL/log workspace contracts.
- Produces: `RuntimeLogEntry.exception: SerializedException | null`; `EmergencyLogWriter.write(input: EmergencyLogInput): void`; and Raw-log `data.exception` for management diagnostics and exports.

- [ ] **Step 1: Write failing JSONL, redaction, emergency, compatibility, and Raw-log tests**

Cover:

- a new error log containing a redacted nested cause and `code`;
- an info/warn log containing `exception: null`;
- a historical JSONL line with no exception normalizing to null;
- messages, stacks, thrown values, causes, route keys, authorization values, URLs, CR/LF, and control characters being redacted or normalized;
- serializer, redactor, directory creation, append, and retention failures reaching the emergency writer;
- emergency-writer recursion prevention and standard-error fallback;
- a primary error plus failed cleanup retaining the primary reference;
- Raw logs and debug exports retaining the structured exception while normal UI copy omits stacks.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/modules/diagnostics/runtime-jsonl-logger.test.ts apps/server/src/modules/diagnostics/emergency-log-writer.test.ts apps/server/src/modules/security/redactor.test.ts apps/server/src/modules/diagnostics/diagnostics-service.test.ts packages/core/src/management/contracts.test.ts apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx`

Expected: FAIL on missing exception fields, emergency writer, and Raw-log projection.

- [ ] **Step 3: Implement normal and emergency logging**

Extend `RuntimeJsonlLogger.error` to serialize the optional exception centrally, redact the complete entry, and append it. Normalize old entries in `listRecent`. Implement a synchronous emergency writer with a small independent conservative sanitizer for credentials, authorization values, route keys, URLs, control characters, and field limits; do not depend on the failed normal redactor. Use a process-local recursion guard, an explicitly configured emergency file, and `process.stderr.write` as the final fallback. Logger methods resolve after either the normal or emergency record succeeds so logging failure cannot create a second unhandled rejection.

- [ ] **Step 4: Expose exception detail only in Raw logs and diagnostic exports**

Add the exception to `DiagnosticsRawLogView.data` and debug exports. Keep `DiagnosticsProblemView.cause`, toasts, and other management summaries limited to the existing safe message and reference.

- [ ] **Step 5: Run focused verification**

Run the Step 2 command.

Expected: PASS.

Run: `corepack.cmd pnpm --filter @stream-jams/server typecheck`

Run: `corepack.cmd pnpm --filter @stream-jams/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the resilient diagnostic pipeline**

```bash
git add packages/core/src/management apps/server/src/modules/diagnostics apps/server/src/modules/security apps/web/src/management/diagnostics
git commit -m "feat: preserve exceptions in raw diagnostics"
```

### Task 3: Preserve overlay media failure provenance

**Files:**
- Modify: `packages/core/src/audio/prepare-timed-media.ts`
- Modify: `packages/core/src/audio/prepare-timed-media.test.ts`
- Create: `packages/core/src/overlays/playback-failure.ts`
- Create: `packages/core/src/overlays/playback-failure.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.test.tsx`
- Modify: `apps/web/src/overlay/overlay-client.ts`
- Modify: `apps/web/src/overlay/overlay-client.test.ts`
- Modify: `apps/server/src/websocket/overlay-gateway.ts`
- Modify: `apps/server/src/websocket/overlay-gateway.test.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.smoke.test.ts`
- Modify: `tests/e2e/overlay.spec.ts`

**Interfaces:**
- Consumes: `SerializedException`, `serializeException`, the overlay route's authoritative target profile, and `Logger.error(..., exception?)`.
- Produces: `overlayPlaybackFailureStageSchema` with `source-load | metadata | seek | decode | play`; `OverlayPlaybackFailure`; `TimedMediaPreparationError.stage`; and `OverlayPlaybackReporter.reportFailed(instructionId: string, failure: OverlayPlaybackFailure): void`.

- [ ] **Step 1: Write failing preparation-stage tests**

Assert that source/metadata readiness, `currentTime` assignment, seek completion, media error/decode, deadline, and `play()` rejection retain the original cause and an exact stage. A setter that throws `DOMException("seek denied", "InvalidStateError")` must emerge as a `TimedMediaPreparationError` with `stage === "seek"` and that DOMException as `cause`.

- [ ] **Step 2: Write failing WebSocket and runtime-log tests**

Assert that a failed message carries `{referenceId, instructionId, stage, message, exception}`; rejects oversize or malformed exception structures; obtains route profile and client ID from the registered server client rather than trusting client-supplied identity; and writes one `overlay.playback.failed` record containing stage, instruction, client, target profile, and exception.

- [ ] **Step 3: Run the focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run packages/core/src/audio/prepare-timed-media.test.ts packages/core/src/overlays/playback-failure.test.ts apps/web/src/overlay/overlay-client.test.ts apps/web/src/overlay/OverlayApp.test.tsx apps/server/src/websocket/overlay-gateway.test.ts apps/server/src/runtime/runtime-composition.smoke.test.ts`

Expected: FAIL because failure stages and structured transport fields are absent.

- [ ] **Step 4: Implement staged preparation and overlay reporting**

Wrap only when adding the stage and always use `{ cause }`. Generate one `err_<uuid>` reference at the browser owning boundary, serialize once, validate on both transport ends, and log it once on the server. Keep the overlay rendering tree empty/transparent after failure and retain the existing management-test autoplay recovery behavior.

- [ ] **Step 5: Add the live browser-source regression**

In `tests/e2e/overlay.spec.ts`, inject a deterministic `HTMLMediaElement.play()` rejection and a seek failure. Assert transparent output, no stack text in the DOM, and a Raw-log entry searchable by the returned reference with `stage` and redacted exception detail.

- [ ] **Step 6: Run focused and browser verification**

Run the Step 3 command.

Expected: PASS.

Run: `corepack.cmd pnpm build`

Run: `corepack.cmd pnpm exec playwright test tests/e2e/overlay.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit overlay provenance**

```bash
git add packages/core/src/audio packages/core/src/overlays packages/core/src/index.ts apps/web/src/overlay apps/server/src/websocket apps/server/src/runtime tests/e2e/overlay.spec.ts
git commit -m "fix: retain overlay media failure causes"
```

### Task 4: Establish server ownership and audit server catches

**Files:**
- Create: `apps/server/src/runtime/tracked-runtime-task.ts`
- Create: `apps/server/src/runtime/tracked-runtime-task.test.ts`
- Create: `apps/server/src/runtime/fatal-process-errors.ts`
- Create: `apps/server/src/runtime/fatal-process-errors.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: `apps/server/src/runtime/runtime-composition.test.ts`
- Modify: `apps/server/src/runtime/start-local-runtime.ts`
- Modify: `apps/server/src/runtime/start-local-runtime.test.ts`
- Modify: `apps/server/src/runtime/cli-shutdown.ts`
- Modify: production catch/rejection sites under `apps/server/src` returned by `rg -n "catch\\s*\\{|catch\\s*\\([^)]*\\)|\\.catch\\(" apps/server/src --glob '!**/*.test.*'`.

**Interfaces:**
- Consumes: the core serializer/logger contract and `EmergencyLogWriter`.
- Produces: `trackRuntimeTask(input: { work: () => Promise<void>; logger: Logger; context: LogContext; message: string; onFinally?: () => void }): Promise<void>`; `installFatalProcessErrorHandlers(options): () => void`; and centralized Fastify ownership of unexpected request exceptions.

- [ ] **Step 1: Write failing Fastify, tracked-task, fatal-process, and cleanup tests**

Assert that:

- expected typed HTTP outcomes keep their safe status/message and are not double logged;
- an unexpected injected route exception is logged once with request ID, method, redacted URL, error ID/reference, and original cause before the sanitized 500 response;
- tracked detached work logs rejection and removes itself from the drain set;
- fatal handlers synchronously record and set a failing exit path without resuming work;
- startup plus cleanup failure retains startup as primary and cleanup as secondary rather than assigning cleanup as the only cause.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run apps/server/src/app.test.ts apps/server/src/runtime/tracked-runtime-task.test.ts apps/server/src/runtime/fatal-process-errors.test.ts apps/server/src/runtime/runtime-composition.test.ts apps/server/src/runtime/start-local-runtime.test.ts`

Expected: FAIL on missing helpers and cause/reference assertions.

- [ ] **Step 3: Implement the server boundaries**

Route Fastify's current `ServerErrorLogEntry.error` into `RuntimeJsonlLogger.error`, use the generated error ID as the diagnostic correlation/reference, replace ad hoc `runtimeWork` handling with `trackRuntimeTask`, and install fatal observers at the CLI entry point. The fatal test must run handlers against a fake process adapter; never terminate the Vitest worker.

- [ ] **Step 4: Audit and repair server catch sites**

For each production catch/rejection path under `apps/server/src`, classify it as propagate, enrich, own, expected, or cleanup. Rethrow unchanged errors, add `{ cause }` to contextual wrappers, pass the caught value to the owning logger, preserve primary failures across cleanup, and use only the Global Constraints exemption syntax for demonstrably expected/cleanup cases.

- [ ] **Step 5: Run server verification**

Run the Step 2 command.

Expected: PASS.

Run: `corepack.cmd pnpm --filter @stream-jams/server typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the server boundary and audit**

```bash
git add apps/server/src
git commit -m "fix: preserve server exception provenance"
```

### Task 5: Add management browser and React ownership

**Files:**
- Create: `apps/web/src/management/diagnostics/client-error-reporter.ts`
- Create: `apps/web/src/management/diagnostics/client-error-reporter.test.ts`
- Create: `apps/web/src/management/foundation/ManagementErrorBoundary.tsx`
- Create: `apps/web/src/management/foundation/ManagementErrorBoundary.test.tsx`
- Create: `apps/web/src/management/foundation/ManagementErrorBoundary.stories.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-http-client.ts`
- Modify: `apps/web/src/management/management-http-client.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `apps/server/src/http/routes/management-diagnostics.ts`
- Create: `apps/server/src/http/routes/management-diagnostics.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/runtime/runtime-composition.ts`
- Modify: production catch/rejection sites under `apps/web/src` returned by `rg -n "catch\\s*\\{|catch\\s*\\([^)]*\\)|\\.catch\\(" apps/web/src --glob '!**/*.test.*' --glob '!**/*.stories.*'`.

**Interfaces:**
- Consumes: `SerializedException`, management authentication/CSRF, `ManagementApi`, and the existing management error presentation.
- Produces: `clientExceptionReportSchema`; `ClientExceptionReport`; `ClientErrorReporter.report(input: { referenceId: string; source: "bootstrap" | "react" | "window-error" | "unhandled-rejection"; message: string; exception: SerializedException }): Promise<void>`; and authenticated `POST /management/diagnostics/client-errors` returning `{referenceId}`.

- [ ] **Step 1: Write failing reporter, route, and error-boundary tests**

Assert strict request validation, management auth and CSRF, size bounds, one raw `management.client.error` record, no stack in the HTTP response or rendered fallback, stable reference reuse, React render failure recovery, `window.error`, `unhandledrejection`, dynamic-import failure, and no recursive retry when the diagnostic POST fails.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run apps/web/src/management/diagnostics/client-error-reporter.test.ts apps/web/src/management/foundation/ManagementErrorBoundary.test.tsx apps/web/src/management/management-http-client.test.ts apps/server/src/http/routes/management-diagnostics.test.ts packages/core/src/management/contracts.test.ts`

Expected: FAIL because the reporter, route, and boundary do not exist.

- [ ] **Step 3: Implement authenticated browser reporting and the React boundary**

Generate a reference before reporting, serialize locally, POST once through the existing session/CSRF client, and fall back to `console.error` if reporting fails. Install global listeners only for the management shell and clean them up in tests. Render the established actionable management failure with reference and Diagnostics link, never raw exception detail.

- [ ] **Step 4: Audit and repair web catch sites**

Classify every production catch/rejection under `apps/web/src`. Preserve causes in management action errors, report owned unexpected failures, and annotate only expected parsing/storage/cleanup branches. Overlay-specific failures continue to use the Task 3 transport instead of the management endpoint.

- [ ] **Step 5: Add Storybook and browser checks**

The story must cover normal fallback, long reference wrapping, and failed-report fallback without console errors from the component itself. Add a management Playwright scenario that triggers a controlled render failure, sees safe recovery copy/reference, opens Diagnostics, and finds the raw exception.

- [ ] **Step 6: Run focused frontend verification**

Run the Step 2 command.

Expected: PASS.

Run: `corepack.cmd pnpm --filter @stream-jams/web typecheck`

Run: `corepack.cmd pnpm --filter @stream-jams/web build-storybook`

Expected: PASS.

- [ ] **Step 7: Commit management ownership**

```bash
git add packages/core/src/management apps/server/src/http/routes/management-diagnostics.ts apps/server/src/http/routes/management-diagnostics.test.ts apps/server/src/http/routes/management-ui.ts apps/server/src/runtime/runtime-composition.ts apps/web/src
git commit -m "feat: record management browser exceptions"
```

### Task 6: Preserve Electron, IPC, worker, and native termination evidence

**Files:**
- Create: `apps/desktop/src/desktop-diagnostics.ts`
- Create: `apps/desktop/src/desktop-diagnostics.test.ts`
- Modify: `apps/desktop/src/desktop-ipc.ts`
- Modify: `apps/desktop/src/service-supervisor.ts`
- Modify: `apps/desktop/src/service-supervisor.test.ts`
- Modify: `apps/desktop/src/service-worker.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/management-window.ts`
- Modify: `apps/desktop/src/overlay/overlay-window.ts`
- Modify: `apps/desktop/src/overlay/overlay-window.test.ts`
- Modify: `apps/desktop/src/audio/audio-window.ts`
- Modify: `apps/desktop/src/shutdown-log.ts`
- Modify: `apps/desktop/src/shutdown-log.test.ts`
- Modify: production catch/rejection sites under `apps/desktop/src` returned by `rg -n "catch\\s*\\{|catch\\s*\\([^)]*\\)|\\.catch\\(" apps/desktop/src --glob '!**/*.test.*'`.
- Modify: `tests/desktop/shutdown-diagnostics.spec.ts`

**Interfaces:**
- Consumes: `SerializedException`, `serializeException`, worker schemas, the server runtime logger, and Electron's `crashReporter`/process events.
- Produces: `DesktopDiagnosticReport`; `desktopDiagnosticReportSchema`; `DesktopDiagnostics.record(report): void`; structured `failed`/`command-failed` worker messages; and a validated main-to-worker `record-diagnostic` request.

- [ ] **Step 1: Write failing IPC, supervisor, renderer-loss, worker-exit, and crash-evidence tests**

Assert that worker command rejection retains its serialized cause/reference; spawn/send failures retain causes; `render-process-gone`, `child-process-gone`, preload errors, and worker exit record reason/exit code/process identity; local Crashpad starts with upload disabled; and next launch records a bounded redacted prior-dump reference without uploading or displaying a stack.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `corepack.cmd pnpm exec vitest run apps/desktop/src/desktop-diagnostics.test.ts apps/desktop/src/service-supervisor.test.ts apps/desktop/src/overlay/overlay-window.test.ts apps/desktop/src/shutdown-log.test.ts`

Expected: FAIL because structured desktop diagnostic transport and crash evidence are absent.

- [ ] **Step 3: Implement validated desktop diagnostic transport**

Serialize at the process boundary, carry `referenceId`, `message`, `exception`, platform reason, exit code, and component through strict Zod IPC envelopes, and let the service worker record through the runtime logger. Preserve serialized remote stacks as data; do not create a replacement local stack.

- [ ] **Step 4: Install Electron termination and local Crashpad observation**

Start Crashpad locally with upload disabled, register main/renderer/child/preload failure events, and inspect only Electron's configured crash-dump directory on next viable launch. Record a redacted file basename/timestamp, not arbitrary file contents or an upload.

- [ ] **Step 5: Audit and repair desktop catch sites**

Classify every production catch/rejection under `apps/desktop/src`, preserve primary errors, carry causes through supervisor and worker messages, and annotate only expected/cleanup cases. Best-effort teardown remains bounded and cannot block native session end.

- [ ] **Step 6: Run focused and packaged verification**

Run the Step 2 command.

Expected: PASS.

Run: `corepack.cmd pnpm --filter @stream-jams/desktop typecheck`

Run: `corepack.cmd pnpm desktop:package`

Run: `corepack.cmd pnpm test:desktop shutdown-diagnostics.spec.ts`

Expected: PASS; Crashpad remains local and the packaged runtime records controlled renderer/worker failures.

- [ ] **Step 7: Commit desktop provenance**

```bash
git add apps/desktop/src tests/desktop/shutdown-diagnostics.spec.ts
git commit -m "fix: retain desktop process failure evidence"
```

### Task 7: Enforce the repository-wide catch contract

**Files:**
- Create: `scripts/error-provenance-check.mjs`
- Create: `scripts/check-error-provenance.mjs`
- Create: `scripts/error-provenance-check.test.mjs`
- Modify: `eslint.config.js`
- Modify: `package.json`
- Modify: `packages/core/src/assets/media-import-pipeline.ts`
- Modify: `packages/core/src/audio/prepare-timed-media.ts`
- Modify: `packages/core/src/tts/tts-service.ts`
- Modify: production files under `apps/server/src`, `apps/web/src`, and `apps/desktop/src` reported by the new check after Tasks 4-6.

**Interfaces:**
- Consumes: the TypeScript compiler API and the ownership classifications from the approved design.
- Produces: `scanErrorProvenance(sourceText: string, fileName: string): readonly ErrorProvenanceDiagnostic[]`; CLI exit 1 on violations; and exemption syntax `// error-provenance: allow <expected|cleanup> -- <non-empty reason>` immediately preceding the exempted catch or rejection handler.

- [ ] **Step 1: Write failing static-check fixtures**

Reject empty/unbound catches, unused caught values, `.catch(() => undefined|null|{})`, cause-free contextual `new Error(...)` inside a catch, malformed exemptions, and string-only owned failure envelopes. Accept rethrow, narrowing, `{ cause }`, owner logging with the caught value, and valid expected/cleanup exemptions. Include TSX, optional catch binding, multiline promise handlers, nested catches, and test-file exclusion fixtures.

- [ ] **Step 2: Run the checker tests to verify they fail**

Run: `node --test scripts/error-provenance-check.test.mjs`

Expected: FAIL because the checker module does not exist.

- [ ] **Step 3: Implement the TypeScript-AST checker and CLI**

Inspect `CatchClause`, promise `.catch` call expressions, `NewExpression`, logger calls, and transport envelope properties. Scan production `.ts`/`.tsx` under the four source roots, exclude tests/stories/generated output, print stable `file:line:column rule message` diagnostics, and never rewrite files.

- [ ] **Step 4: Enable unknown promise rejection values and CI entry points**

Enable `@typescript-eslint/use-unknown-in-catch-callback-variable` for TypeScript files. Add `check:error-provenance` and make `lint` run ESLint followed by the checker. Add the Node checker test to `test:unit`.

- [ ] **Step 5: Run the checker against the repository and repair every result**

Run: `corepack.cmd pnpm check:error-provenance`

Expected initially: FAIL with the remaining production violations and exact locations.

Apply propagate/enrich/own changes or a narrowly justified expected/cleanup exemption. Do not exempt an operational failure merely to make the gate pass.

- [ ] **Step 6: Verify the gate and affected packages**

Run: `node --test scripts/error-provenance-check.test.mjs`

Run: `corepack.cmd pnpm check:error-provenance`

Run: `corepack.cmd pnpm lint`

Run: `corepack.cmd pnpm typecheck`

Expected: PASS with zero production provenance violations.

- [ ] **Step 7: Commit enforcement and remaining audit fixes**

```bash
git add scripts eslint.config.js package.json packages/core/src apps/server/src apps/web/src apps/desktop/src
git commit -m "chore: enforce exception provenance rules"
```

### Task 8: Reconcile specifications, documentation, and full verification

**Files:**
- Modify: `openspec/changes/preserve-error-provenance/tasks.md`
- Modify: `openspec/changes/preserve-error-provenance/specs/runtime-log-operations/spec.md`
- Modify: `openspec/changes/preserve-error-provenance/specs/overlay-browser-resilience/spec.md`
- Modify: `openspec/changes/preserve-error-provenance/specs/management-ui-resilience/spec.md`
- Modify: `openspec/changes/preserve-error-provenance/specs/windows-desktop-runtime/spec.md`
- Modify: `docs/ai/overlay-error-presentation.md`
- Create: `docs/engineering/error-provenance.md`
- Create: `docs/verification/repository-error-provenance.md`

**Interfaces:**
- Consumes: completed Tasks 1-7 and their actual command output.
- Produces: canonical developer guidance, completed OpenSpec task evidence, and a verification ledger that distinguishes automated, live browser-source, and packaged-Electron evidence.

- [ ] **Step 1: Reconcile every requirement against implementation and tests**

For each OpenSpec scenario, link the owning source/test in the verification ledger. Update task checkboxes only for work actually completed. Document the five catch classifications, `Logger.error` signature, transport rule, exemption syntax, redaction/bounds, reference ownership, and the abrupt-termination limitations.

- [ ] **Step 2: Run focused regression groups**

Run: `corepack.cmd pnpm exec vitest run packages/core/src/diagnostics apps/server/src/modules/diagnostics apps/server/src/websocket/overlay-gateway.test.ts apps/web/src/overlay apps/web/src/management/diagnostics apps/web/src/management/foundation/ManagementErrorBoundary.test.tsx apps/desktop/src/desktop-diagnostics.test.ts apps/desktop/src/service-supervisor.test.ts`

Expected: PASS.

- [ ] **Step 3: Run repository gates**

Run: `corepack.cmd pnpm lint`

Run: `corepack.cmd pnpm typecheck`

Run: `corepack.cmd pnpm test:unit`

Run: `corepack.cmd pnpm build`

Run: `corepack.cmd pnpm test:storybook:ci`

Run: `corepack.cmd pnpm test:e2e`

Run: `corepack.cmd pnpm desktop:package`

Run: `corepack.cmd pnpm test:desktop`

Expected: every command PASS. Classify any failure as regression, test defect, or temporary environment failure; do not report a failing suite as green.

- [ ] **Step 4: Run strict specification and diff validation**

Run: `openspec.cmd validate preserve-error-provenance --strict`

Run: `openspec.cmd validate --all --strict --json`

Run: `git diff --check origin/main...HEAD`

Expected: all OpenSpec items valid and no whitespace errors.

- [ ] **Step 5: Rebuild, restart, and verify the live workflows**

Restart the affected local service from the new build, reload management and both browser-source profiles, and induce one controlled video `play()` rejection. Confirm the overlay remains transparent, management shows only safe copy/reference, and Raw logs contain stage plus redacted type/message/stack/code/cause. Repeat with a controlled packaged Electron renderer or worker failure and confirm local termination evidence without upload.

- [ ] **Step 6: Complete the verification ledger and OpenSpec tasks**

Record exact commands, exit codes, live observations, packaged-app result, any environment limitations, and the final mapping from requirements to evidence. Mark `tasks.md` complete only after the evidence exists.

- [ ] **Step 7: Commit documentation and verification**

```bash
git add openspec/changes/preserve-error-provenance docs/ai/overlay-error-presentation.md docs/engineering/error-provenance.md docs/verification/repository-error-provenance.md
git commit -m "docs: verify repository error provenance"
```

- [ ] **Step 8: Review the complete branch**

Compare `git diff --stat origin/main...HEAD` and `git diff origin/main...HEAD` with the approved design. Confirm no exception-bearing production catch is unclassified, no user-facing stack escaped, no secret-bearing fixture entered the repository, and no unrelated alert-set profile refactor from the parallel conversation was mixed into this branch.
