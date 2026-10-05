## 1. Preparation

- [x] 1.1 Verify official authentication/TLS support, current baseline, and install frozen dependencies.
- [x] 1.2 Record the approved audit scope, design, and regression criteria.

## 2. Implementation

- [x] 2.1 Enforce credential-free loopback connection contracts at setup/runtime/export boundaries and protect legacy management projections.
- [x] 2.2 Gate Streamer.bot event delivery on completed authentication and explicit local unauthenticated consent.
- [x] 2.3 Explain provider transport/authentication in setup and cover the new UI state.
- [x] 2.4 Unify normal/emergency URL and capability redaction with failure-path regressions.
- [x] 2.5 Protect management HTML with CSP and anti-framing headers and browser regressions.

## 3. Verification

- [x] 3.1 Run focused regressions, lint, typecheck, full unit/script suite, builds, Storybook, and browser acceptance.
- [x] 3.2 Verify the rebuilt workflow in a disposable live instance and review the scoped diff once.
- [x] 3.3 Validate OpenSpec and record actual verification results and remaining limitations.

## Durable acceptance automation

- [x] 4.1 Exercise real provider sockets and persistent disposable runtime lifecycle: legacy rejection, credential cleanup, restart, backup/restore, and unchanged-state rejection.
- [x] 4.2 Exercise built management and scoped overlays against real HTTP/WebSocket APIs, uploaded assets/fonts, persisted warp rendering, CSP, and anti-framing.
- [x] 4.3 Wire a repeatable security acceptance command with build prerequisites, real transport/lifecycle/browser tests, packaged desktop, native keyring, and installed vendor/OBS coverage. Required unavailable capabilities fail explicitly.
- [x] 4.4 Record actual acceptance results and validate the expanded OpenSpec change.

## Initial verification record (2026-10-03)

Plan: GPT-6 Astra medium. Implementation: GPT-6.1 Sol low, as requested.

- Root lint, error-provenance check, and typecheck passed.
- `openspec.cmd validate harden-provider-security-boundaries --strict` passed.
- `pnpm test:unit`: 306 files and 2,694 tests passed; all 96 script tests passed.
- All-workspace `pnpm build` and Storybook build passed. Storybook: 31 suites and 282 tests passed. Full Playwright: 76 passed.
- Scoped diff review completed with no outstanding findings; `git diff --check` passed.
- Built disposable service: health and management security headers passed. Twelve unsafe host/query setup requests across both providers and validation/registration returned HTTP 400 without sentinel leakage.
- Real WebSocket challenge authentication matched the documented protocol. Events were delivered only after authentication; events before Hello/authentication and password downgrade were blocked. Explicit local consent registration succeeded; backup returned HTTP 200, preserved consent, and omitted secret references.
- The first live backup fixture lacked a required active alert set; correcting that fixture prerequisite resolved it. No production data was touched, and temporary profiles were removed.
- Initial missing dependencies/shared core outputs were resolved by frozen install followed by root typecheck; README documents this bootstrap. Six initial policy fixture mismatches were corrected to exercise the intentional behavior. Final gates are green.

Remaining product boundaries: non-local provider connections, TLS proxy setup, and undocumented Speaker.bot authentication remain outside this change. Implementation changes remain uncommitted; the preparation/spec commit is 5eec21e. No push or archive was performed.

## Acceptance automation verification (2026-10-03)

- Latest full unit: 309 files, 2,730 tests passed; all 96 script tests passed. Focused lifecycle three passed, including flushed log secret exclusion, restart, replacement credential retention, failed-persistence cleanup, and unchanged-state rejected restore.
- Chromium 77 passed; Storybook 31 suites/282 tests passed; root lint/error-provenance, typecheck, strict OpenSpec validation, workspace build, and desktop packaging passed.
- Named installed vendor four passed; actual OBS browser source one passed with custom-font/warped pixels and file-based Lua coordination, without a TCP control listener.
- Final packaged private renderer one passed in 6.2 seconds with loaded font, nonidentity warp/nontransparent pixels, and zero CSP violations; 18 affected window/API tests passed.
- Real rendering exposed and fixed browser Zod eval probing, private FontFace preflight, and private CSP font/scoped-media fetch support. Restrictive executable-content policy and authorization remain intact.
- Aggregate `pnpm test:security` passed with exit 0: 50 portable Vitest checks, five browser tests, four packaged checks (native three/private renderer one), and five actual vendor/OBS checks. All 64 focused acceptance checks and their build/package prerequisites passed.
- Final root typecheck passed; root lint/error-provenance and scoped lint after the final test-only CSP property typing correction passed. Current fixture cleanup succeeded; six known failed-run temporary roots were removed after containment/owned-process checks with no owned executable remaining.
- Final `openspec.cmd validate harden-provider-security-boundaries --strict` and `git diff --check` passed after documentation reconciliation.
- Full matrix, commands, fixture prerequisites, and inherently physical limits are recorded in [provider security acceptance](../../../../docs/verification/provider-security.md). No commit, push, or archive was performed for implementation.

## 5. Authorized operational automation

