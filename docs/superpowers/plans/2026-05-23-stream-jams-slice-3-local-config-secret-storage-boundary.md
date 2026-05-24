# Stream Jams Slice 3 Local Config And Secret Storage Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate validated non-secret local configuration from secret lookup, storage, and redaction before provider integrations begin.

**Architecture:** Slice 3 adds pure `@stream-jams/core` contracts for app config, config storage, secret storage, and redaction, then implements server-side adapters for JSON file config, injected OS credentials, development-only in-memory secrets, and recursive redaction. Server adapters depend on core contracts and schemas; core remains framework-independent.

**Tech Stack:** TypeScript strict mode, Node ESM, Zod, Fastify-compatible server package, Vitest, pnpm workspace scripts.

---

## Source Plan Reference

This plan decomposes **Slice 3: Local Config And Secret Storage Boundary** from `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`.

## Scope Boundaries

### In Scope

- `AppConfig` and `appConfigSchema` for host, port, data directory, and asset directory.
- `ConfigStore`, `SecretStore`, and `Redactor` interfaces in core.
- File-backed non-secret config storage for the server package.
- OS credential adapter wrapper behind `SecretStore` with an injectable credential backend.
- Development-only in-memory secret store.
- Recursive redaction for nested values, arrays, auth headers, OAuth/API/overlay keys, signed URLs, and configured secret names.
- Unit tests proving config validation, secret boundary behavior, and redaction behavior.

### Out Of Scope

- Real OS credential library dependency selection.
- SQLite persistence.
- Logging integration.
- Twitch OAuth/EventSub integration.
- Management UI controls for config or key regeneration.

## Sub-Slice 3.1: Core Config And Secret Contracts

**Objective:** Add the shared contracts every server adapter and future API boundary will consume.

**Files:**

