# Proposal: Preserve Error Provenance

## Intent

Stream Jams can currently replace or discard exception details before a failure reaches Raw logs. Establish one repository-wide error-provenance contract so failures retain their available type, message, stack, code and causal chain through the runtime boundary that owns the operation.

## Scope

In scope:

- Add a bounded, total and transport-safe serialized-exception contract.
- Add a dedicated redacted exception field to JSONL diagnostics and debug exports while retaining historical-log compatibility.
- Preserve overlay media preparation and playback failures across the authenticated overlay WebSocket without rendering diagnostics on stream.
- Record unexpected Fastify, background-task, browser, React, Electron, worker, IPC and process-boundary failures once at their owning boundary.
- Add an emergency synchronous diagnostic path for failure of the normal logger.
- Audit production catch paths and enforce cause preservation and explicit expected/cleanup exemptions.

Out of scope:

- Hosted logging, telemetry upload or automatic crash-dump upload.
- Exposing stacks or serialized exceptions in ordinary API responses, management error copy or production overlay DOM.
- Treating expected validation, availability or business outcomes as exceptions.
- Guaranteeing a JavaScript record after power loss, forced termination or a native crash that supplies no application-level evidence.

## Approach

Core owns `SerializedException` and a non-throwing `serializeException(unknown)` function. The existing logger accepts an optional unknown exception, serializes and redacts it centrally, and stores it beside the human-readable message. Errors cross WebSocket, HTTP, IPC and worker boundaries only through strict bounded schemas. Intermediate layers rethrow or wrap with `cause`; the first owning boundary assigns one reference and records once.

## Impact

- Raw local diagnostics and requested debug exports contain substantially better failure evidence after redaction and safety bounds.
- Operator-facing messages remain concise, actionable and reference-based.
- Existing JSONL files remain readable with a null exception field.
- Browser-source overlays remain transparent on failure.
- Local Electron crash evidence is retained without enabling upload.
- Lint/CI reject production patterns that silently discard operational exceptions.
