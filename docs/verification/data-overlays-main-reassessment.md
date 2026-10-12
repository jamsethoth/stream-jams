# Data overlay dependency reassessment — October 11, 2026

Scope: merge `origin/main` at `4dc22d3c` into `codex/data-overlays-implementation` and reassess the remaining Data work. The October 8 [scenario trace](data-overlays-scenarios.md) remains a historical record of the candidate before this merge.

Later implementation: the [live Creator Goals integration record](live-creator-goals.md) supersedes the Creator Goals and follower-hint status below. This document preserves the earlier dependency assessment.

## Decision

The central event bus is implemented on main. Data event rules and follower refresh hints are ready for implementation against its actual contracts. Live Creator Goals can also proceed, but need additional Twitch event support and end-to-end source integration. None of those pending features became functional merely by merging main.

Streamer.bot global-variable sources remain blocked specifically on real sanitized `GetGlobal`, `GetGlobals`, and variable create/update/delete fixtures. That evidence gap does not block rules or Twitch work. Real Twitch account and physical output acceptance remain separate from disposable automated checks.

## Evidence and remaining work

| Area | Current evidence | Next implementation work |
| --- | --- | --- |
| Durable Data rules | `packages/core/src/event-bus/types.ts` exposes `EventBusConsumerRegistration`, transactional `checkpoint()` and `expiresAfterReplayAge: false`. `apps/server/src/modules/events/event-bus.ts` initializes new consumers at the journal head, resumes existing cursors, isolates failures and avoids retry after a committed checkpoint. Journal pruning retains rows not passed by every consumer. | Register a stable Data consumer; commit effects and checkpoint on the same SQLite connection; add rules, pause state, moderation, reset behavior and crash/replay tests. |
| Shared selectors and editor | `packages/core/src/event-bus/selector.ts` matches canonical events and exact external identities. Main has the shared Management selector editor and Alerts/Effects/Timers/Videos consumers. | Reuse selectors; evaluate Data payload filters only inside the Data consumer after schema validation. Add ordered rules, typed inputs, starters and isolated simulation. |
| Custom broadcasts | The bus retains declared external payloads, bounded to 16 KiB, and subscribes to declared identities. `modules/videos/streamerbot-video-intake.ts` demonstrates `General` / `Custom` transport with a `StreamJams` payload marker. | Correct the pending Data proposal's transport assumption: select and declare `General` / `Custom`; validate `source: StreamJams`, `type: Data` inside its payload. Unrelated custom broadcasts return no-match. Do not invent a `StreamJams` / `Data` transport subscription. |
| Follower hints | Canonical `follow` is already normalized and published on the bus. Data polling and its ten-second hint throttle already exist. | Connect a bus consumer to the hint method. Refresh the authoritative total; do not increment locally. Cover deduplication, disconnects and late responses. |
| Creator Goals | Validated Helix list client, optional `channel:read:goals` scope, and pure snapshot/buffer/selection helpers exist on this branch. Current `streamEventTypes` and Twitch subscription/normalization code do not contain goal begin/progress/end events. | Add optional-scope-aware goal subscriptions, validated normalized goal events and bus schema support; snapshot only after subscriptions are active; wire buffering, reconnect and overflow resnapshot; persist latest-of-type/pinned bindings and add source controls/output tests. Missing goal permission must preserve existing alert intake. |
| Streamer.bot globals | No `GetGlobal`/`GetGlobals` implementation or required real response/event fixtures found in the current Streamer.bot module. | Obtain sanitized fixtures before defining this adapter. Keep globals separate from rules if the fixture gate remains unresolved. |

The runtime previously returned `blocked-event-bus` for otherwise authorized Creator Goals. This integration updates that status to `integration-pending` and changes the Management explanation, so it no longer claims the bus is missing.

## Merge compatibility

Main's exact migration history is preserved. Data migrations append as `042-custom-data-overlays` and `043-data-overlay-templates`. Main has no migration ID 033, so migration count / portable backup schema versions are **41** for Data and **42** for templates. The unreleased branch's earlier Data migration histories and portable schemas 33/34 carrying Data sections are rejected rather than confused with main's different schemas. No normal user database was opened or modified.

Videos and Data remain independently registered across Management, Operator, browser outputs, private desktop transport and backup. Data freshness and private-image ownership guards remain intact.

## Integration verification

The merged branch passes workspace lint/error provenance, strict typecheck and the full workspace build. Focused verification passes 171 persistence/migration tests, 151 runtime/output tests, 218 frontend/source tests and 93 bus/Data/Twitch contract tests (633 total). Initial sandbox runs failed on generated temporary-cache access and rename permissions; unchanged tests passed with ordinary process/temp access. Four migration tests then exposed disposable rollback fixtures retaining the newly appended Data tables/history; those fixtures were corrected and all four passed on rerun.

All 14 rebuilt disposable Chromium workflows pass across Data canvases/Operator, templates, Twitch follower sources, Videos queue and bus diagnostics. They use isolated services/databases and verify the updated goal status in the live built UI. The static Storybook build and full interaction/accessibility/console gate pass: 472 scenarios across 54 suites (314.69 seconds).

All four Data changes and 54 canonical capabilities pass strict OpenSpec validation. One independent GPT-6.1-sol low-effort review of the integration found no actionable regressions. The full unit/script suite was not rerun for this merge; the October 8 counts remain historical. No real-account or physical-output acceptance was performed.
