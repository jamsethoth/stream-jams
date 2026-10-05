# Design: Preserve Error Provenance

## Core contract

`SerializedException` contains `type`, `message`, `stack`, `code`, `cause` and `thrownValue`. Serialization accepts `unknown`, handles native and cross-realm error-like values, primitives, throwing getters and cyclic causes, and never invokes arbitrary object serialization. Cause depth is limited to 5, message and thrown values to 4,096 characters, stack to 32,768 characters and the final structure to 65,536 UTF-8 bytes.

`Logger.error(message, context, exception?)` remains source-compatible with existing callers. The JSONL entry gains `exception`, while older entries without it normalize to null.

## Ownership

Every production catch is classified as propagate, enrich, own, expected or cleanup. Propagation rethrows unchanged. Enrichment uses `Error` with `{ cause }`. The owner logs once with operation context and stable reference. Expected outcomes use typed results. Cleanup failure remains secondary to the primary failure.

WebSocket, management HTTP, Electron IPC and worker envelopes carry an already serialized exception rather than reconstructing a remote `Error`. Server-side context such as authenticated overlay client identity and target profile is derived from the registered connection, not trusted from the client payload.

## Diagnostics and security

Serialization precedes redaction. Redaction covers exception messages, stacks, causes, thrown values, credentials, authorization values, overlay keys, sensitive URLs and control characters. Exception depth and size are bounded before persistence and export. Ordinary client responses and overlay DOM never include stacks.

If serialization, redaction, directory creation, append or retention fails, a minimal synchronous writer uses an independent conservative sanitizer and recursion guard, then writes to the configured emergency file and standard error. Logger failure must not create another unhandled rejection.

## Runtime boundaries

- Fastify records unexpected request failures centrally before returning a sanitized error ID.
- Detached runtime promises use one tracked-task helper with explicit context.
- Management uses a React error boundary plus `error` and `unhandledrejection` listeners and an authenticated report route.
- Overlay media reports source-load, metadata, seek, decode or play stage through the existing authenticated WebSocket and stays transparent.
- Electron records IPC failure, worker exit, preload error, renderer loss and child-process loss; Crashpad collection remains local with upload disabled.
- Fatal Node observers synchronously record where possible and terminate rather than resume normal work.

## Enforcement and compatibility

A TypeScript-AST check rejects empty or unbound catches, discarded caught values and promise rejections, contextual replacement errors without `cause`, and known string-only owning transports. Expected and cleanup exemptions are local, classified and reasoned. Historical JSONL files and existing callers remain compatible.

## Delivery

Land the shared contract first, then the logger, overlay regression, server, web and desktop audits, followed by enforcement and full documentation/verification. The enforcement gate is enabled only after existing production violations are resolved.