- [x] 5.1 Patch audited dependency overrides, regenerate/freeze the lockfile, and make the high-severity dependency audit blocking with retained failure evidence.
- [x] 5.2 Provision pinned disposable Windows vendor binaries and run installed acceptance in a separate PR/main/manual/callable CI workflow.
- [x] 5.3 Add and verify a read-only Windows exposure report with explicit Node PID selection and unknown remote reachability.
- [x] 5.4 Record audit findings, focused script checks, typecheck and coordinated acceptance results; validate OpenSpec.
## Operational automation final verification (2026-10-03)

- Full Vitest: 309 files/2,730 tests passed in 407 seconds. Final full Node script list: 113 passed. Root lint/error-provenance and typecheck passed.
- Workspace build and desktop packaging passed. Packaged native/private-renderer four, focused real-browser five, and vendor/OBS five passed. All three freshly downloaded official vendor archives matched pinned SHA-256 values and supplied the passing installed tests.
- Actionlint 1.7.12 passed all three workflows: ci.yml, dependency-audit.yml and security-installed.yml. Evaluated dependency audit gate passed while retaining raw one high, zero critical and five moderate findings; only the exact reviewed development-only braces exception is accepted until 2026-11-03.
- Final read-only exposure command exited 0: assessment observed, remote reachability unproven, original Streamer.bot PID 24648 only, TCP 127.0.0.1 ports 8080/8059, five potentially applicable complete-filter firewall rules and zero errors. Narrow associated-rule fallback resolved the earlier bulk-filter PermissionDenied without UAC or configuration changes. Leading --PID and scoped IPv6 review findings were fixed and tested.
- Local implementation and verification are complete. GitHub-hosted execution awaits the workflow being pushed; there is no release pipeline. Before a release, require successful installed acceptance for the exact candidate SHA through workflow_call or manual workflow_dispatch at that ref.
- Initial sections 1–4 remain historical evidence. No live settings, firewall rules or production data were changed; no implementation commit or push was performed.

Dependency enforcement reconciliation: the evaluated audit also runs immediately after frozen install in existing CI validate, before lint/typecheck/tests, without failure bypass. Its raw report is uploaded with always(); a missing report is allowed only there when installation fails. Branch protection remains unchanged. Installed vendor acceptance remains a separate callable/manual before-release contract, not a new required remote check.

## 6. Accepted dependency elimination and publication (2026-10-04)

- [x] 6.1 Pin all Electron Forge packages to 8.0.1 and remove the vulnerable braces packaging chain; patch fast-uri 3.1.8, ip-address 10.7.1, and brace-expansion 1.1.21/5.0.12; freeze the lockfile.
- [x] 6.2 Remove advisory exceptions/evaluation and enforce the native moderate-or-higher audit with retained failure evidence; verify zero moderate/high/critical findings and fail-closed regressions.
- [x] 6.3 Run coordinated repository, browser, packaging/native, installed vendor/OBS, workflow, and OpenSpec gates after remediation; reconcile current documentation and BL-054 using canonical completion policy.
- [x] 6.4 Commit and publish the full security branch as a reviewable pull request with per-file change reasons and actual validation evidence; do not merge or change protection.
- [x] 6.5 Verify ordinary CI, dependency audit, and installed Windows acceptance on the exact pushed candidate SHA, repair relevant failures, and record hosted outcomes.

### October 4 current verification status

Tasks 6.1–6.5 are complete: clean native audit at all severities, no vulnerable braces chain, frozen install, complete local gates, canonical spec sync, resolved BL-054, published PR #151, and exact-source installed acceptance. Local gates: 309 files/2,730 unit tests plus 114 Node scripts, browser 77, Storybook 31 suites/282 tests, desktop 36, lint/typecheck/build/package/actionlint and strict change/canonical validation.

Initial 496a374 failed stale packaging regression, seven CodeQL fixture patterns, and OBS pixels. Repair ff9a6f5 passed all ordinary checks and zero open CodeQL alerts; four vendors passed, but Pixi initialization failed before pixels. Controlled 013658c D3D11-only reproduced the failure. Guarded d3d11-ci candidate edd1d112a76f3151d318ab98e1971f8adf120b6e passed [installed run 37178785416](https://github.com/jamsethoth/stream-jams/actions/runs/37178785416): all five in 1.7 minutes, actual OBS 22.9s. CI-only compatibility flags are limited to an owned Microsoft Basic Driver/HTTP 127 fixture; no product-policy or WARP identity claim.

All hosted checks passed for exact source-tested SHA `edd1d112a76f3151d318ab98e1971f8adf120b6e`: [CI run 37178785452](https://github.com/jamsethoth/stream-jams/actions/runs/37178785452), [installed run 37178785416](https://github.com/jamsethoth/stream-jams/actions/runs/37178785416), and [audit run 37178785610](https://github.com/jamsethoth/stream-jams/actions/runs/37178785610) succeeded. Validate/unit, browser, Storybook, CodeQL, build, package, dependency review, and Windows desktop checks passed; the exact-source Windows desktop log confirms 36 tests passed in 3.6 minutes. Task 6.5 is complete. Documentation-only final HEAD checks will be recorded on PR #151, without another source-tested-SHA documentation cycle. Full dated detail: docs/verification/provider-security.md. No merge, protection change, or archive.
