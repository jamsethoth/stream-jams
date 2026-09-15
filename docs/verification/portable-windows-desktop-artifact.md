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

## Pull request CI follow-up

The first PR #105 CI run passed every job except `windows-desktop`. Its native-style probe exhausted the fixed 10-second PowerShell child-process timeout, and its port-conflict dialog check exhausted Playwright's implicit 5-second poll while that runner required 8.4 seconds for an earlier packaged-service startup. The latest `main` run at the branch base had already failed the same native-style probe before this change, confirming that failure was not introduced by artifact publication.

The two test-only corrections preserve every assertion while allowing the existing hosted runner bounds: 30 seconds for the cold PowerShell native-style probe and 25 seconds for the asynchronous startup-failure dialog. Both exact failing cases then passed 2/2 locally, followed by the complete packaged desktop suite at 24/24, ESLint, and typechecking. The corrected package and publication path subsequently passed on `main` as recorded below.

## Hosted acceptance

- GitHub Actions [run 34927763002](https://github.com/jamsethoth/stream-jams/actions/runs/34927763002) completed successfully for a push to `main` at commit `103609141980b663dc3d43d3f43e0fe7ef137d95`.
- The published artifact was `stream-jams-windows-x64-main-103609141980b663dc3d43d3f43e0fe7ef137d95`, 170,544,034 bytes, with expiry `2026-10-15T04:14:16Z`. Its name identifies Windows x64, the `main` ref, and the full source commit; the expiry confirms the configured 30-day retention boundary.
- GitHub reported SHA-256 `5db6b85d55b672f781014b68871f4f45fda18a6d82f9ef3a6b568d491d8837f5`. It exactly matched the downloaded archive at `C:\Users\James\Downloads\stream-jams-windows-x64-main-103609141980b663dc3d43d3f43e0fe7ef137d95.zip`.
- The user confirmed the complete folder was downloaded through authenticated access, extracted, launched successfully, and exited through native Quit.

This closes the hosted publication, retention, authenticated-download, integrity, extraction, launch, and native-Quit acceptance gap. It does not add or certify an installer, code signing, a durable release channel, automatic updates, startup integration, a Windows service, portable user state, or credential migration.
