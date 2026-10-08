## Context

The agreed outcome is an easy visual way to create custom counters, labels, and goals, with data arriving through API calls or WebSocket events. Users selected freeform canvases with templates, multiple independent displays per canvas, custom numbers/text, canvas-independent shared values, and manual resets by default. Implementation and publishing have not been authorized.

Existing foundations include `packages/core/src/timers/event-rules.ts`, normalized Twitch/Streamer.bot events, safe templates, the Alerts layer editor, Music layout editing, typed SQLite repositories, the module registry, scoped automation, and shared output surfaces. Current `EventIngestionService` deduplicates in-flight/handled messages in bounded memory; this does not establish durable accounting. Add a data-specific transactional consumer rather than changing existing alert/timer admission semantics or treating overlay clients as event processors.

Research reviewed October 7, 2026:

- [Streamlabs sub goals](https://streamlabs.com/content-hub/post/how-to-set-up-sub-goal-widget): starting amount, target, eligible events, subscriber versus sub-point units, styling and preview.
- [Streamlabs labels](https://support.streamlabs.com/hc/en-us/articles/217176088-Setting-up-Stream-Labels) and [OBS text](https://obsproject.com/kb/text-sources): latest/aggregate text displayed independently of its producer.
- [StreamElements widget data](https://support.streamelements.com/hc/en-us/articles/10474424314642-Widget-Data-Overview): goals, current totals, session statistics and aggregates have different lifecycles.
- [StreamElements events](https://docs.streamelements.com/overlays/events) and [store/counters](https://docs.streamelements.com/overlays/custom-widget): initial snapshots, subsequent updates and shared data.
- [Streamer.bot variables](https://docs.streamer.bot/guide/core/variables) and [WebSocket methods](https://docs.streamer.bot/api/csharp/methods/core/websocket): persistent state and external event producers.
- [Twitch Creator Goals](https://dev.twitch.tv/docs/api/goals/): authoritative current/target state plus begin/progress/end events; preserve declared goal units.

These sources establish supported product patterns, not measured market prevalence. Proposed limits, contracts, and scope choices below are design decisions for review.

## Goals / Non-Goals

**Goals:** Shared durable values; declarative visual update rules; HTTP and WebSocket inputs; useful native Twitch sources; reusable templates; multiple independent canvases; deterministic formatting and rendering; recovery without double counting; isolated preview; documented local integration contracts.

**Non-goals:** Payment processing or native third-party donation adapters (BL-020), authoritative accounting of events never received, scheduled/calendar/session resets, leaderboards or arbitrary object stores, remote WebSocket URL subscriptions, LAN access, custom HTML/JavaScript, arbitrary expressions, masks/particles/nested groups/freehand drawing, marketplace, proprietary imports, and changes to existing timer/queue semantics. Insertable template groups flatten into ordinary elements and do not introduce a general scene graph. This is a focused new module; NP-001/NP-006 remain boundaries for alert authoring.

## Decisions

### 1. Separate values, goals, and canvases

Create a `data-overlays` module disabled by default. Shared data intake is configured separately from module display enablement: hiding/disablement of a canvas or renderer never stops an enabled input rule. A global output pause or do-not-disturb suppresses display through existing surface policy and does not stop counting. Rules can be explicitly disabled in Data management.

Values have stable opaque IDs, unique user-visible names (case-insensitive after trimming), a kind, reset default, current typed content, revision, timestamps and source status. Renaming retains references. Proposed supported kinds: signed safe integer, finite bounded decimal number, bounded plain text, and money represented as safe integer minor units with a fixed supported ISO currency and exponent. Reject unsupported currencies, coercions, unsafe arithmetic, and currency mismatch; never silently convert currencies. Type/currency changes require creating a replacement value and explicit rebinding, preserving the meaning of saved rules.

Custom values accept manual changes and enabled rules; provider-backed measurements are read-only and can be copied to a custom value. A value's kind is not its meaning: an integer can be a cumulative counter or an externally supplied current measurement. There is no implicit reset on restart, reconnect, hide/show, template instantiation, or stream lifecycle events. Reset writes the configured default; text resets to its default too. Goal reset for saved-baseline mode captures a new baseline without changing the underlying value.

Goals have their own IDs and names, a numeric/money value reference and compatible target. Fixed-target progress uses lower bound zero. Saved-baseline progress uses `(current - baseline)/(target - baseline)`, with target greater than baseline; its configured target is baseline plus the desired additional amount. Clamp displayed fill to 0..1, preserve raw current/over-target amounts, and expose current, baseline, target, achieved amount, remaining (minimum zero), percentage, and completed. Goal completion has no automatic reset or alert side effect in v1. Twitch-owned goals use provider targets and cannot be manually edited/reset. Deleting a referenced value/goal is rejected with an impact list; rebinding/removal must be explicit. Deleting a canvas removes only its layout/output assignment.

Saved-baseline goals persist the desired additional amount separately from the computed absolute target; capturing a new baseline recomputes target as new baseline plus that amount. V1 integer/money content uses JSON safe integers; decimal content uses canonical decimal strings with at most six fractional digits and absolute magnitude at most 1000000000000, calculated through checked scaled integers (reject representations whose scaled value is unsafe). Money commands use `{minorUnits, currency}`; goal targets use the same representation as their referenced value. Currency exponent comes from the supported versioned currency catalog, not producer input. Numeric multipliers are canonical decimal strings under the same precision rules, and results must fit the destination kind exactly; no implicit rounding.

Alternative: embed counters inside widgets. Rejected because duplicate layouts would create ambiguous counting/reset ownership and hinder API integration.

### 2. Declarative update rules and explicit custom event sources

Rules select a source and event type, optional bounded AND filters (`equals`, `notEquals`, numeric comparisons), a destination, and `set`, `add`, `subtract`, or `reset`. Inputs are a typed constant or an allowlisted event field with an optional bounded numeric multiplier. Evaluation is core-owned, with no `eval`, scripts, arbitrary JSONPath, regex or network access. Text is plain text and passes existing moderation where applicable.

Custom event sources are management-created identities with versioned event schemas containing primitive fields; sample JSON helps select fields but does not authorize a new schema. Proposed bounds: 32 fields, flat objects, number/text/boolean primitives, 16 KiB message, 2 KiB text value, 50 rules per value, 1000 values, 250 goals, 50 canvases and 100 elements per canvas. Discover these limits in capabilities. Unknown fields, missing required fields, invalid field references/types, and unsupported schema versions fail validation. Schema changes require explicit rule validation and reactivation of affected rules. Secrets are never accepted as display fields.

Process matching rules in persisted order, then stable rule ID order; compute and validate all effects against a transactional working state. Any invalid effect rolls back the entire data-event transaction and records a sanitized reference ID. The event remains retryable after correction because no receipt committed. Data rejection does not undo independent Alerts/Timers processing or terminate intake. Reprocessing a committed event after editing its rules does not retroactively apply new rules.

Built-in subscription presets count paid/Prime subscriptions and gift recipients once and exclude resubscriptions by default. Aggregate community-gift notifications are excluded when counting individual recipients. A batch-only preset can count gift quantity instead; both paths must not be selected by the starter. Explicit custom rules can choose another policy, with overlap guidance. No claim is made that historical provider events are recoverable.

Alternative: arbitrary rules inside overlay JavaScript. Rejected because counts would depend on browser lifetime, number of recipients, and credentials in rendering code.

### 3. Two ingress meanings, one authoritative mutation service

Native local clients use existing proof-bound pairing with new explicit scopes `data:read`, `data:write`, `data:events`. Write/events require data:read. In v1, write permission covers custom values, and event permission covers explicitly management-approved custom source IDs. Source additions require grant approval updates; no wildcard source authorization. Approval UI states the breadth of custom-value write access. Existing credentials never receive these scopes automatically.

Proposed HTTP paths under `/automation/v1`:

| Route | Meaning |
| --- | --- |
| `GET /data/state` | Authorized values, goals, source/schema metadata and data revision |
| `POST /data/values/:id/commands` | Typed set/add/subtract/reset |
| `POST /data/events` | Submit a custom event to configured rules |
| `GET /data/receipts/:requestId` | Read caller-owned committed receipt |
| `POST /data/ws-tickets` | Obtain a 30-second, single-use connection ticket |
| `GET /data/ws` (upgrade) | Authenticate in first frame, then state subscription and approved inputs |

All writes carry `requestId`, `observedRuntimeId`, and expected value revision for direct commands, or source/schema version and stable source event ID for events. Direct command envelope is `{requestId, observedRuntimeId, expectedRevision, action, value?}`; reset omits value. Decimal/money representation is explicit in docs. Custom event envelope is `{requestId, observedRuntimeId, sourceId, schemaVersion, eventId, fields}`. Server supplies receive time and validates all fields; externally supplied IDs/times cannot override ownership/order.

WebSocket browser upgrades cannot rely on HTTP Authorization headers. Instead a native client obtains a ticket using its bearer credential, connects without credentials in the URL, and submits `{type:"authenticate", ticket}` within five seconds. No snapshots or writes occur before successful authentication. Ticket consumption binds the connection to the grant; invalid/expired/reused tickets close it. Native loopback/Host/Origin restrictions apply to ticket issue and upgrade. Credentials/tickets are redacted from logs. Subsequent messages are strict `state.subscribe`, `value.command`, or `event.submit` envelopes carrying a correlation ID; use the same service, scope checks, receipts and errors as HTTP. Grant revocation closes its connections. Reconnection requires a fresh ticket/snapshot and never replays buffered writes.

Management uses its existing authenticated/CSRF boundary for CRUD and manual controls. Overlay keys authorize only allowlisted display projections and never ingress or receipt reads. Provider secrets and schema sample payloads remain management/server-owned.

Proposed limits: 10 input writes/second per grant, burst 20; 5 ingress sockets per grant; at most 100 pending messages or 1 MiB outbound per socket. Overflow rejects unaccepted inputs or closes a slow recipient; no unbounded buffering. Metadata exposes supported operations and limits, without leaking unrelated provider credentials, assets, or internal persistence.

### 4. Durable receipts with bounded replay guarantees

Persist each accepted event/command receipt in the same SQLite transaction as every affected value and the global data revision. Receipt identity is profile data epoch plus grant/request ID for commands and profile data epoch plus source/event ID for event effects. Hash canonical typed bodies, excluding transport correlation and observed runtime, so reusing an ID for a different effect returns conflict. Check authenticated caller-owned committed receipts before runtime/revision guards: a matching already-committed request can return its receipt after restart without mutating again. An unknown stale-runtime request cannot execute.

Retain receipts for seven days, bounded at 100,000 records; prune expired entries, but never evict unexpired receipts to admit new writes. Reject new writes at capacity, with diagnostics. Replays after the retention window have no deduplication guarantee; callers must not retry uncertain old mutations. The documented extension provides receipt lookup, not permission for blind automated command retry. Other automation commands retain their current no-retry/no-receipt contract.

For built-in events, retain provider origin and stable upstream event identity independent of current transport where available. Different provider IDs that cannot be correlated do not establish semantic dedupe; one active provider and safe preset choices reduce overlapping gift/transaction paths. A crash before commit applies nothing; a crash after commit recovers both value and receipt. Publish only committed projections. On startup, restore values and publish a fresh runtime snapshot; receipt history cannot reconstruct events the app never received.

### 5. Twitch state adapters use authoritative snapshots

Offer direct Twitch `Followers total` and selected active Creator Goals as read-only sources. Initial Helix reads establish current values; goal begin/progress/end EventSub messages update goal state. Re-fetch on reconnect, reject old connection-epoch results, and reconcile follower totals every 60 seconds with rate-limit-aware backoff. Follow events may trigger an early refresh; they do not permanently increment the follower total because unfollows and missed events would drift. Subscribe before initial goal read and reconcile buffered goal updates against a subsequent snapshot to prevent initial-read races; cap buffering and resnapshot on overflow.

Gate each capability by required authorization (including `channel:read:goals` for goals), independently of existing alert/provider readiness. Missing scopes show a reconnect action for the affected data source. Source IDs remain pinned to broadcaster and selected goal identity; ending a goal never silently rebinds it to a new goal. Preserve goal kind/units, especially subscriber versus sub-point semantics. A new broadcaster invalidates prior bindings. Provider-owned money targets are not invented.

Streamer.bot normalized events can drive custom counters, but the generic Streamer.bot connection is not assumed to expose an authoritative follower total or goal snapshot. External tools can supply those through approved custom inputs. Native donation adapters remain BL-020; custom money events can drive a campaign today without conflating providers or currencies.

### 6. Bounded visual canvases and templates

Use existing target profiles, numeric geometry fields, snapping, asset picker, text styling, and safe rendering primitives where compatible; inspect editor duplication before extracting only actually shared helpers. V1 supports plain/formatted text bindings, images from registered local assets, solid rectangle/ellipse shapes, and horizontal/vertical progress bars with direction, fill/background colors and bounded border styling. Elements have stable IDs, integer layer order, x/y/width/height, visibility and compatible value/goal references. No nested groups, scripts or canvas-specific counting rules. Keyboard movement and numeric controls provide alternatives to dragging.

Data management lists shared values/goals, current content, source status, rules, last update and reference counts. Canvas management lists independently enabled canvases and target-profile/output assignment. Multiple canvases can compose together in stable configured order. Live changes require explicit save/apply; drafts and sample events never mutate real counters. Existing global output safety controls apply; there is no new queue or audio channel.

Bundled starters: Counter badge, Goal bar, Latest supporter, and Combined goals panel. Support saved user canvas templates and insertable groups. Save only layout, assets and typed binding slots, not live values, receipts, grants or provider secrets. Instantiation maps each slot to a compatible existing value/goal or explicitly creates custom data; provider slots require an existing configured source. IDs are regenerated and references rewritten atomically. Flatten inserted groups into ordinary independent elements. Imported/unresolved assets or slots are visible management errors; affected elements remain hidden live.

Formatting is core-owned: approved value/goal fields inserted through a picker, number precision/unit/prefix/suffix, currency formatting, and text wrapping/ellipsis. Use one formatter/projection for editor, test, browser and private desktop. Preview has its own sample value store and can simulate zero, completion, over-target, decrease, long text, missing source and invalid input. Simulation never opens external ingress or adds live receipts.

### 7. State freshness, output policy, and restore

Each source reports waiting/ready/stale/ended/error to management with last successful update and a diagnostic reference. Provider measurements become stale after failed refresh/disconnection; custom event counters retain their saved value without implying completeness. Each bound element has a `retain-last` or `hide` stale policy, default hide for provider measurements and retain-last for custom durable values. Unresolved/type-invalid/unauthorized bindings always hide. Live rendering never displays operational errors. Management previews show status and can deliberately inspect the retained value.

Output protocol uses runtime identity and increasing committed data revision, with a coherent initial snapshot and bounded subsequent full canvas projections. Read/snapshot delivery is ordered around subscription so updates cannot be lost between snapshot and listener registration. Slow consumers resnapshot after reconnect; old runtime/revision frames are discarded. Updates preserve other modules' active media and do not remount unrelated playback. Module-specific, unified browser and existing shared desktop surfaces render the same safe projection; overlay scopes reveal only referenced values, not the full data catalog.

Backup includes values, current state, reset defaults, goals/baselines, rules/schemas, canvases/templates and registered asset references. Exclude tickets, grants, secrets, receipts, connection status and volatile runtime IDs. Restore validates references and applies transactionally under existing maintenance guards, creates a new data epoch, invalidates input grants/tickets, disables external input rules pending review, and marks provider bindings awaiting reconnection. Custom saved values remain available. Failed restore preserves the previous profile and receipts exactly. Imported canvases start disabled until reviewed.

## Risks / Trade-offs

- [Event-only totals omit offline activity] -> Label them as received-event counters; use authoritative snapshots when available, and offer explicit correction.
- [Receipt retention is finite] -> Publish its window, reject saturation rather than silently evict, and forbid blind retries beyond it.
- [Arbitrary integrations can send bad data] -> Strict schemas, scoped local authority, type-safe rules, quotas, plain-text rendering and sanitized diagnostics.
- [Broad feature surface] -> Implement independently reviewable slices: data/goals; rules/ingress; Twitch state; canvas/output; templates; integrated acceptance. Do not defer correctness gates between slices.
- [Multiple manual/producer writers conflict] -> Value revisions guard direct updates; event effects serialize server-side; mismatched corrections require refreshed user intent.
- [Library/custom-editor costs] -> Reuse existing primitives first; evaluate maintained editor libraries only for demonstrated gaps and record license/bundle/accessibility trade-offs before adding dependencies.

## Migration Plan

Add forward migrations for values/goals/rules/sources/canvases/templates/receipts and data epoch through typed repositories with foreign keys enabled. Existing profiles gain a disabled module with no new intake or grants. No existing module is reconfigured. Include new schema sections in backup migration tests. Rollback before first real use uses the pre-upgrade backup with SQLite WAL companions; once users create data, do not promise an older build can load or retain it. Module disablement is the reversible operational fallback, while rule disablement stops data intake separately.

Before publishing run repository lint/typecheck/tests/build, Storybook gates and disposable-service Playwright; rebuild/restart affected services, verify health and the actual workflow, then record isolated OBS/private-desktop acceptance separately from automated evidence.

## Open Questions

No blocking requirements question remains for proposal review. Review choices introduced here: fixed-target plus saved-baseline goals; native Twitch snapshot adapters in v1; broad custom-value write scope with source-restricted event grants; exact numeric/canvas/receipt limits; and deferral of automatic resets. These are proposed decisions, not previously confirmed user requirements. Implementation library selection follows the editor fit assessment; no dependency is preselected.
