# Repository-wide error provenance

## Context

Stream Jams already writes structured JSONL diagnostics, attaches correlation and processing identifiers to many operations, redacts sensitive values, and exposes raw logs to the operator. Those foundations are useful, but exception provenance is not represented as a first-class contract. The core logger accepts a message and flat metadata, the runtime JSONL logger discards nested values, and several production catch paths replace or ignore the caught value. As a result, an operator can see that an operation failed without seeing the exception type, stack, code, or causal chain that explains why.

The motivating case occurred in the alert overlay. A vertical draft reached the browser-source client, but the video's initial preparation or playback failed. The overlay reported only `Video playback could not start at the shared offset.` The caught browser exception was discarded before it crossed the WebSocket boundary, so the raw log could not distinguish a seek failure, decode failure, unsupported media operation, rejected `play()` promise, or another browser error.

This change establishes one repository-wide exception-provenance contract and applies it at every runtime ownership boundary. The goal is that any exception which reaches Stream Jams application code is either propagated with its cause intact or recorded once by the boundary responsible for the failed operation. User-facing surfaces remain sanitized and concise; the full redacted structure belongs in raw diagnostics.

The design follows the current stack's documented practices:

- TypeScript catch variables remain `unknown` and are normalized at a single boundary rather than assumed to be `Error` objects.
- JavaScript errors are wrapped with `Error`'s standard `cause` option when adding context, and stable Node `error.code` values are preserved separately from human-readable messages.
- Fastify owns unexpected request failures centrally and logs the original error before returning a safe response.
- Browser `error` and `unhandledrejection` events, React error boundaries, Electron renderer/child-process termination events, worker exits, and process-level fatal events are treated as distinct ownership boundaries.
- Error serialization and redaction are total operations: diagnostics code must not throw while attempting to describe another failure.
- Fatal process handlers record synchronously where possible and terminate; they do not attempt to resume normal operation after an uncaught exception.

## Scope

This is a repo-wide reliability change covering production code in `packages/core`, `apps/server`, `apps/web`, and `apps/desktop`. It includes synchronous exceptions, rejected promises, browser and React failures, WebSocket and IPC boundaries, worker failures, Electron process termination signals, and failures inside the logging pipeline itself.

It also fixes the immediate overlay media provenance gap so failures during media preparation, seeking, decoding, and playback reach the raw logs with their original exception data and playback stage.

This change does not introduce a hosted logging service, telemetry upload, or automatic crash-dump upload. It does not expose stack traces to browser-source clients or management API consumers. It does not turn expected validation or business outcomes into exceptions. It does not promise recovery after fatal process corruption or claim that JavaScript can reconstruct a native stack that was never delivered to application code.

## Product behavior

Raw JSONL records for failures gain a dedicated structured `exception` field. When an underlying exception exists, raw logs and diagnostic exports retain its redacted type, message, stack, code, causal chain, and a safe representation of a non-Error thrown value. The existing human-readable `message`, event name, component, correlation identifier, processing identifier, and contextual details remain available.

Operator-facing error messages continue to explain the failed action and next step without exposing implementation details or secrets. A stable reference identifier is assigned by the first boundary that owns the failure and is reused in downstream messages and records. The management UI can direct the operator to that reference in Raw logs.

Production overlays continue to fail closed and transparent. An overlay does not render a stack trace or diagnostic panel. It reports the structured failure through its authenticated overlay transport, including the instruction identifier, route profile, client identity, and the precise playback stage. The server owns persistence of that report.

Expected outcomes remain typed outcomes. Invalid input, unavailable destinations, conflicts, and other anticipated domain states use result types, schema results, or existing typed errors according to their current contract. Exceptions represent unexpected failures or failed operations whose provenance is diagnostically useful.

## Exception contract

The framework-independent contract is:

```ts
interface SerializedException {
  type: string;
  message: string;
  stack: string | null;
  code: string | null;
  cause: SerializedException | null;
  thrownValue: string | null;
}
```

`serializeException(value: unknown)` is a total, non-throwing function. It handles standard `Error` instances, `DOMException`, Node system errors, cross-realm error-like objects, primitive thrown values, inaccessible getters, cyclic cause graphs, and malformed values. Cause traversal has a small fixed maximum depth and detects repeated object identities. Strings and stacks have fixed length limits. Any truncation is explicit in the serialized value rather than silently removing the whole exception.

For an `Error`, `type` comes from its safe name or constructor name, `message` comes from its message, `stack` retains the available stack, and `code` retains a string or numeric error code as a string. `cause` recursively serializes the standard cause value. `thrownValue` is null. For a non-Error thrown value, the serializer supplies a stable type and message and puts a bounded safe rendering in `thrownValue`; it does not use unrestricted JSON serialization or invoke arbitrary custom inspection hooks.

The runtime log entry adds `exception: SerializedException | null`. Exception data is not placed inside the existing primitive `details` map. Log readers treat a missing field in historical entries as null, so existing JSONL files and exports remain readable without migration.

