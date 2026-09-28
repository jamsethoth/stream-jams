# Error Provenance

## Contract

Every exception or rejected value that reaches Stream Jams application code
must take exactly one of these paths:

| Classification | Required handling |
| --- | --- |
| Propagate | Rethrow the same value when this layer does not own the failed operation. |
| Enrich | Throw an operation-level `Error` with the original value in the standard `cause` option. |
| Own | Assign or retain one reference, write one structured diagnostic, and return only safe operator-facing copy. |
| Expected | Convert a documented validation, parsing, availability, or fallback outcome locally and annotate the catch. |
| Cleanup | Preserve the primary failure as primary evidence and attach or separately record cleanup failure with the same reference. |

Intermediate layers must not log and rethrow the same exception. The boundary
that can name the failed operation and decide its outcome owns the record. That
owner creates the `err_...` reference once; transports, UI, secondary cleanup,
and Raw logs reuse it. Correlation and processing identifiers describe wider
work and do not replace the failure reference.

## Structured exception boundary

`serializeException(value: unknown)` is the canonical, total serializer. It
accepts native and cross-realm errors, `DOMException`, Node system errors,
already serialized transport exceptions, error-like objects, and non-Error
thrown values. It retains type, message, stack, code, cause, and rendered thrown
value where available. Getter failures, cycles, and malformed values produce a
bounded sentinel instead of throwing.

The default limits are five cause nodes, four distinct secondary aggregate
failures, 4,096 message characters, 32,768 stack characters, 4,096 thrown-value
characters, and 65,536 UTF-8 bytes for the whole structure. Truncation is
explicit. Runtime log redaction is applied after
serialization, and the independent emergency sink applies conservative
sanitization again. URLs, credentials, provider payloads, route keys, and local
secret values must never be introduced as test fixtures or diagnostic metadata.

The logging boundary is:

```ts
error(message: string, context: LogContext, exception?: unknown): Promise<void>;
```

Pass the original unknown value. Do not preformat it into a string or copy a
stack into metadata. Historical JSONL records without `exception` remain valid
and are normalized to `exception: null` when read.

## Transport rule

Serialize at the boundary that must cross a trust or process boundary, validate
the serialized shape on receipt, and never invent a replacement remote stack.

- Browser overlays send `OverlayPlaybackFailure` over their authenticated
  WebSocket. The server supplies authoritative connection and target identity.
- The management browser posts one `ClientExceptionReport` through the existing
  authenticated, CSRF-protected management client.
- Electron worker and renderer replies carry a stable reference and validated
  serialized exception through IPC. Native termination events record the
  platform reason, exit code, and process identity when no exception exists.
- A reporting transport failure uses one local bounded fallback. It does not
  recursively invoke the failed reporter or replace the original exception.

Serialized stacks are evidence from the originating process, not a local
`Error`; receiving code preserves them as data or as the cause of local context.
Stacks and serialized exception objects are never rendered in management or
overlay UI.

## Catch exemptions and enforcement

Production catch paths are checked by `pnpm check:error-provenance` and as part
of `pnpm lint`. A catch may omit the thrown value only with an immediately
adjacent, reasoned classification comment using this exact syntax:

```ts
// error-provenance: allow expected -- <why this outcome is expected and bounded>
// error-provenance: allow cleanup -- <why this secondary cleanup cannot replace the primary failure>
```

The reason must describe the local contract, not merely say that the value is
ignored. The gate rejects unbound or unused catch values, promise-rejection
erasure, contextual `Error` creation without `cause`, incomplete failure
envelopes, and malformed exemptions. Tests and generated outputs are excluded;
production TypeScript is not.

## Practical guarantee and limits

Stream Jams guarantees that a failure delivered to a viable application
boundary is propagated with its cause or recorded once with bounded, redacted
provenance. If ordinary JSONL persistence fails, a synchronous independent
fallback attempts to retain both the logger-stage error and original failure.
Cleanup failure cannot replace primary evidence.

No JavaScript design can guarantee a final callback after process termination,
native corruption, power loss, or an operating-system kill. Electron Crashpad
therefore remains local with automatic upload disabled. On a later viable
launch, Stream Jams inspects only bounded dump metadata (basename and modified
time), never dump contents, and records that local evidence. This can establish
that native evidence exists; it cannot reconstruct an exception that the
platform never delivered.

## Verification

Run these checks after changing failure handling:

```text
corepack.cmd pnpm check:error-provenance
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test:unit
```

Boundary-specific tests and the release evidence for this contract are indexed
in [repository error-provenance verification](../verification/repository-error-provenance.md).
