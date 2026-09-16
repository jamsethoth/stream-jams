## Why

The Windows CI job already builds and verifies a self-contained Stream Jams desktop folder, but successful runs discard that package. Publishing the verified output as a short-lived workflow artifact gives maintainers a reproducible unzip-and-run build without requiring a local Node/pnpm toolchain or prematurely introducing an installer and release system.

## What Changes

- Publish the packaged Windows x64 folder only after the packaged desktop test suite succeeds on a `main` push or an explicitly dispatched workflow run.
- Use the existing GitHub Actions artifact service to provide the downloadable archive, immutable run/commit identity, SHA-256 artifact digest, and bounded retention.
- Give artifacts an unambiguous Windows/architecture/commit identity and fail the job if the expected runnable folder is absent.
- Document how an authenticated maintainer downloads, extracts, verifies, launches, and replaces an artifact, including the unsigned-application warning and retained user-profile behavior.
- Keep pull-request artifact publication, installers, code signing, GitHub Releases, automatic updates, startup-at-login, Windows services, portable user data, and secret-store migration out of scope.
- Refine the Windows desktop runtime scope so this bounded CI artifact publication is permitted while the remaining distribution work stays deferred.

## Capabilities

### New Capabilities

- `portable-windows-desktop-artifact`: CI publishes a verified, short-lived, authenticated-download Windows x64 application artifact with traceable identity, integrity metadata, and explicit operational limitations.

### Modified Capabilities

- `windows-desktop-runtime`: Permit publication of the existing runnable folder as a CI workflow artifact while continuing to exclude installers, signing, durable release publication, updates, startup integration, services, portable user state, and secret-store migration.

## Impact

- Affected systems: the existing Windows `desktop` CI job, its successful artifact output, GitHub Actions storage, and maintainer download workflow.
- Affected files: `.github/workflows/ci.yml`, desktop packaging/archive verification helpers if needed, `docs/mvp-runbook.md`, `docs/backlog.md`, and the Windows desktop runtime delta spec.
- Security and permissions: retain read-only workflow permissions, publish no credentials or user data, and expose downloads only through GitHub's authenticated artifact access.
- Dependencies: reuse the existing `pnpm desktop:package`, `pnpm test:desktop`, and `actions/upload-artifact` paths; no new application runtime dependency is expected.