Serialization occurs before redaction so the logger has a predictable, bounded structure. Redaction then covers every exception message, stack, cause, thrown value, URL, and contextual field before persistence or export. The logging API accepts the original `unknown` exception and performs serialization centrally; callers do not hand-roll error objects.

## Propagation and ownership

Every production catch path has one explicit classification:

- **Propagate:** rethrow the original value when no context is added.
- **Enrich:** throw a new `Error` with `{ cause }` when a more useful operation-level message is required.
- **Own:** log the original exception once with operation context, then return or translate it because this boundary is responsible for the failure.
- **Expected:** convert a documented expected outcome into a typed result without error logging.
- **Cleanup:** attempt secondary cleanup without replacing the primary exception; if cleanup also fails, record it as a secondary failure linked to the same reference.

Intermediate layers do not both log and rethrow. This prevents duplicate records while preserving the entire causal chain for the eventual owner. A wrapper that changes the failure's meaning must use `cause`; a replacement exception without the original cause is invalid.

When a failure crosses a transport that cannot preserve an `Error` instance, the sender serializes it once and the typed transport carries `SerializedException`. The receiver records or forwards that structure without reconstructing a misleading local stack. This applies to WebSocket messages, Electron IPC, and worker messages.

The first owning boundary assigns a stable reference identifier. If the same failure is forwarded to another process or shown to the operator, the identifier is carried with it. Correlation and processing identifiers remain separate because they describe the wider request or playback flow rather than one failure.

## Runtime boundaries

### Server and Fastify

Fastify's root error handling records unexpected request errors with the original exception, request correlation, route identity, method, and response status before sending a sanitized response. Known typed HTTP failures retain their existing status and safe client message. Request serializers and redactors remain non-throwing.

Detached server work runs through a tracked-task helper which requires operation context and owns rejected promises. Production code must not use a bare fire-and-forget promise or `.catch(() => undefined)`. Event-emitter error channels are registered wherever the underlying API requires them.

### Management web application

The management root gains a React error boundary for render and lifecycle failures. Global `error` and `unhandledrejection` listeners cover failures outside React's render tree. They send a bounded diagnostic report through an authenticated management-only endpoint and display the established safe recovery UI with a reference identifier. Reporting failure falls back to the browser console and cannot recursively trigger the reporter.

Expected API errors remain normal management state and do not pass through the global exception reporter.

### Browser-source overlays

Overlay media preparation reports distinct stages such as source load, metadata readiness, initial seek, decode/readiness, and `play()` rejection. The failure message sent to the operator remains stable, while the overlay WebSocket payload includes the serialized exception, stage, instruction identifier, client identifier, and route profile. The payload is schema-validated and size-bounded. The server records it under the playback processing context.

An overlay remains transparent after failure and does not expose exception details on the stream. Reporting failure is separately recorded in the browser console without retrying indefinitely or blocking cleanup.

### Electron, workers, and IPC

Electron main-process operations and worker handlers preserve causes when adding context. IPC response envelopes carry the structured exception and reference identifier for failed operations. Worker exits, preload errors, `render-process-gone`, and `child-process-gone` events are recorded with their platform-provided reason, exit code, process identity, and available exception data.

Electron Crashpad collection remains local. Stream Jams does not upload dumps. When the next viable process can identify a prior abnormal termination or dump, it records the reason and a redacted local dump reference in diagnostics so the operator has evidence beyond a missing final log line.

### Fatal process failures

Node process entry points install last-resort observation for uncaught exceptions and unhandled rejections. They use an emergency synchronous record path, initiate only bounded safe shutdown work, and terminate with failure. An `uncaughtException` handler is never used to resume normal service. Where supported, `uncaughtExceptionMonitor` observes without changing Node's default fatal semantics.

## Diagnostic pipeline resilience

The normal JSONL logger serializes, bounds, redacts, encodes, and appends each record. Every stage is designed not to throw, but file-system and implementation failures remain possible. The logger therefore has a minimal emergency synchronous sink which records:

- that the diagnostic pipeline failed;
- the logger-stage failure;
- the original failure's bounded serialized form;
- timestamp, component, event, and reference identifier.

The emergency format is intentionally simple and has no dependency on the normal JSONL transformation pipeline. If the primary log destination itself is unavailable, it writes to the designated local emergency diagnostic destination and standard error. It never includes unredacted arbitrary objects. Recursion is prevented with a process-local guard.

Cleanup failures never replace the primary failure. They are recorded as secondary records linked by the same reference identifier, or attached as bounded secondary diagnostic data when another record cannot safely be emitted.

## Security and data handling

The existing redaction policy expands from generic metadata to all exception fields and nested causes. It removes or masks overlay route keys, authorization values, tokens, secrets, credentials, sensitive query parameters, local route URLs, and other configured sensitive patterns. Control characters, including carriage returns and line feeds embedded in untrusted values, are normalized so one event cannot forge additional log records.

Depth, field count, message length, stack length, thrown-value length, and total serialized-exception size are bounded. Cycles and inaccessible properties produce safe markers. Redaction itself must not call user-defined getters or serializers.

