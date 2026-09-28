# Tasks

## 1. Core exception contract

- [x] 1.1 Add the bounded serialized-exception schema, total serializer and logger exception argument with focused tests.
- [x] 1.2 Export the contract and verify core type safety.

## 2. Diagnostic pipeline

- [x] 2.1 Persist redacted structured exceptions while retaining historical JSONL compatibility.
- [x] 2.2 Add independent emergency logging and expose detail only through Raw logs and debug exports.

## 3. Overlay media provenance

- [x] 3.1 Preserve preparation and playback stages and causes.
- [x] 3.2 Carry bounded failure reports through the overlay WebSocket and verify transparent browser-source behavior.

## 4. Server boundaries

- [x] 4.1 Centralize unexpected Fastify, background-task and fatal-process ownership.
- [x] 4.2 Audit server catch paths for propagation, cause preservation, ownership and cleanup priority.

## 5. Management browser boundaries

- [x] 5.1 Add authenticated client-exception reporting, global browser listeners and a React error boundary.
- [x] 5.2 Audit web catch paths and verify safe reference-based presentation in Storybook and Playwright.

## 6. Desktop boundaries

- [x] 6.1 Preserve exceptions through Electron IPC and worker messages and record process termination evidence.
- [x] 6.2 Keep Crashpad local, audit desktop catch paths and verify the packaged runtime.

## 7. Repository enforcement

- [x] 7.1 Add and test the TypeScript-AST provenance check and unknown promise-rejection lint rule.
- [x] 7.2 Resolve every production violation before enabling the lint/CI gate.

## 8. Documentation and verification

- [x] 8.1 Document ownership, redaction, bounds, exemptions and practical guarantees.
- [x] 8.2 Run focused, repository, Storybook, Playwright, packaged Electron and strict OpenSpec gates and record evidence.
