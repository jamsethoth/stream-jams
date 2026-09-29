# Separate Windows packaging and desktop tests

Approved scope (September 29, 2026): restore automatic downloadable builds without restoring flaky desktop tests as an automatic CI gate. This follow-up supersedes the temporary all-manual desktop job in PR #135.

## Implementation contract

- Automatic PR, main-push, and manual runs package and publish in `windows-desktop-package`.
- Manual-only `windows-desktop` depends on packaging, downloads that run's exact named artifact, builds test dependencies, and runs existing tests without repackaging or changing their assertions/deadlines.
- Artifact names, summaries, and an included notice explicitly say untested/not desktop-test-verified. Missing executable/archive, failed packaging, and unsupported publication events are rejected.
- Retention, digest/ref/commit provenance, unsigned-folder delivery, and read-only repository permissions remain unchanged. No release, installer, merge, or production profile changes are included.

## Verification

- Artifact helper regressions were observed failing before implementation, then all six passed under the pinned pnpm Node runtime.
- Tests cover manual/main/PR publication, safe artifact naming, the included notice, summary provenance, unsupported events, and missing executable rejection.
- Repository lint/error-provenance checks, `git diff --check`, and strict validation of `windows-desktop-runtime` pass.
- Hosted packaging/upload/download execution remains the integration acceptance check; local script tests do not claim a downloadable GitHub artifact exists.
