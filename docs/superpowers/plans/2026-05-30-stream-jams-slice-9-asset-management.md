# Stream Jams Slice 9 Asset Import And Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 9 by validating common browser-safe media files before storage, copying accepted files into the configured asset directory, persisting asset metadata, serving stored files through authenticated local routes, and adding a focused management UI for asset listing and import.

**Architecture:** Keep media validation and import orchestration in `@stream-jams/core` behind repository and storage interfaces. Server code owns filesystem copying, path containment checks, Fastify routes, and runtime wiring. The web app owns only the management experience and API client shape; it must not access filesystem, SQLite, or Node-only APIs.

**Tech Stack:** TypeScript, React, Vite, Fastify, Node filesystem APIs, SQLite-backed `AssetRepository`, Zod, Vitest, Testing Library, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 9.

Slice 9 required behavior:

- Implement `AssetValidator` with allowed MIME types, file extensions, and size limits for common browser-safe formats.
- Define `MediaImportPipeline` with validation and future transcoding stages, with MVP transcoding as a no-op.
- Copy imported files into the configured asset directory using generated file names.
- Store original file name, normalized media type, size, checksum, and relative storage path.
- Serve assets through authenticated local routes that prevent path traversal.
- Add management UI for listing and importing assets.
- Unit test file type, file size, extension mismatch, path traversal attempts, and missing file behavior.
- Integration test asset import and asset serving.

Acceptance checks:

- Asset files are not served by arbitrary filesystem path.
- Invalid media files are rejected before storage.
- Import-time transcoding can be added later by replacing the no-op transcoding stage without changing alert, module, or asset repository contracts.
- Missing assets produce a user-visible diagnostic.

Non-goals:

- Import-time transcoding implementation beyond a replaceable no-op stage.
- Alert playback integration; later slices consume asset IDs.
- Public or overlay asset serving semantics; Slice 9 serves through local authenticated management routes.
- Full management navigation/session UX; Slice 14 owns the broader management shell.

## Baseline Evidence

- `origin/main` includes Slice 8 at `ad8ed7b`.
- Branch `codex/slice-9-asset-management` was created from fresh `origin/main`.
- Existing web shell is minimal React/Vite with Testing Library.
- Existing server route pattern uses Fastify app dependency injection plus management auth/rate-limit pre-handlers.

## Completion Evidence

- Core validator and media import pipeline tests passed for browser-safe MIME/extension acceptance, unsupported media rejection, extension mismatch, size limits, no-op transcoding, checksum/id/storage metadata, and invalid-before-storage behavior.
- Server asset store and route tests passed for generated storage paths, safe reads, path traversal rejection, missing-file diagnostics, authenticated listing, raw octet-stream import, invalid import rejection, and asset serving by asset ID.
- Web asset manager tests passed for loaded rows, empty state, successful import refresh, and visible import diagnostics without clearing the existing list.
- Architecture scans found no Node-only imports or direct `@stream-jams/core` imports in web UI code; filesystem and SQLite implementations remain in server module/runtime boundaries.
- Full validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test` (43 test files and 148 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.

## File Ownership

- Create `packages/core/src/assets/asset-validator.ts`: MIME/extension/size validation and media type normalization.
- Create `packages/core/src/assets/media-import-pipeline.ts`: framework-independent import orchestration with validator, no-op transcoder, checksum/id hooks, storage interface, and repository interface.
- Modify `packages/core/src/assets/types.ts`, `schemas.ts`, and `index.ts`: export Slice 9 asset contracts and validation schemas.
- Create `apps/server/src/modules/assets/local-asset-store.ts`: filesystem store with generated relative paths and path containment checks.
- Create `apps/server/src/http/routes/assets.ts`: management-protected asset list/import/serve routes.
- Modify `apps/server/src/app.ts`, `app.test.ts`, and `index.ts`: register asset routes and wire runtime asset storage/repository.
- Create `apps/web/src/management/assets/AssetManager.tsx`, `asset-api.ts`, and tests.
- Modify `apps/web/src/App.tsx`, `App.test.tsx`, and styles to host the asset management panel.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` after validation to mark Slice 9 complete.
- Update this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 9.1: Core Asset Validation

**Objective:** Validate media metadata before any file bytes are copied or persisted.

**Expected files or areas touched:**

- `packages/core/src/assets/asset-validator.ts`
- `packages/core/src/assets/asset-validator.test.ts`
- `packages/core/src/assets/types.ts`
- `packages/core/src/assets/schemas.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing validator tests for accepted PNG, GIF, MP4, and MP3 examples.
- [x] Write failing validator tests for unsupported MIME, unsupported extension, MIME/extension mismatch, zero-byte size, and over-limit size.
- [x] Run focused tests and confirm missing validator failures.
- [x] Implement allowed media table and deterministic validation errors.
- [x] Export validator contracts and schemas.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Browser-safe image, GIF, video, and audio files map to normalized media types.

**Negative test cases:**

- Dangerous or unsupported extensions are rejected even when MIME looks acceptable.
- Mismatched MIME/extension pairs are rejected before storage.
- Oversized files are rejected with a user-facing reason.

**Validation commands:**

- `pnpm test -- packages/core/src/assets/asset-validator.test.ts`

**Acceptance criteria:**

- Invalid files cannot reach storage or repository code through the core validator.

## Sub-Slice 9.2: Media Import Pipeline

**Objective:** Orchestrate validation, no-op transcoding, checksum calculation, storage, and metadata persistence behind replaceable interfaces.

**Expected files or areas touched:**

- `packages/core/src/assets/media-import-pipeline.ts`
- `packages/core/src/assets/media-import-pipeline.test.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [x] Write failing pipeline tests for accepted imports saving a complete `AssetRecord`.
- [x] Write failing pipeline tests proving invalid files do not call storage or repository dependencies.
- [x] Write failing tests proving the no-op transcoder preserves bytes while remaining replaceable.
- [x] Run focused tests and confirm missing pipeline failures.
- [x] Implement pipeline interfaces, typed errors, and default no-op transcoder.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Imported files receive generated IDs, checksums, original file names, normalized media type, byte size, and relative storage paths.

