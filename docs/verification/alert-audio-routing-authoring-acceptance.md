# Alert routing: authoring and acceptance checkpoint

September 7, 2026. Scope: `add-alert-audio-routing` tasks 5–6, following the [desktop safety checkpoint](alert-audio-routing-desktop-safety.md). Local implementation and acceptance are complete: routing is 29/29 tasks and the desktop/tray prerequisite is 23/23. The numbered manual checklist and all three assisted checks have explicit user acceptance alongside the recorded automated evidence. Earlier runner/native-close observations remain documented and are not declared fixed. This is local acceptance, not publication, archive or main-spec synchronization.

## Implemented workflow

- Settings route creation, rename, explicit binding, referenced-delete/rebind confirmation, explicit one-second Test, retry, stale status, and dirty navigation. Typed management APIs retain authorization/CSRF and validate route/status contracts.
- Alert-wide Browser Source/device selections use normal draft/history/save behavior, retain missing selections, and name live-impact destinations even for device-only alerts with no ready visual profile.
- Editor/inventory Send test separates canonical device audio from valid connected browser-profile delivery. Null-profile tests never synthesize a visual profile. Results name delivered/unavailable destinations with a reference. Include audio excludes both explicit browser/device paths; Preview and TTS retain their separate semantics.
- Alert videos are silent on preview/test/live and legacy visual-video paths. Existing assets/layouts are retained; management explains adding an explicit audio layer. Video-shoutout is unchanged.
- Backups preserve portable route identity/assignments, require explicit rebinding, name setup work and preserve exact bindings on rollback. Runtime activity prevents restore during device-only playback and pending route tests. Existing portable SQL projection was reused rather than adding a duplicate helper.
- Route failures expose safe names, cause/next step/reference, and correction links to Audio outputs. The [operator runbook](../mvp-runbook.md#alert-audio-outputs) documents all modes, recovery, video/TTS limits, restore and independent OBS capture/monitoring risks. Schema documentation was checked against the executable migrations (19 migrations, 20 tables).

## Verification record

Recorded full automated gate results on September 7, before the user-assisted acceptance session (the full suites were not rerun during final documentation sign-off):

- Repository lint and typecheck passed, including final test-fixture corrections.
- Full unit suite: **1,521 tests across 180 files passed**, exit 0. Vitest emitted worker-termination warnings for `use-audio-status`, `formatters` and `editor-state`; those three files subsequently passed **31 tests** in isolation without the warnings. No timeout was changed and no cause or permanent fix is claimed for that transient runner behavior.
- Full browser E2E: **32 passed**. The routing workflow additionally passed after fixture-only screenshot adjustments. Desktop Settings (1280 px), narrow Settings (390 px), and the editor routing inspector (1280 px) were captured and visually inspected. No overflow/overlap was found in the changed controls. The test also checks page errors and Vite error-overlay absence. Captures contain synthetic configuration only.
- Storybook build passed; **192 interaction/accessibility tests across 18 story files passed**, including the new routing states and existing desktop settings. Existing bundle-size/deprecation advisories remain non-blocking.
- Production monorepo build and Windows packaging passed. The rebuilt live Settings UI created and retained an unbound route through reload; real worker/main/preload audio-byte delivery ran with volume forced to zero before native playback, then removed media elements. This is not an audible acceptance claim.
- Both routing and tray OpenSpec changes passed strict validation; `git diff --check` passed.

Final desktop suite: **17 passed, 1 intentionally skipped** in 36.4 seconds, exit 0. `STREAM_JAMS_AUDIO_TEST=0` kept the approval-gated audible capability test disabled. Native SQLite/keyring, packaged service/UI, close preference/restart/dirty quit, duplicate launch, occupied-port handling, crashed-renderer confirmation and session-end behavior all passed. No Stream Jams process or test listener on 4173/6006 remained after the final checks; isolated temporary profiles were cleaned up by the test harness.

Focused red/green regressions established missing output UI, invalid-profile device-test blocking, unmuted legacy alert videos and incorrect audio Diagnostics correction before their fixes. No production profile or OBS/Wave Link/Windows configuration has been changed.

One independent read-only review found three P2 issues, corrected with regression coverage: an unchanged device binding was unnecessarily revalidated during an offline rename; disabling a valid device-only alert incorrectly required a visual profile; and unchanged-route audio-content/eligibility edits bypassed live-impact confirmation. The confirmation also retains server-reported sibling route names. Settings regressions additionally cover unfinished create drafts in dirty navigation and an older status poll racing a save.

The initial whole-repository run exposed one invalid runtime fixture (activating an empty set); it now enables the fixture alert before activation. Browser/Storybook failures were test defects: disconnected-profile fixture state, outdated success text, ambiguous status/error queries and a missing Settings audio mock. Desktop lifecycle fixtures now select the management URL rather than relying on window order or counting the hidden player as a duplicate management window. No assertion timeout or production shutdown deadline was relaxed.

The desktop gate also exposed two corrected fixture defects: the new live UI assertion used "Needs setup" rather than the actual "Needs binding" label; the worker-only host did not acknowledge the new startup/shutdown audio lifecycle messages. The host now acknowledges only mute/close controls and rejects playback commands; it does not pretend to provide physical playback.

One earlier full desktop run reported **16 passed, 1 failed, 1 intentionally skipped**: the crashed-management/native-confirmation test reached a stopped listener but timed out waiting 30 seconds for the app-close event. It had passed in the preceding run. With diagnostic-only lifecycle logging, **three unchanged-deadline isolated repetitions passed** (1.8/3.5/3.4 seconds), followed by the final complete suite above (this case passed in 2.9 seconds). Do not reinterpret the failed run as green or claim its native cause was identified/fixed. The previously deferred BL-044 investigation was not reopened; this observation is retained for that separate investigation without claiming the same cause. The audio harness retains its original 15-second native shutdown bound.

## Scenario reconciliation

| OpenSpec scope | Executable evidence / acceptance boundary |
| --- | --- |
| Alert-wide defaults, cleared outputs, variations, duplication, themes, hidden/same-asset layers and legacy browser paths | Core audio/resolver/schema tests, SQLite editor and alert-set service tests, editor history/UI tests; foundation and canonical-queue checkpoints |
| Explicit route persistence, unknown/deleted references, aliases, rebinding, CLI and security | Audio service/repository/HTTP tests; desktop permission/IPC tests; Settings API/component stories and Playwright workflow |
| No visual recipients, multiple profiles, bounded independent completion, stale acknowledgements, failed recipients | Queue/coordinator/desktop-sink tests; real runtime-composition device-only tests; desktop-safety checkpoint |
| Device loss, changed IDs, crash/retry, service lease, hidden lifetime | Player/host/transport tests, silent packaged smoke and user-confirmed physical reconnect/background/crash/recovery/service-loss checks below; changed-ID and lease-expiry edge cases retain automated coverage |
| Preview, selected-document Send test, inclusion toggles, partial failures, inventory profile chooser and existing Browser Source telemetry/copy/auth | Editor service/HTTP/runtime and editor/inventory tests; management and overlay Playwright; no new Browser Source or exposed key |
| Authoring, live-impact naming, video silence, TTS/video-shoutout boundary and safe diagnostics | Editor/Settings unit and Storybook interaction/accessibility tests, OverlaySurface regression, Diagnostics/coordinator tests, operator runbook |
| Mute/unmute, persistence failure, skip-before-next, pause/DND, replay and shutdown | Existing and extended operator/playback/desktop tests, user-confirmed manual sound/capture/safety checks and fresh silent packaged lifecycle verification |
| Portable exports, explicit rebind, orphan/schema rejection, exact rollback and restore/activity races | Snapshot/backup/maintenance/runtime-composition tests; schema explorer generated from migrations |

All five delta-spec files are represented above. The matrix below is now reconciled with the explicit user confirmations and assisted runtime observations, rather than treating automated mocks or historical capability evidence as physical acceptance.

## User-assisted acceptance matrix

Use the final packaged build, an isolated configuration, two explicitly agreed endpoints and the user's chosen OBS setup. Confirm each action before any audible test or physical change.

| Check | Accepted observation / evidence |
| --- | --- |
| Browser-only, device-only, combined | User's complete numbered checklist: endpoint meters and OBS capture match selected destinations without duplicate/fallback audio |
| Multiple audio layers, including repeated asset | User's checklist: visible layers retain volume and each plays once per endpoint |
| Landscape and Vertical together | Repeated assisted check: both real overlay renderers receive one event; one device batch starts once per System/SFX endpoint; user confirms no doubling/echo |
| Hide, restore, restart | User's checklist: hidden playback and saved bindings/selections survive restart |
| Physical removal and rebind | User-confirmed removal/reconnect and healthy-destination behavior; physical runs recovered the same device ID, while changed-ID rejection/explicit rebinding retains automated coverage |
| Mute, skip, pause/DND, replay | User's checklist: correct sound/queue behavior; existing persistence-failure and occurrence-safety regressions remain applicable |
| Player crash/service loss, full Quit | User-confirmed cutoff/no replay, fresh automatic-recovery playback and service-loss silence; manual Quit/preference acceptance and fresh silent packaged lifecycle test retain the original shutdown bound |

## User-assisted progress: September 7

The user reported that all manual instructions through section 5's output-toggle / Undo / Redo / Revert check are working. This is user-reported acceptance of the route tests, destination matrix including device-only operation without OBS, recording/privacy checks, multiple-layer/volume/visibility/same-asset checks, and output history controls. It is not a new automated observation or acceptance of the later steps.

The user then quit the app and reported that it did not shut down cleanly. The exact symptom and cause were not established in this turn; do not count clean shutdown as passed or assume the same cause as BL-044. Before the requested restart, no Stream Jams process remained, the former health endpoint was unreachable, and the same port could be bound. No forced termination was necessary.

The same packaged build was restarted with the existing isolated config/data/assets/Electron profile, without resetting the database or bindings. Its service returned HTTP 200 and the management window was created. Next user checks: confirm saved bindings/selections after this restart, then the remaining video, tray/background, physical reconnect, safety and full-Quit checks. Single-event multi-profile, controlled crash and service-loss checks still require coordinated acceptance. Tasks 6.4 and 6.5 remain open. No tone or alert was triggered by the assistant during restart.

In the next update, the user reported all tests up to the instruction "Disable Close window to tray, save, and confirm X now fully quits" passed and requested another launch. This advances user-reported acceptance through restart persistence and the remaining layer/video, background/tray, physical reconnect and playback-safety checks leading up to that instruction. Before relaunch, no Stream Jams process remained and the health endpoint was unreachable. The saved config still contained `closeToTray: true`; it was left unchanged. Do not infer that the disabled preference was saved/persisted from this report; that final preference/X check needs an explicit result. The earlier unclean-shutdown report remains retained, not resolved by later passes. Assisted single-event multi-profile, player-crash and service-loss checks remain open.

### Numbered manual checklist sign-off

The user's latest report was: "all manual tests passed". Record this as user-reported acceptance of the complete numbered manual checklist, including the final saved Close window to tray opt-out and X-to-quit behavior. The latest restart had independently confirmed `closeToTray: false` in the same isolated configuration, a management window and an HTTP 200 health response; those observations establish persisted configuration and startup, not a measured shutdown duration.

The report supersedes the earlier partial-checklist status, but does not establish the cause of the earlier unclean shutdown or remove that observation. When asked whether it included the separately listed assisted checks, the user clarified: "i haven't done the assisted checks, so no". Single-event Landscape/Vertical device deduplication, controlled audio-player crash recovery and owning-service-loss cleanup therefore remain unperformed and pending coordinated acceptance. Tasks 6.4/6.5 remain open for those checks and final reconciliation. No new runtime test, audible playback, device change or process termination was performed while recording this sign-off and clarification, and the automated results above were not rerun in these documentation-only updates.

The earlier [capability evidence](alert-audio-routing.md) proves the selected backend was viable on this machine, but does not substitute for the separately pending integrated checks. BL-044's external process contention investigation remains separately owned and deferred. No deadline was increased, no external process was stopped, and no fallback driver/backend was added.

### Assisted session paused before user acceptance

The assisted checks began in a disposable copy of the isolated QA configuration, leaving the original saved profile unchanged. The single-event check observed both Landscape and Vertical rendering, one canonical audio batch, one real media start on each of QA System and QA SFX, no explicit browser audio elements, queue completion and media cleanup. These are automated observations only; the user's meter/audibility confirmation is still missing. A subsequent crash sequence deliberately crashed two identified, owned audio renderers, but the harness stopped with `Unexpected end of JSON input` before final recovery verification; do not record the crash check as passed. Service-loss injection was not started.

The user requested a pause because playback began without waiting for their readiness confirmation. The disposable instance was then explicitly muted and paused, with no current or queued playback. No further audio or fault injection is authorized until the user explicitly confirms readiness for the described individual check. Progress messages are not a substitute for that confirmation. All three assisted acceptance checks and tasks 6.4/6.5 remain open.

At the user's request, the session was re-prepared without playback. The crash-sequence harness error was traced to parsing the retry endpoint's successful empty HTTP 204 response as JSON; a focused failing assertion reproduced it, the harness-only correction passed the empty/JSON/error-response checks, and the real silent retry then succeeded. Direct playback/fault commands now reject without an individual readiness authorization, with all three guards checked. The multi-profile bell fixture was restored in the disposable copy, both profile clients were connected, and live inspection confirmed mute and pause enabled, no current/queued item, no audio elements and zero media starts during preparation. The next action awaits the user's explicit ready signal for the multi-profile check only; this is preparation, not assisted acceptance.

### Assisted multi-profile acceptance

After the user explicitly signaled readiness, the assistant described the expected observation before triggering the single-event check at 16:43:07 UTC. Both Landscape and Vertical rendered the alert, with zero explicit browser audio elements. The desktop received one canonical batch and started one unmuted media element on each of QA System and QA SFX, then completed the queue item and removed its media. Playback was automatically muted and paused again before asking for the user's observation. The user replied "it worked as you described" to the question about one bell without doubling/echo and one playback on each meter. This closes the assisted multi-profile check, not the remaining crash or service-loss checks.

The next crash-cutoff step was prepared silently. It will play one steady tone on both selected routes, deliberately crash only the owned hidden player after approximately 1.5 seconds, and check for prompt cutoff and no spontaneous replay. No subsequent recovery tone is chained into that step. The app remains muted and paused until a separate ready signal, and fresh-playback recovery will need its own described action and user response.

### Assisted crash-cutoff acceptance

Following a separate ready signal and explanation, the 16:47:16 UTC check started a steady tone on QA System and QA SFX and deliberately crashed only the identified hidden audio renderer after approximately 1.5 seconds. Its window was destroyed in 104 ms, a native `crashed` event was observed, the owning service remained healthy, and an automatically recreated player emitted no interrupted audio. Playback returned to muted/paused before asking for the user's observation. The user confirmed: "yes, it stopped and did not restart". This accepts cutoff and absence of spontaneous replay; fresh-playback recovery is not yet accepted.

Recovery was then prepared silently using that same automatically recreated player, without an explicit retry/reset after the accepted crash. No media elements or starts were present and the queue was empty, muted and paused. A new eight-second tone on both routes awaits a separate ready signal and user observation; service-loss injection also remains pending.

### Assisted fresh-recovery acceptance

After a separate ready signal and explanation, the automatically recreated player handled a new eight-second tone on QA System and QA SFX at 16:51:12 UTC. No explicit retry/reset occurred between the accepted crash and this fresh playback. One canonical batch started one media element per endpoint, completed the queue and removed its media. The app then returned to muted/paused. The user confirmed that both outputs played uninterrupted for about eight seconds and stopped normally. This accepts fresh playback after automatic recovery.

The final service-loss check was prepared silently with the app muted/paused and its queue empty. The disposable instance's owned service was identified using its application metrics and independently checked Windows executable path/start time. The next step awaits readiness to play a tone and terminate only that verified service; a service-unavailable dialog is expected and should remain open until the user has reported the audio observation. No service-loss injection has yet run.

### Assisted service-loss acceptance and final sign-off

Following another ready signal and explanation, the 17:00:45 UTC check played the steady tone on QA System and QA SFX, then terminated only the disposable instance's owned local service. Its PID, executable path and start time were revalidated before injection. The audio player was destroyed in 105 ms, the listener stopped, the owned service disappeared from application metrics, and no audio player remained or reappeared. No harness-forced audio cleanup was needed. The user confirmed that both routes stopped promptly, stayed silent and displayed the expected service-unavailable dialog. This accepts the service-termination path; lease-expiry and IPC-loss edge cases remain covered by the existing automated tests rather than a new physical fault-injection claim.

The assistant then requested normal Quit for the disposable app. The extra diagnostic cleanup helper reported an unavailable (`null`) exit-code value against its expected zero and therefore failed; retain that result rather than calling that helper green. The application close event completed within its unchanged 15-second bound, and a separate process check found no Stream Jams process. No force-stop was used for application cleanup. The existing packaged audio/lifecycle test was subsequently rerun unchanged with `STREAM_JAMS_AUDIO_TEST=0`: **1 passed in 5.9 seconds**, including forced-zero-volume production transport, live Settings behavior, media cleanup and its original 15-second shutdown check. This supplies fresh lifecycle evidence without relying on the failed extra exit-code assertion. It does not resolve the earlier intermittent shutdown issue or BL-044.

Final checks found zero Stream Jams processes and confirmed the QA port could be bound and released. The tested package was built at 13:47:59 UTC; the newest relevant source modification was 13:40:35 UTC, and no production source changed during assisted acceptance. The full gate results above therefore remain the recorded results for this implementation; only the focused silent packaged test and final OpenSpec/diff checks were rerun at sign-off. Tasks 6.4 and 6.5 are complete based on the combined scenario coverage, manual checklist and separately confirmed assisted checks. The previous capability records and intermediate pending statements remain historical checkpoints, not current status.

The original manual QA configuration/data/assets/profile remain untouched by the assisted fixture changes. The disposable copies and their ignored diagnostic evidence remain available locally; no user-authored QA data was deleted. No audio playback is scheduled. The separate asset-name display and Pause/DND UX observations were not implemented as part of acceptance, and the external resource investigation remains deferred.

No commit, push, PR, merge, archive or main-spec synchronization is included in this checkpoint.

## Publication verification: September 7

After the user requested archive, commit, push and PR creation, the same production implementation was verified again. No physical audio was requested or emitted by this publication run; `STREAM_JAMS_AUDIO_TEST=0` kept the audible capability test gated.

| Command / gate | Fresh result |
| --- | --- |
| `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --offline` | Passed; dependency metadata already current |
| `pnpm lint` / `pnpm typecheck` | Both passed |
| `pnpm exec vitest run --project=node --pool=threads` | 1,058 tests / 141 files passed |
| `pnpm exec vitest run --project=web --pool=threads` | 463 tests / 39 files passed; together the projects cover all 1,521 unit tests |
| `pnpm test:e2e` | 32 passed in 1.3 minutes |
| `pnpm build-storybook` / `pnpm test:storybook:ci` | Build passed; 192 interactions/accessibility checks / 18 files passed |
| `pnpm desktop:package` | Production workspace build and runnable Windows x64 packaging passed |
| `pnpm test:desktop` with audible capability disabled | 17 passed, 1 intentionally skipped in 38.3 seconds; native shutdown deadlines unchanged |

Commands above used `corepack.cmd pnpm` on Windows. The initial sandbox invocation could not access the installed Corepack cache; it was rerun with authorized runtime access. Three aggregate unit invocations (default pool twice, thread pool once) were interrupted after producing no visible progress beyond the run banner; none is counted as passed or evidence of a diagnosed root cause. The narrower project runs above completed without the earlier worker-termination warnings and cover every configured unit-test file. The default aggregate command remains a local runner verification limitation to check in CI. The historical failed shutdown observations and BL-044 remain retained.

The fresh [desktop Settings](images/alert-audio-routing/audio-settings-desktop.png), [narrow Settings](images/alert-audio-routing/audio-settings-mobile.png), and [editor routing](images/alert-audio-routing/alert-audio-outputs.png) captures were visually inspected and contain synthetic fixtures only. No changed-control overflow, overlap, or exposed live route key was observed. Local manual/assisted profiles and private diagnostic artifacts remain excluded from Git.
