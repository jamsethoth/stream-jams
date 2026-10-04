# Provider security acceptance

Recorded October 3, 2026 for `harden-provider-security-boundaries`. Planning used GPT-6 Astra medium; implementation used GPT-6.1 Sol low as requested. This is a dated verification record; current contracts remain in source and OpenSpec.

## Repeatable commands

From a clean checkout on Windows:

```powershell
corepack.cmd pnpm install --frozen-lockfile
corepack.cmd pnpm typecheck
corepack.cmd pnpm test:security:portable

$env:STREAM_JAMS_TEST_STREAMERBOT_DIR = '<installed Streamer.bot binary directory>'
$env:STREAM_JAMS_TEST_SPEAKERBOT_DIR = '<installed Speaker.bot binary directory>'
$env:STREAM_JAMS_TEST_OBS_DIR = '<installed OBS binary directory>'
corepack.cmd pnpm test:security:installed
```

`test:security` runs both portions. The portable portion builds workspace prerequisites, exercises real ws/wss provider transport and runtime lifecycle, then runs production browser acceptance. The installed portion packages Electron once, runs native SQLite/keyring and packaged renderer checks, then uses a dedicated installed-app Playwright config for vendor providers and OBS. Required binaries, Windows/SAPI capability, and native dependencies fail explicitly when unavailable. Ordinary `test:desktop` excludes installed vendor/OBS files through configuration, without runtime skips.

Missing dependencies and missing shared-package outputs initially blocked tests. Frozen installation followed by root typecheck resolved those prerequisites; those setup failures were not product regressions.

## Automated matrix

| Boundary | Evidence |
| --- | --- |
| Local transport and handshake | Real ws/wss local servers, IPv4/IPv6, certificate verification, required authentication, local consent, early events, password downgrade, duplicate/stale responses, reconnect |
| Persistent runtime | Real `startLocalRuntime`, temporary SQLite/config and HTTP session/CSRF; unsafe legacy settings and missing consent do not dial, missing password fails closed, authenticated restart resumes intake, active replacement retains saved credentials, failed persistence cleans newly stored credentials |
| Backup/restore | Authenticated and consenting provider rows export without passwords/secret references; second runtime restores consent and requires authenticated-provider credentials; unsafe preflight/restore rejects without changing captured configuration; internal rollback remains intact |
| Diagnostics | HTTP list/detail/live diagnostics and flushed runtime log files omit synthetic credential/password sentinels; normal/emergency redaction has focused failure-path regressions |
| Built browser | Actual management APIs and uploaded media/font; save/reload nonidentity warp, loaded font and nontransparent pixels in management and scoped browser-source playback; zero unexpected CSP violations; management/operator framing denied |
| Packaged desktop | Bundled native SQLite/keyring, credential persistence across child processes and deletion, real service APIs, loaded custom font, nonidentity warp/nontransparent pixels, and zero CSP violations in private rendering |
| Streamer.bot vendor | Binary-only disposable profiles; authentication disabled rejects missing consent and accepts explicit consent; Authentication with Enforce false/true accepts correct passwords, rejects wrong ones, and reconnects automatically across owned process restart; real GetInfo/GetEvents |
| Speaker.bot vendor | Binary-only disposable profile at volume zero; real local connection and correlated unknown-alias rejection without WAV; enabled Windows SAPI5 alias produces RIFF/WAVE with a nonempty data chunk and positive duration |
| OBS | Actual portable OBS 32.2.2 browser source renders scoped custom-font/warped text pixels; local Lua fixture coordination uses files and introduces no TCP control listener |

Fixtures use temporary profiles, synthetic credentials, checked cleanup targets, owned process/listener shutdown, and scoped route keys. They never copy vendor data, account databases, backups, or live settings. Actual sessions/scoped URLs are excluded from browser trace/screenshot/video artifacts. Protocol summaries omit authentication material.

The observed vendor fixture pins Streamer.bot 1.0.7/settings schema 34 and Speaker.bot 0.1.7/settings schema 8. Fixture serialization fields are observed vendor implementation details, separate from their documented WebSocket protocols. Speaker uses the verified `sapi5` engine and an installed enabled Windows SAPI voice; no undocumented WebSocket voice-discovery API is invented. Speaker.bot's native UDP listener on port 6669 is vendor behavior and ends when the owned process exits.

Provider activation retains inactive saved credentials; the product has no provider deletion API. Restored backups omit provider passwords, so authenticated providers require credential reentry. Local consent is independent of the presence of a password: a configured password still requires authentication.

## Actual results