**Negative test cases:**

- Validation failures happen before storage writes.

**Validation commands:**

- `pnpm test -- packages/core/src/assets/media-import-pipeline.test.ts`

**Acceptance criteria:**

- Future transcoding can replace the no-op stage without changing repository or route contracts.

## Sub-Slice 9.3: Local Asset Store

**Objective:** Copy accepted bytes into the configured asset directory and read them back only through safe relative paths.

**Expected files or areas touched:**

- `apps/server/src/modules/assets/local-asset-store.ts`
- `apps/server/src/modules/assets/local-asset-store.test.ts`

**Implementation steps:**

- [x] Write failing tests for writing generated asset file names under media-type subdirectories.
- [x] Write failing tests for reading stored files back as bytes.
- [x] Write failing tests for rejecting path traversal and missing files.
- [x] Run focused tests and confirm missing store failures.
- [x] Implement UTF-8/path-safe filesystem operations using platform-aware path APIs.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Stored files use generated IDs and preserve safe extensions.

**Negative test cases:**

- Absolute paths and `..` traversal are rejected before filesystem reads.
- Missing files produce typed missing-file errors.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/assets/local-asset-store.test.ts`

**Acceptance criteria:**

- No route can serve arbitrary filesystem paths through the asset store.

## Sub-Slice 9.4: Asset HTTP Routes

**Objective:** Expose management-protected asset list, raw import, and file serving routes that delegate to services.

**Expected files or areas touched:**

- `apps/server/src/http/routes/assets.ts`
- `apps/server/src/http/routes/assets.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/index.ts`

**Implementation steps:**

- [x] Write failing route tests for authenticated list/import/serve flows.
- [x] Write failing route tests for invalid metadata, unsupported media, missing auth, missing asset records, missing files, and path traversal records.
- [x] Run focused tests and confirm missing route failures.
- [x] Register an octet-stream parser for import bytes.
- [x] Implement thin route handlers under management auth/rate-limit hooks.
- [x] Add app dependency guards for asset routes.
- [x] Wire runtime asset repository, asset store, and pipeline.
- [x] Run focused tests and confirm they pass.

**Positive test cases:**

- Authenticated clients can import and list assets, then fetch the stored bytes through an asset ID.

**Negative test cases:**

- Missing management sessions cannot list, import, or serve assets.
- Path traversal storage records return structured errors instead of reading arbitrary files.

**Validation commands:**

- `pnpm test -- apps/server/src/http/routes/assets.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- Asset route handlers do not own validation, storage path resolution, or repository mapping logic.

## Sub-Slice 9.5: Management Asset UI

**Objective:** Add a usable React asset panel for listing imported assets and selecting a local file to import.

**Expected files or areas touched:**

- `apps/web/src/management/assets/AssetManager.tsx`
- `apps/web/src/management/assets/AssetManager.test.tsx`
- `apps/web/src/management/assets/asset-api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/App.css`

**Implementation steps:**

- [x] Write failing component tests for loaded asset rows, import success refresh, invalid import diagnostics, and empty/error states.
- [x] Run focused web tests and confirm missing component failures.
- [x] Implement a small asset API client and asset panel with stable controls and no Node-only access.
- [x] Update the app shell to host the asset panel.
- [x] Run focused web tests and confirm they pass.

**Positive test cases:**

- Users can see imported asset metadata and import a selected file.

**Negative test cases:**

- Failed imports produce visible diagnostics without clearing the existing list.
- Missing assets and empty lists produce clear management diagnostics.

**Validation commands:**

- `pnpm test -- apps/web/src/App.test.tsx apps/web/src/management/assets/AssetManager.test.tsx`

**Acceptance criteria:**

- UI remains React/Vite-only and accesses assets through HTTP API abstractions.

## Sub-Slice 9.6: Plan Reconciliation And Full Validation

**Objective:** Reconcile Slice 9 against the base MVP plan, run the standard validation suite, and prepare the PR packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-9-asset-management.md`

**Implementation steps:**

- [x] Run architecture scans proving filesystem/SQLite code is confined to server adapters and web UI has no Node-only imports.
- [x] Update the base MVP plan Slice 9 checklist and completion evidence.
- [x] Update this detailed plan with validation evidence.
- [x] Run full validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- [x] Self-review the diff for scope creep and weak tests.
- [x] Commit with message `feat: add asset management`.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 9 is implemented, tested, documented, and ready for PR review.
