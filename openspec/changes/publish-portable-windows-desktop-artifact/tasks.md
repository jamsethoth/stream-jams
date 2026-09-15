## 1. Confirm The Publication Boundary

- [x] 1.1 Fetch current remote state, start the implementation branch from current `origin/main`, and confirm the Windows desktop job still packages `apps/desktop/out/Stream Jams-win32-x64` before running `pnpm test:desktop`.
- [x] 1.2 Confirm the pinned `actions/upload-artifact` interface still provides immutable archived downloads, `artifact-url`, `artifact-digest`, `if-no-files-found`, hidden-file exclusion, and bounded retention without additional workflow permissions.
- [x] 1.3 Reconcile the implementation against both delta specs and retain the exclusions for pull-request artifacts, installers, signing, durable releases, automatic updates, startup integration, services, portable user state, and credential migration.

## 2. Publish The Verified Desktop Artifact

- [x] 2.1 Add a conditional upload step after packaged desktop verification for `main` pushes and `workflow_dispatch` events only; do not publish on pull requests, failures, or cancellations.
- [x] 2.2 Upload only `apps/desktop/out/Stream Jams-win32-x64` with `if-no-files-found: error`, hidden files excluded, 30-day retention, and an artifact name containing Stream Jams, Windows x64, the selected ref, and full commit SHA.
- [x] 2.3 Record the authenticated artifact URL, SHA-256 artifact digest, selected ref, full commit SHA, unsigned status, and retention policy in the workflow summary.
- [x] 2.4 Verify the workflow retains repository-level read-only permissions and does not upload staging files, source, test evidence, temporary profiles, local configuration, `.stream-jams` data, credentials, or live overlay URLs.

## 3. Document Portable Local Use

- [x] 3.1 Update `docs/mvp-runbook.md` with the Actions-run selection, authenticated download, digest verification, complete-folder extraction, launch, and manual replacement procedure.
- [x] 3.2 Document that artifacts are unsigned and expire after 30 days, manual dispatches may target non-`main` refs, and portability covers application files rather than `.stream-jams` state or operating-system keyring credentials.
- [x] 3.3 Reconcile `docs/backlog.md` so BL-052 tracks this planned artifact publication and BL-030 retains installer, signing, durable release, updater/startup/service, and credential-migration work only.

## 4. Verification And Handoff

- [x] 4.1 Validate the workflow syntax and event conditions, including positive `main`/manual cases and negative pull-request/failure cases, without weakening the existing desktop gates.
- [x] 4.2 Run `corepack.cmd pnpm desktop:package` and `corepack.cmd pnpm test:desktop` on Windows, confirming the upload path contains the tested self-contained package and no forbidden runtime state.
- [ ] 4.3 After publication is explicitly authorized, dispatch the workflow on the implementation ref, verify the artifact name/summary/digest/retention, download it through authenticated access, compare its SHA-256 digest, extract the full folder, and exercise an isolated launch and native Quit.
- [x] 4.4 Run `openspec.cmd validate publish-portable-windows-desktop-artifact --strict`, relevant documentation/link checks, and `git diff --check`; record any live Actions verification gap instead of treating local packaging as publication proof.
