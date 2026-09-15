# Portable Windows desktop artifact verification

Change: `publish-portable-windows-desktop-artifact`. Execution date: 2026-09-14. Branch: `codex/publish-portable-windows-desktop-artifact`, based on `f6faf7a88dd1df0ec5d1e90fed248d3c4d69b7da` from `origin/main`.

This is an implementation record, not durable release certification. No branch, workflow run, artifact, installer, signature, or GitHub Release was published during local verification.

## Local evidence

- The CI workflow parses as YAML and keeps repository-level `contents: read` permissions. Its existing package and isolated-runtime verification steps precede the new publication steps.
- Publication preparation, upload, and summary steps share the same `push` or `workflow_dispatch` guard. Pull requests cannot reach them, and normal GitHub step semantics prevent them from running after a failed or cancelled prerequisite. The existing `failure()` evidence upload remains after them.
- The helper tests passed 5/5. They cover a manually selected ref, a `main` push, pull-request rejection, a missing executable, ref-safe traceable naming, and workflow-summary output.
- `corepack.cmd pnpm desktop:package` completed successfully. The resulting `apps/desktop/out/Stream Jams-win32-x64` folder contained 74 files and 432,955,898 bytes, including `Stream Jams.exe` and `resources/app.asar`.
- The package audit found no `.stream-jams`, `.stage`, or `test-results` entries and no reparse-point links. Preparing metadata against that package produced a full-SHA artifact name.
- `corepack.cmd pnpm test:desktop` passed 24/24 against the packaged application, including native dependencies, isolated audio, production overlay hosting, Windows lifecycle behavior, and native Quit.
- ESLint, TypeScript project typechecking, all 9 root Node tests, and the single-worker Vitest suite passed. Vitest completed 232 files and 1,999 tests.
- Strict OpenSpec validation passed for this change and for all 39 repository specs and changes. Local links in the changed backlog and runbook resolved, and `git diff --check` passed.

The first local Corepack invocation could not read the user-level pnpm cache from restricted execution. Repeating the unchanged package command with approved cache access completed successfully; this was an execution-boundary issue rather than a product or test failure.

## Remaining hosted acceptance

- [ ] After publication is explicitly authorized, push the implementation ref and manually dispatch `CI` for that exact ref.
- [ ] Confirm the successful Windows job exposes the traceable artifact name, authenticated URL, SHA-256 digest, ref, full commit SHA, unsigned status, and 30-day retention in its summary.
- [ ] Download through authenticated GitHub access, compare the downloaded archive's SHA-256 digest with the workflow summary, extract the complete folder, then exercise an isolated launch and native Quit.

Until those hosted checks pass, local packaging proves the upload input is runnable but does not prove GitHub publication, retention, download authorization, or archive round-trip behavior. No live user profile, credential, or secret overlay URL is required for the remaining check.