- Create: `packages/core/src/config/types.ts`
- Create: `packages/core/src/config/schemas.ts`
- Create: `packages/core/src/config/config-store.ts`
- Create: `packages/core/src/config/schemas.test.ts`
- Create: `packages/core/src/security/secret-store.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing schema and contract export tests**

Add `packages/core/src/config/schemas.test.ts` with positive validation for `127.0.0.1`, port `39187`, and non-empty storage directories; negative validation for invalid hosts, ports outside `1..65535`, empty directories, and secret-shaped extra fields being stripped from config patches.

Run: `pnpm test -- packages/core/src/config/schemas.test.ts`

Expected before implementation: fail because the config schema module does not exist.

- [x] **Step 2: Implement core config types and schemas**

Add `AppConfig`, `AppConfigUpdate`, `appConfigSchema`, and `appConfigUpdateSchema`. Keep host locked to `127.0.0.1` for MVP because LAN binding is explicitly out of scope.

- [x] **Step 3: Add config and secret boundary interfaces**

Add `ConfigStore` with `readConfig()` and `updateConfig(patch)`, `SecretStore` using the existing `SecretRef`, and `Redactor` with `redact(value)` plus `redactText(text)`.

- [x] **Step 4: Export the new core boundary**

Export config types/schemas/store contracts and the secret-store interfaces from `packages/core/src/index.ts`.

- [x] **Step 5: Verify core contracts**

Run: `pnpm test -- packages/core/src/config/schemas.test.ts`

Expected after implementation: pass.

## Sub-Slice 3.2: File-Backed Non-Secret Config Store

**Objective:** Persist only validated non-secret config data in a local JSON file.

**Files:**

- Modify: `apps/server/package.json`
- Create: `apps/server/src/config/file-config-store.ts`
- Create: `apps/server/src/config/file-config-store.test.ts`

- [x] **Step 1: Write failing file-store tests**

Add tests that read defaults when the file is missing, persist updates, reject invalid persisted JSON, and prove secret-shaped fields are not written into config data.

Run: `pnpm test -- apps/server/src/config/file-config-store.test.ts`

Expected before implementation: fail because the file config store module does not exist.

- [x] **Step 2: Add the core workspace dependency to the server package**

Add `@stream-jams/core` as a workspace dependency so server adapters can import core contracts.

- [x] **Step 3: Implement `FileConfigStore`**

Use `node:fs/promises` to read/write JSON. Validate every read and update through `appConfigSchema` and `appConfigUpdateSchema`. Create the parent directory when writing defaults or updates.

- [x] **Step 4: Verify file config behavior**

Run: `pnpm test -- apps/server/src/config/file-config-store.test.ts`

Expected after implementation: pass.

## Sub-Slice 3.3: Secret Store Adapters

**Objective:** Route all secret persistence through `SecretStore` adapters rather than config files.

**Files:**

- Create: `apps/server/src/modules/security/os-secret-store.ts`
- Create: `apps/server/src/modules/security/os-secret-store.test.ts`
- Create: `apps/server/src/modules/security/dev-secret-store.ts`
- Create: `apps/server/src/modules/security/dev-secret-store.test.ts`

- [x] **Step 1: Write failing secret-store tests**

Add OS adapter tests using a fake credential backend and development store tests proving set/get/delete behavior, `SecretRef` validation, and production-mode construction failure.

Run: `pnpm test -- apps/server/src/modules/security/os-secret-store.test.ts apps/server/src/modules/security/dev-secret-store.test.ts`

Expected before implementation: fail because the modules do not exist.

- [x] **Step 2: Implement `OsSecretStore`**

Wrap an injected credential adapter with `setPassword`, `getPassword`, and `deletePassword`. Validate every `SecretRef` with `secretRefSchema`. Keep key derivation deterministic and scoped to `stream-jams`.

- [x] **Step 3: Implement `DevSecretStore`**

Use an in-memory map gated to `development` only. Throw immediately for any other mode so production cannot accidentally use the fallback.

- [x] **Step 4: Verify secret stores**

Run: `pnpm test -- apps/server/src/modules/security/os-secret-store.test.ts apps/server/src/modules/security/dev-secret-store.test.ts`

Expected after implementation: pass.

## Sub-Slice 3.4: Redaction Boundary

**Objective:** Provide a reusable redactor for logs and diagnostics before either surface is implemented.

**Files:**

- Create: `apps/server/src/modules/security/redactor.ts`
- Create: `apps/server/src/modules/security/redactor.test.ts`

- [x] **Step 1: Write failing redactor tests**

Add tests for nested objects, arrays, authorization headers, API key fields, overlay route keys, signed URL query parameters, configured secret names, and non-mutation of the original input.

Run: `pnpm test -- apps/server/src/modules/security/redactor.test.ts`

Expected before implementation: fail because the redactor module does not exist.

- [x] **Step 2: Implement `createRedactor`**

Recursively clone arrays and plain objects. Replace sensitive field values with `[REDACTED]`, redact `Bearer`/`Basic` auth text, redact `ovl_...` route keys, and redact sensitive URL query parameter values while leaving non-sensitive structure intact.

- [x] **Step 3: Verify redaction**

Run: `pnpm test -- apps/server/src/modules/security/redactor.test.ts`

Expected after implementation: pass.

## Sub-Slice 3.5: Reconciliation And Full Validation

**Objective:** Confirm Slice 3 is complete, scoped, exported, and ready for review.

**Files:**

- Modify: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- Modify: this plan file with final checkboxes and validation evidence.

- [x] **Step 1: Run focused Slice 3 tests**

Run: `pnpm test -- packages/core/src/config/schemas.test.ts apps/server/src/config/file-config-store.test.ts apps/server/src/modules/security/os-secret-store.test.ts apps/server/src/modules/security/dev-secret-store.test.ts apps/server/src/modules/security/redactor.test.ts`

- [x] **Step 2: Run repository validation**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.

- [x] **Step 3: Reconcile the MVP plan**

Mark Slice 3 complete only after implementation and validation pass. Record files changed, validation evidence, and any deferred work.

## Validation Evidence

- Baseline `pnpm lint`: passed before Slice 3 implementation.
- Baseline `pnpm typecheck`: passed before Slice 3 implementation.
- Baseline `pnpm test`: passed before Slice 3 implementation.
- Slice 3 focused `pnpm test -- packages/core/src/config/schemas.test.ts apps/server/src/config/file-config-store.test.ts apps/server/src/modules/security/os-secret-store.test.ts apps/server/src/modules/security/dev-secret-store.test.ts apps/server/src/modules/security/redactor.test.ts`: passed, 5 files and 14 tests.
- Full repository validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.

## Reconciliation Checklist

- [x] Define `AppConfig` and `appConfigSchema` in `packages/core`.
- [x] Define `ConfigStore`, `SecretStore`, and `Redactor` interfaces in `packages/core`.
- [x] Ensure `SecretStore` uses the Slice 2 `SecretRef` type and `secretRefSchema`.
- [x] Implement file-backed config storage for non-secret values.
- [x] Implement an OS credential-store adapter behind `SecretStore`.
- [x] Implement a development secret-store adapter gated to development mode.
- [x] Implement redaction for OAuth tokens, API keys, overlay keys, auth headers, signed URLs, and configured secret names.
- [x] Unit test that raw secrets are not written to config data.
- [x] Unit test redaction for nested objects, arrays, headers, and URLs.