- Full unit run: 309 files, 2,730 tests passed; 96 script tests passed. Final focused lifecycle: three tests passed, including flushed log sentinel assertions and durable credential cleanup.
- Full Chromium suite: 77 passed. Strict real-runtime browser acceptance passed after a Zod JIT capability probe was disabled before schema loading; no `unsafe-eval` allowance was added.
- Storybook: 31 suites, 282 tests passed. Workspace build and desktop packaging passed.
- Named installed vendor acceptance: four passed, covering the three Streamer.bot modes and silent SAPI WAV output.
- Focused actual OBS: one passed. Final packaged private renderer: one passed in 6.2 seconds, proving a loaded custom font, nonidentity warp/nontransparent pixels, and zero CSP violations; 18 affected window/API tests passed.
- Root lint/error-provenance and final typecheck passed; scoped lint passed after the final test-only CSP property typing correction.
- Aggregate `pnpm test:security` passed with exit 0: 50 portable Vitest checks, five browser tests, four packaged checks (three native plus one renderer), and five actual vendor/OBS checks (three Streamer.bot modes/restarts, one silent Speaker SAPI test, one OBS test): 64 focused acceptance checks. Its build/package prerequisites passed.
- Current fixtures cleaned up successfully. Six known failed-run temporary roots were removed after containment and owned-process checks; no owned executable remained.
- Final strict OpenSpec validation and `git diff --check` passed after verification documentation reconciliation.

Acceptance exposed three production integration gaps that were repaired: browser Zod JIT capability probing caused CSP eval violations, so browser entries now configure JIT-free validation before schemas load; private-renderer font preflight now creates/loads the actual FontFace; and the private CSP explicitly permits same-origin fonts and only the scoped `stream-jams-overlay://surface/media/` connection path. The fixes preserve restrictive execution policy and media authorization.

No production data was touched. Implementation remains uncommitted; preparation/spec commit is `5eec21e`. No push or archive was performed.

## Verification limits

This automation verifies security contracts and rendered output through actual local transports, processes, browser engines, persistence, and native keyring. It does not establish audible output at a physical speaker, capture-card routing, physical game topmost/focus behavior, exclusive fullscreen coverage, or remote/TLS-proxy deployment. Speaker speech deliberately runs at volume zero. Native OBS/browser capture is recorded separately from physical-device and streaming-account acceptance.

## Operational automation follow-up (2026-10-03)

`corepack.cmd pnpm audit:dependencies` runs the native high-severity dependency audit and evaluates its retained JSON. The dependency workflow now blocks failures on PR/main manifest, workspace, lockfile and workflow changes, plus weekly/manual runs; JSON and summary run even after failure. Registry failures remain failures. The same evaluated audit runs immediately after frozen install in the existing required CI validate job, before lint/typecheck/tests, with an always-run raw-report artifact. When landed, audit failures therefore fail the existing required validate check; branch protection is unchanged. The separate installed vendor workflow is automation/callable before-release acceptance, not a newly required remote check.

Published patch overrides are fast-uri 3.1.7, undici 7.29.1, joi 17.13.7/18.2.6, brace-expansion 1.1.20/5.0.11 and http-cache-semantics 4.3.0. The proposed http-cache-semantics 4.2.1 is unpublished; 4.3.0 matches its upstream repository commit b1d4bd682fbab0252985de45219f4e7497c0067c and is outside the advisory's affected <=4.2.0 range. pnpm added an exact release-age exception for that fresh security release. Frozen install passed supply-chain policy verification and root typecheck passed.

