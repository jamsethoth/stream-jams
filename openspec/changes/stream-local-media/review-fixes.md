# Independent PR review corrections — October 1, 2026

The independent review of PR #139 at `e51c0abe0caf5d8de82e25c69e87e394b1192e03` confirmed two P2 findings. Both are corrected without changing the streaming design or installing a new runtime.

## Retirement cleanup must not block healthy startup

Startup reconciliation defers only filesystem deletion failures `EBUSY`, `EACCES` and `EPERM`. It preserves durable retirement intent, reports the existing cleanup diagnostic, and continues processing eligible records. Repository errors and invalid storage paths still fail rather than being silently swallowed. Reconciliation now runs after logger initialization, so its diagnostic callback is available during startup.

Persisted SQLite restart regressions prove current registered media remains integrity-verified/readable, the pending retirement remains recorded and emits a warning, and a later unlocked reconciliation removes the obsolete file and intent. Service tests also retain fatal repository/invalid-path cases.

## Native preview read failure must show recovery state

Image, audio and video native errors now report failure to their owned preview group. Only consumers of that failed asset detach and its grant is released; sibling asset owners remain valid. A stale URL cannot fail a newer owner. The existing actionable “Preview unavailable” state is shown, with retry on revision/reselection/remount rather than a focus/renewal retry loop.

Component tests cover all three native element types, detach-before-release, no renewal/reacquisition loop and reset. Group tests cover healthy sibling preservation. Real Chromium tests first acquire successful grants, then return native media 404s and verify both table-thumbnail and details-panel recovery states, zero remaining ownership and navigation retry. The first browser test run exposed an incorrect single-preview test assumption; the corrected test asserts both rendered previews and both grants. No production failure was weakened or skipped.

## Verification after corrections

- Independently run focused unit/runtime checks: 56 tests in five files plus 22 runtime smoke tests, all passed.
- Corrected real browser regression: four cases passed, including existing renewal/replacement/navigation plus image/audio/video native failures.
- Storybook build passed; affected interaction/accessibility/console checks passed 95 tests in six suites.
- Production workspace build, project/E2E typechecking, changed-file ESLint, error provenance, whitespace and strict OpenSpec checks passed.
- Local ignored evidence uses `apps/desktop/out/review-fixes-*.log`. Earlier full-suite/packaged/physical/ETW measurements retain their original head and scope; no physical playback or cache purge was repeated for these narrow corrections.

## Separate PR status

The prior head's CodeQL alert gate remains unresolved, despite its analysis job and other CI jobs passing. It reports 12 alerts, including the existing bearer regex and the introduced predictable temporary-lock location. The lock already uses exclusive creation and inode ownership checks, but its alert was not dismissed. Other warnings include intentional promise identity comparisons and isolated acceptance-tool network/file boundaries. No CodeQL suppression, dismissal or unrelated security remediation was performed for this two-finding correction. The PR remains draft while that separate gate needs resolution.
