# Data overlay scenario trace

Implementation evidence for the four approved slices. Planned rows are not verified; update test names and evidence as units finish. Provider and physical acceptance remain separate from automated fixtures.

## add-custom-data-overlays

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Data overlay backup | Round trip | Planned |
| configuration-backup-restore | Data overlay restore safety | Invalid reference | Planned |
| configuration-backup-restore | Data overlay restore safety | Canvases start disabled | Planned |
| data-overlay-canvases | Freeform canvas authoring | Several goals on one canvas | Planned |
| data-overlay-canvases | Freeform canvas authoring | Incompatible binding | Core contracts test rejects incompatible progress bindings; API/editor pending |
| data-overlay-canvases | Keyboard-accessible editing | Move with the keyboard | Planned |
| data-overlay-canvases | Canvas bounds | Element limit reached | Planned |
| data-overlay-canvases | Shared formatting | Markup in a text value | Planned |
| data-overlay-canvases | Shared formatting | Same goal as text and bar | Core contracts test uses one committed goal calculation for text and bar; live integration pending |
| data-overlay-canvases | Isolated preview | Simulate completion | Planned |
| data-overlay-canvases | Coherent output projections | Browser source and desktop agree | Planned |
| data-overlay-canvases | Coherent output projections | Reconnect after an update | Planned |
| data-overlay-canvases | Output scope | Unreferenced value | Core projection test emits only rendered content; authenticated transport pending |
| data-overlay-canvases | Data updates preserve other media | Update during an alert video | Planned |
| data-overlay-canvases | Fail-closed bindings | Missing image asset | Core projection test hides missing assets; management diagnostics pending |
| data-overlay-canvases | Stale value policy | Brief source outage | Core contracts test retains stale content through 600000ms; runtime expiry pending |
| data-overlay-canvases | Stale value policy | Long source outage | Core contracts test hides at 600001ms and on ended/invalid status; runtime expiry pending |
| data-overlay-canvases | Display suppression keeps data | Disable while values change | Planned |
| data-overlay-operator-controls | Operator value controls | Increment from Operator | Planned |
| data-overlay-operator-controls | Operator value controls | Unpinned value | Planned |
| data-overlay-operator-controls | Confirmed destructive actions | Cancelled reset | Planned |
| data-overlay-operator-controls | Retained correction input | Set conflicts with a newer change | Planned |
| data-overlay-operator-controls | Operator group reset | Reset the session group | Planned |
| data-overlay-operator-controls | Operator canvas visibility | Hide a canvas live | Planned |
| data-overlay-operator-controls | Accessible compact controls | Small workspace | Planned |
| shared-overlay-values | Shared typed values | One value on two canvases | Planned |
| shared-overlay-values | Shared typed values | Integer overflow | Planned |
| shared-overlay-values | Shared typed values | Text coerced to a number | Planned |
| shared-overlay-values | Shared typed values | Duplicate name | Planned |
| shared-overlay-values | Values persist without implicit resets | Restart restores the count | Planned |
| shared-overlay-values | Values persist without implicit resets | Hidden canvas keeps its value | Planned |
| shared-overlay-values | Guarded value changes | Stale set | Planned |
| shared-overlay-values | Guarded value changes | Concurrent increments | Planned |
| shared-overlay-values | Guarded value changes | Reset to default | Planned |
| shared-overlay-values | Goals over integer values | Saved-baseline progress | Core contracts test checks baseline950/current970/target1000 |
| shared-overlay-values | Goals over integer values | Value below baseline | Core contracts test preserves negative achieved and caps remaining at full amount |
| shared-overlay-values | Goals over integer values | Value over target | Core contracts test preserves raw current and clamps fill/remaining |
| shared-overlay-values | Restarting a saved-baseline goal | Restart after completion | Planned |
| shared-overlay-values | Reset groups | Reset a session group | Planned |
| shared-overlay-values | Reset groups | Group reset fails | Planned |
| shared-overlay-values | Reference-safe lifecycle | Delete a referenced value | Planned |
| shared-overlay-values | Reference-safe lifecycle | Delete a canvas | Planned |