Native audit currently fails as intended: one high (braces GHSA-vfj7-8cjw-p6xm), zero critical and five moderate, reduced from 12 high and 13 lower findings. The advertised braces 3.0.4 is unpublished and the [official advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Remaining moderate findings are fast-uri GHSA-hrr3-gc8f-f4qj, ip-address GHSA-j6r3-76f7-8jcv and GHSA-h3mg-xc3c-68pw, and brace-expansion GHSA-q2hr-2g5m-vwhr in two major versions. The native audit remains exit 1. The evaluated gate passes with that raw high explicitly reported separately from one accepted exception, expiring 2026-11-03. It accepts only GHSA-vfj7-8cjw-p6xm, braces 3.0.3, dev=true and the exact apps__desktop>@electron-forge/core>fast-glob>micromatch>braces path with Forge pinned 7.11.2. Forge src/api/package.ts (distributed dist/api/package.js:166) uses the fixed packaging glob path.join(buildPath, '**/.bin/**/*'), rather than runtime application input. New/changed high or critical findings, production paths, changed Forge pin, expiry, malformed JSON, inconsistent severity metadata and registry/CLI errors fail. Five audit evaluator regression groups passed. No blanket ignore or unfixable-advisory bypass is used.

`corepack.cmd pnpm security:provision` downloads only pinned official archives from scripts/security-vendors.json, verifies SHA-256 before extraction, and reports the three fixture environment paths. Hosted Windows installed acceptance uses this provisioning in a separate PR/main/manual/callable workflow, preserving ordinary CI. Local execution still requires an installed SAPI voice; missing prerequisites fail explicitly. GitHub-hosted execution awaits the workflow being pushed. There is no release pipeline; before release, require successful installed acceptance for the exact candidate SHA through workflow_call or manual workflow_dispatch at that ref.

`corepack.cmd pnpm security:exposure -- --pid <local-service-PID>` reports matching exact application names plus explicit Node service PIDs, TCP/UDP binding and potentially applicable firewall rules. It is read-only; remote reachability is unproven, and access failures/absent targets remain unknown. It does not enable authentication, restrict vendor listeners or modify firewall rules. Focused provisioning/exposure and audit evaluator checks passed; registry-unreachable native audit returned exit 1, and CLI/registry error, exception scope/expiry, metadata consistency and failure-evidence regressions passed.
Final operational validation confirmed locally: full Vitest 309 files/2,730 tests passed in 407 seconds; all 113 Node script tests passed. Root lint/error-provenance, root typecheck and actionlint 1.7.12 for all three workflows (ci.yml, dependency-audit.yml and security-installed.yml) passed. Workspace build and desktop packaging passed. Packaged native/private-renderer four and focused real-browser five passed. All three official vendor archives were freshly downloaded and matched their pinned SHA-256 values; five vendor/OBS tests passed using those fresh binaries. The evaluated audit gate passed with raw one high, zero critical and five moderate findings retained, including the separately accepted exact exception expiring 2026-11-03.

The final read-only exposure command exited 0 with assessment observed, remote reachability unproven, only the original running Streamer.bot PID 24648, TCP listeners on 127.0.0.1:8080 and 127.0.0.1:8059, five potentially applicable firewall rules with complete filters and zero errors. Narrow associated-rule queries resolved the earlier bulk-filter PermissionDenied without UAC or configuration changes. Leading --PID and scoped IPv6 review findings were fixed and tested. This observation covers the running Streamer.bot process; Speaker.bot and Stream Jams were not observed running in this check. No live settings or firewall rules were changed. The generated raw pnpm-audit.json is ignored by Git and retained for local/CI evaluation.

Local implementation and verification are complete. Hosted CI has not been executed; it awaits a pushed workflow. No production data, commit or push was involved in this operational follow-up.

## Accepted remediation and publication follow-up (2026-10-04)

The October 3 exception and findings above are historical evidence, not the current acceptance policy. The approved remediation pins Electron Forge 8.0.1 to eliminate its vulnerable braces chain, and patches fast-uri 3.1.8, ip-address 10.7.1, and brace-expansion 1.1.21/5.0.12. The native dependency gate must reject moderate-or-higher findings without advisory exceptions, retain failure JSON/summary, and fail on registry errors.

Confirmed October 4 local evidence: native audit JSON reports zero findings at every severity, the frozen lock has no braces, and root lint/error-provenance, typecheck, workspace build, Forge 8 desktop packaging, local portable artifact preparation, actionlint 1.7.12, and one independent review passed. Canonical management/provider security specs are synced without archiving. Full unit passed: 309 files/2,730 tests and 114 Node script tests. Storybook build and 31 suites/282 tests passed. The owned-server browser suite passed 77 tests in 2.1 minutes. Strict change and both canonical spec validations passed. The unchanged sequential full desktop suite passed 36 tests in 2.2 minutes. All October 4 local gates are complete; this turn's hosted installed acceptance remains pending. Earlier concurrent browser failures occurred while the Vite server on port 4173 was unavailable; its prior owner and exit cause were not established. The clean local browser run set CI=true to disable reuseExistingServer and establish exclusive server ownership; an earlier desktop cleanup timeout passed unchanged in isolation in 4.9 seconds, with shutdown logs showing quit in 76 ms including service stop in 36 ms. These reruns required no product or test changes; the subsequent full sequential desktop run confirmed closure. Pull-request publication and hosted ordinary CI, dependency audit, and installed Windows acceptance are authorized; results must identify the exact pushed candidate SHA. No merge or protection change is authorized. BL-054 was removed after clean audit, complete local verification, and canonical spec sync confirmed its remediation. No hosted outcome is claimed by this section.

October 4 repeatability: the clean browser run used $env:CI='true' to disable reuseExistingServer. Browser and desktop ran sequentially with distinct temporary --output directories. The earlier audio cleanup timeout did not reproduce unchanged; contention is plausible but unproven. No product/test-source change or default Playwright configuration change was made for these reruns.
