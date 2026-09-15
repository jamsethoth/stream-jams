## Context

The existing `windows-desktop` CI job runs on pull requests, `main` pushes, and manual dispatches. It installs the pinned toolchain, runs `pnpm desktop:package`, and verifies the resulting `apps/desktop/out/Stream Jams-win32-x64` folder with `pnpm test:desktop`; only failure evidence is currently uploaded. The package is already self-contained application code, while configuration, assets, databases, and credentials remain in the user's `.stream-jams` profile and operating-system keyring.

The desired outcome is an authenticated, short-lived, unzip-and-run build for maintainers. It must not be presented as a signed installer, permanent release, automatic update channel, or fully portable user profile.

## Goals / Non-Goals

**Goals:**

- Make each successful eligible Windows desktop job expose the exact tested runnable folder as a downloadable artifact.
- Preserve traceability to the workflow run, selected ref, and full commit SHA.
- Use GitHub's immutable artifact archive, SHA-256 digest, authenticated URL, and retention controls instead of inventing another storage or checksum system.
- Keep the upload after packaged verification and fail closed when the expected output is absent.
- Document safe extraction, launch, replacement, data-profile behavior, expiry, and unsigned-build limitations.

**Non-Goals:**

- Publishing portable artifacts for pull-request runs.
- Producing an installer, single executable, signed binary, GitHub Release, update feed, startup integration, or Windows service.
- Moving user data beside the executable or migrating credentials from the existing operating-system keyring.
- Creating a stable public `latest` URL, semantic versioning policy, or release history.
- Changing the desktop runtime, package contents, local data format, or shutdown behavior.

## Decisions

### Upload the tested folder from the existing desktop job

The upload step will follow `pnpm test:desktop` in the same Windows job and will not use `always()`. This guarantees that the artifact is the package exercised by the packaged-runtime suite and prevents failed or cancelled builds from looking installable.

Creating a second distribution job was rejected because it would rebuild an artifact that was not byte-for-byte the one tested. Repackaging in another workflow was rejected for the same reason and would add unnecessary artifact transfer and permissions.

### Publish only from trusted, explicit events

The job will continue testing pull requests, but it will upload the runnable artifact only for a push to `main` or `workflow_dispatch`. Manually dispatched artifacts will identify their selected ref as well as the full commit SHA so they cannot be mistaken for current `main`.

Uploading every pull-request package was rejected because it consumes storage, exposes unreviewed executables as convenience downloads, and does not serve the local-use goal.

### Let GitHub create and attest the artifact archive

`actions/upload-artifact@v7` will upload `apps/desktop/out/Stream Jams-win32-x64` directly with `if-no-files-found: error`, a 30-day retention period, and an artifact name containing `stream-jams`, `windows-x64`, the selected ref, and the full commit SHA. The action's immutable archive and `artifact-digest` output are the authoritative downloadable ZIP and SHA-256 digest; CI will not create a nested ZIP.

The step will record the artifact URL, digest, ref, commit SHA, unsigned status, and expiry policy in the workflow summary. The URL remains authenticated and valid only while the run and artifact are retained.

A hand-built ZIP and checksum file were rejected because GitHub would wrap them in another artifact archive, creating a confusing double-ZIP download and two different integrity identities. A GitHub Release was rejected because permanent publication, versioning, and release permissions belong to the remaining BL-030 scope.

### Keep the artifact content narrow

Only the packaged output folder will be uploaded. Staging files, source files, test results, temporary Electron profiles, `.stream-jams` data, credentials, live overlay URLs, and local configuration are excluded. Hidden-file upload remains disabled. The existing self-contained staging checks and isolated packaged tests remain prerequisites.

The workflow retains repository-level `contents: read` permissions. Artifact upload does not justify release-write, package-write, identity-token, or secret access.

### Treat updates as manual folder replacement

The runbook will instruct maintainers to quit Stream Jams, download the intended artifact, verify the displayed digest against the workflow run, extract the complete folder, and replace the prior application folder as a unit. User data and keyring credentials remain outside the application folder and are not copied into the artifact.

## Risks / Trade-offs

- [Unsigned binaries can trigger Windows warnings] -> Label every artifact and instruction as unsigned and do not imply trust equivalent to code signing.
- [Actions artifacts expire and require GitHub authentication] -> Set and document 30-day retention; keep permanent releases explicitly out of scope.
- [A manual dispatch can target a non-`main` ref] -> Put the selected ref and full SHA in the artifact name and workflow summary; document that only a `main`-ref artifact represents current main.
- [Artifact storage and transfer increase CI cost] -> Upload only eligible successful runs and avoid pull-request artifacts.
- [Users may interpret portable as portable state] -> State that only application binaries are portable; `.stream-jams` data and keyring credentials remain machine/user specific.
- [The expected folder could move or packaging could silently omit it] -> Use the existing package command and tests, plus `if-no-files-found: error`; any future path change must update the CI contract deliberately.

## Migration Plan

1. Add the conditional artifact upload and workflow-summary metadata after packaged desktop verification.
2. Update the runbook and backlog boundaries in the same slice.
3. Validate workflow syntax and the existing local package/test path, then let the first eligible `main` or manual run prove upload, digest, download, extraction, and launch.
4. If rollback is required, remove the upload/summary steps and artifact-download documentation. Existing packaging, tests, runtime data, and credentials remain unchanged; already-created artifacts can expire or be deleted independently.

## Open Questions

None. Installer/signing, permanent release publication, updater behavior, startup integration, and credential migration remain separate decisions under BL-030.