## add-data-overlay-event-rules

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Data rule backup | Rules round trip | Planned |
| configuration-backup-restore | Data rule backup | Rule references a missing value | Planned |
| data-overlay-event-rules | Data overlays consume the central event bus | Crash after commit | Planned |
| data-overlay-event-rules | Data overlays consume the central event bus | Crash before commit | Planned |
| data-overlay-event-rules | Data overlays consume the central event bus | Long outage | Planned |
| data-overlay-event-rules | Data overlays consume the central event bus | New consumer | Planned |
| data-overlay-event-rules | Rule actions | Text field into an integer add | Planned |
| data-overlay-event-rules | Rule actions | Field multiplier | Planned |
| data-overlay-event-rules | Deterministic all-or-nothing evaluation | Second rule overflows | Planned |
| data-overlay-event-rules | Rules run independently of display | Counting while hidden | Planned |
| data-overlay-event-rules | Payload filters stay in the consumer | Filter on a custom field | Planned |
| data-overlay-event-rules | Subscription starters | Gift batch with recipients | Planned |
| data-overlay-event-rules | Subscription starters | Resubscription | Planned |
| data-overlay-event-rules | Moderated event text | Blocked username | Planned |
| data-overlay-event-rules | Reset on stream online | New stream starts | Planned |
| data-overlay-event-rules | Operator pause for automatic updates | Pause during testing | Planned |
| data-overlay-event-rules | Operator pause for automatic updates | Resume | Planned |
| data-overlay-event-rules | Rule editor | Simulate a rule | Planned |
| streamerbot-data-sources | Custom data event types | Valid custom event | Planned |
| streamerbot-data-sources | Invalid custom payloads are rejected | Unknown field | Planned |
| streamerbot-data-sources | Invalid custom payloads are rejected | Oversized text | Planned |
| streamerbot-data-sources | Schema changes disable dependent rules | Field removed | Planned |
| streamerbot-data-sources | Streamer.bot global-variable values | Variable changes in Streamer.bot | Planned |
| streamerbot-data-sources | Streamer.bot global-variable values | Reconnect after missed updates | Planned |
| streamerbot-data-sources | Streamer.bot global-variable values | Type mismatch | Planned |
| streamerbot-data-sources | Provider-backed values are read-only | Pinned in Operator | Planned |

## add-twitch-overlay-data

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| twitch-overlay-data | Authoritative follower total | Followers decrease while disconnected | Planned |
| twitch-overlay-data | Authoritative follower total | Follow event | Planned |
| twitch-overlay-data | Authoritative follower total | Late response from an old connection | Planned |
| twitch-overlay-data | Rate-limit-aware refresh | Rate limited | Planned |
| twitch-overlay-data | Creator Goals as a list | Progress during the initial load | Planned |
| twitch-overlay-data | Creator Goals as a list | Two active goals | Planned |
| twitch-overlay-data | Active-goal-of-type binding | Next follower goal | Planned |
| twitch-overlay-data | Active-goal-of-type binding | No goal of that type | Planned |
| twitch-overlay-data | Pinned goal binding | Pinned goal ends | Planned |
| twitch-overlay-data | Provider goals keep Twitch units | Sub-point goal | Planned |
| twitch-overlay-data | Goal scope does not affect alerts | Existing account without goal scope | Planned |
| twitch-overlay-data | Broadcaster change invalidates bindings | Account switch | Planned |

## add-data-overlay-templates

| Capability | Requirement | Scenario | Evidence/status |
| --- | --- | --- | --- |
| configuration-backup-restore | Template backup | Templates round trip | Planned |
| data-overlay-templates | Bundled starters | Start from Goal bar | Planned |
| data-overlay-templates | Saved user templates | Save a canvas as a template | Planned |
| data-overlay-templates | Independent copies | Edit the template later | Planned |
| data-overlay-templates | Compatible slot mapping | Reuse an existing goal | Planned |
| data-overlay-templates | Compatible slot mapping | Incompatible mapping | Planned |
| data-overlay-templates | Provider slots need a source | No Twitch connection | Planned |
| data-overlay-templates | Missing assets | Asset deleted | Planned |
| data-overlay-templates | Flattened group insertion | Insert a badge group | Planned |

## Baseline and acceptance limits

- Base: origin/main 55d29f2b; locked dependencies installed successfully.
- Focused pre-change tests: timer event rules 2/2 and management route 21/21 passed with one worker.
- Broad pre-change unit run encountered slow zero-test collection and was stopped; diagnosis pending. No full-suite passing claim.
- Central event bus implementation is absent. Bus-dependent scenario evidence remains blocked pending that prerequisite; a proposal is not a runtime contract implementation.
- No real Twitch account, Streamer.bot globals or physical OBS/desktop acceptance has been performed.