Full means the complete safe diagnostic structure received by Stream Jams, after mandatory redaction and bounds. It does not mean retaining secrets, unlimited attacker-controlled content, or data unavailable to the JavaScript runtime. Management API responses and browser-source output never expose raw stacks. Raw local logs and explicitly requested diagnostic exports are the authoritative detailed view.

## Repository audit and enforcement

All production catch sites and rejection handlers are inventoried and classified as propagate, enrich, own, expected, or cleanup. Tests that deliberately catch values for assertions are not treated as operational error handling, but shared test helpers and simulated runtime boundaries follow the production contract where applicable.

TypeScript continues to treat catch variables as `unknown`. ESLint enables the typescript-eslint rule that makes promise rejection callback values unknown as well. A small repository-local static check rejects these production patterns:

- an unbound or empty catch block;
- a caught value that is discarded;
- `.catch()` callbacks that discard their rejection reason;
- a contextual replacement `Error` that omits `cause`;
- an owning failure path that returns only a string when the transport supports structured provenance.

Narrow exemptions are permitted only for demonstrably expected non-error outcomes. Each exemption is local, searchable, and includes the classification and reason. The check has fixture tests for accepted and rejected patterns and runs in CI before the broad test suite.

The audit avoids mechanical logging at every catch. Each site is assigned an owner deliberately so the result is useful provenance, not duplicate noise.

## Delivery slices

Implementation is split into independently verifiable slices while remaining one coherent repository change:

1. **Foundation:** add `SerializedException`, the total serializer, the logger API and JSONL schema extension, redaction and bounds, historical-log compatibility, and emergency logging.
2. **Overlay media regression:** preserve and transport exceptions from media preparation, seeking, readiness/decode, and playback; add stage context and server-side ownership.
3. **Server audit:** apply the ownership model to Fastify, WebSockets, background work, persistence, providers, and runtime composition.
4. **Web audit:** add management and overlay browser boundaries and repair remaining swallowed or cause-free errors.
5. **Desktop audit:** cover Electron main, renderers, preload, IPC, workers, child/renderer termination, fatal handlers, and local crash evidence.
6. **Enforcement:** finish the inventory, resolve approved exemptions, and enable the static CI gate only after existing production violations are removed.

The implementation plan may divide these slices into separate pull requests if repository-wide review size or deployment risk warrants it, but foundation lands before consumers and the static gate lands last. No slice may temporarily discard data that a prior slice has begun producing.

## Verification

Serializer unit tests cover standard errors, DOM exceptions, Node error codes, primitive throws, cross-realm error-like values, inaccessible properties, deep and cyclic causes, truncation, and serializer self-failure. Redaction tests cover messages, stacks, causes, URLs, route keys, credentials, control characters, and maximum sizes.

Logger tests cover new and historical JSONL entries, diagnostic export, write failure, serialization failure, redaction failure, emergency fallback, recursion prevention, primary-plus-cleanup failures, and stable reference propagation.

Boundary tests cover:

- Fastify unexpected errors and known typed errors;
- WebSocket overlay failure transport and schema rejection;
- media source load, readiness/decode, seek, and `play()` failures;
- tracked background promise rejection;
- management React boundary, `window.error`, and `unhandledrejection` reporting;
- Electron IPC failures, worker exits, preload errors, renderer loss, and child-process loss;
- fatal Node process behavior in isolated child processes;
- old and new Raw-log rendering and diagnostic exports.

The immediate browser workflow is verified with a controlled media failure in the browser-source overlay. The overlay must remain transparent, the management surface must show a safe message and reference, and Raw logs must contain a searchable redacted exception with the playback stage and original cause.

Repository verification includes focused tests during each slice, then affected lint, typecheck, unit and integration tests, build, Storybook checks, Playwright, packaged Electron verification, strict OpenSpec validation, and diff checks before publication. A failing relevant suite blocks completion and is classified rather than relabeled as successful.

## Documentation and specification changes

The implementation updates canonical logging and diagnostics requirements, overlay failure reporting, management error presentation, Electron failure behavior, and the cross-cutting UX error contract. The OpenSpec change defines the structured exception schema, ownership rules, security bounds, compatibility behavior, and observable boundary scenarios.

The existing raw-log and diagnostic-export documentation is updated to explain the `exception` structure and the meaning of a reference identifier. Developer guidance documents the catch classifications, cause-preservation rule, transport behavior, and exemption format so future code does not regress to string-only failures.

## Guarantees and practical limits

For every exception that reaches Stream Jams application code, the system preserves the available exception provenance through propagation or records it at the owning boundary, subject only to documented redaction and safety bounds. Logger failures use the emergency path rather than silently discarding the original failure.

No application can guarantee a normal JavaScript log for abrupt power loss, forced termination, native crashes before runtime notification, or data the platform never supplies. This design addresses those cases with synchronous fatal records where possible and local Crashpad or process-exit evidence where available. Documentation states that boundary plainly rather than promising impossible losslessness.
