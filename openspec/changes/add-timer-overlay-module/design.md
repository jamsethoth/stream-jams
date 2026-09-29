## Context

Stream Jams already registers Alerts and Screen Effects as overlay modules, composes module-specific and unified browser outputs, delivers normalized visuals to an opt-in desktop surface, and routes explicit media audio to Browser Source and named local-device destinations. It does not have a persistent timer definition, a pauseable server-authoritative countdown, or an automation credential suitable for long-lived generic HTTP actions.

Timers differ from existing queued playback occurrences. A timer can remain active for a long interval, pause without occupying a queue, coexist with one run from every other timer definition, and update its visible remaining time without receiving a new server message every second. The design must keep browser and desktop visuals synchronized, avoid duplicate audio work, preserve management/overlay authorization separation, and reset all live state when the process restarts.

## Goals / Non-Goals

**Goals:**

- Persist reusable timer definitions with stable identities, labels, durations, compatible icon and cue assets, and explicit audio outputs.
- Run at most one ephemeral instance per definition while allowing different definitions to run concurrently.
- Provide deterministic start, pause, resume, stop, restart, completion, reconnect, and failure behavior from one authoritative server clock.
- Render the same normalized timer state in module-specific, unified browser, and desktop overlay outputs.
- Provide accessible management authoring, full definition controls, and compact active-run controls in Operator.
- Support generic Stream Deck HTTP actions through a loopback-only, least-privilege bearer credential.
- Reuse global asset, audio route, backup/restore, diagnostics, and shared-surface boundaries.

**Non-Goals:**

- A custom Stream Deck plugin.
- Automatic Twitch reward or provider-event binding.
- Temporary one-off timers, concurrent duplicate runs of one definition, or per-request duration overrides.
- Count-up/overtime mode or author-authored text that changes by runtime state.
- Persisting or replaying live timer state across a Stream Jams restart.
- Remote/LAN automation, credentials in URLs, or authority to manage configuration through the automation API.

## Decisions

### 1. Add a dedicated timer domain instead of reusing playback queues

`packages/core` will own timer definition schemas, runtime state, commands, projection ordering, and normalized overlay contracts. `apps/server` will provide typed repositories and a `TimerRuntimeCoordinator` with injected clock and scheduler dependencies. Timers will register as the `timers` overlay module, but will not masquerade as Alert or Screen Effect queue entries.

The alternative of modeling a timer as a long playback occurrence was rejected because pause/resume, one-run-per-definition identity, definition editing, and completion holding would distort queue semantics. Client-only timers were rejected because browser and desktop surfaces could drift or reset independently.

### 2. Separate durable definitions from ephemeral run snapshots

A durable definition owns a stable opaque ID, display label, positive duration, optional image/GIF icon asset ID, optional start/end audio asset IDs, Browser Source audio selection, named device-route IDs, and audit timestamps. Definitions and module presentation configuration persist in SQLite and portable backups.

The coordinator holds runtime state only in memory. An idle definition has no active record. A running run contains a unique generation, immutable definition snapshot, start epoch, and end epoch. A paused run contains its generation, immutable snapshot, and frozen remaining milliseconds. A completed run contains zero remaining time and a three-second expiry. Process startup always begins with no active runs.

Editing a definition never mutates its active snapshot. Deletion is rejected while that definition is running, paused, or in its completed hold.

### 3. Make commands deterministic and retry-safe

The lifecycle is `idle -> running <-> paused -> completed -> idle`, with stop returning any active state directly to idle.

- Start from idle creates a run and dispatches the start cue. Start from running or paused is a successful no-op.
- Pause freezes the server-calculated remainder. Resume establishes a new end epoch and does not replay the start cue.
- Stop hides immediately, cancels scheduled completion, emits no end cue, and is idempotent.
- Restart always replaces the current/idle generation with a full-duration run and dispatches the start cue once.
- Natural zero dispatches the end cue once, exposes `00:00` for three seconds, then becomes idle.

Every transition compares generation identity so stale scheduler callbacks, overlay acknowledgements, or asynchronous audio work cannot mutate a replacement run.

### 4. Use absolute deadlines and transition broadcasts

Running snapshots carry start and end epochs. Browser and desktop clients render the remainder from `endEpochMs - Date.now()` and format values below one hour as `M:SS` and values of at least one hour as `H:MM:SS`. Paused snapshots carry a frozen remainder and do not tick. The server schedules authoritative completion and broadcasts only lifecycle/configuration changes rather than a message every second.

Late/reconnecting clients receive the current module snapshot and calculate the same offset. Losing every overlay does not stop or extend the timer. Clock/scheduler adapters permit deterministic tests, and long delays are rescheduled in bounded chunks when the platform timer limit requires it.

### 5. Project one adaptive stack per target profile

Timer module configuration stores one bounded draggable/resizable stack region for each fixed target profile. Each region stores orientation (`vertical` or `horizontal`) and a schema-bounded visible maximum. The pure projection sorts completed-hold cards first at zero, then running cards by earliest end epoch, then paused cards by least frozen remaining duration, with stable definition ID as the final tie-break.

The renderer divides the region into equal-sized slots for up to the configured number of actual timer cards. Every card has consistent dimensions for that snapshot and vertically centered contents; a configured icon or legible default clock leads the card, its left-aligned label is one line with ellipsis overflow, and its tabular countdown is right-aligned. Extra timers remain active and are summarized by a small `+N more` badge that does not consume a timer slot; vertical stacks place that badge below their timer boxes. The responsive management preview uses the production renderer and shows the exact region, orientation, capacity, icons, truncation, and overflow behavior while warning when the chosen region/capacity makes content difficult to read.

Independent per-timer placement was rejected because concurrent definitions could overlap. Scaling without a floor was rejected because it can make urgent timing illegible, and allowing cards to escape the configured region was rejected because it can cover unrelated stream content.

### 6. Reuse normalized shared outputs and explicit audio routing

The coordinator exposes a normalized timer module snapshot through the existing overlay composition service and WebSocket invalidation path. Browser and desktop renderers consume timer-specific normalized card data; they never receive raw persistence rows or automation credentials. Shared surface visibility affects visuals only.

Each definition uses the existing Browser Source flag and named device routes for both start and end cues. Cue admission occurs once per run transition before visual profile expansion. Device identities are deduplicated through existing routing rules; each selected browser recipient receives its own normalized cue instruction. Cue preparation or playback failure is diagnosed independently and never blocks timer progression. Stop cancels any owned cue work; resume emits no cue.

### 7. Add a separate loopback automation security boundary

Management creates at most one active timer automation credential through existing session, CSRF, origin, and rate-limit protection. Creation or rotation returns the raw bearer once; SQLite stores only a protected verifier and metadata. Revocation invalidates it immediately. The token never appears in a URL, portable backup, log, diagnostic export, browser bundle, screenshot fixture, or overlay payload.

`/automation/timers` routes accept only a valid bearer from a loopback peer, reject browser-origin requests, apply dedicated rate limits, and grant only timer listing/state plus start, pause, resume, stop, and restart commands. They do not accept management sessions, overlay keys, authoring mutations, asset identifiers, output changes, or duration overrides. Management and overlay routes do not accept the automation token.

Reusing management sessions was rejected because expiry and CSRF make durable Stream Deck actions unreliable. Secret per-action URLs were rejected because URLs leak through configuration, history, and logs and make rotation fragmented.

### 8. Separate authoring from live operation without duplicating domain rules

The Timers management page lists every definition, edits its persistent fields, previews profile presentation, manages automation credential lifecycle, and exposes state-aware controls. Operator shows only running, paused, or completed-hold timers in the same urgency order with pause/resume, stop, and restart actions. Both clients call typed server APIs; React components do not calculate transitions, validate assets/routes, or own authoritative time.

Management changes use the existing session/CSRF/origin boundary. Operator retains accessible names, keyboard operation, stable focus, semantic status announcements, and actionable errors. Live overlays fail closed and transparent; missing icons omit only the icon, while cue failures remain management/operator diagnostics.

### 9. Extend existing portability and usage accounting

Configuration backup includes definitions, module/profile presentation, and non-secret audio selections. Referenced assets remain covered by the archive asset set. Active runs and automation credential/verifier state are excluded; after restore, timer automation remains disabled until a new credential is generated. Operational rollback restores the destination's prior credential state.

The asset library records icon/start/end usages and navigates to the owning timer. Deletion/replacement impact uses stable asset IDs and compatibility checks. Named-route deletion and rebinding impact includes timer definitions; active runs retain their admitted route binding snapshot and future runs use the saved replacement.

## Risks / Trade-offs

- **[Large capacity in a small region becomes illegible]** -> Render equal slots inside the region, ellipsize labels, provide an exact management preview and warning, and retain a bounded configuration schema.
- **[Wall-clock adjustment changes a running deadline]** -> Keep one server authority and generation checks; calculate remaining time from injected clock data and resynchronize every client on lifecycle/reconnect events.
- **[Automation credentials are copied into third-party configuration]** -> Scope the bearer to timers, bind it to loopback, show it only on creation/rotation, support immediate revocation, and redact it everywhere else.
- **[Multiple Browser Sources can make cues audible more than once in OBS]** -> Preserve existing explicit Browser Source routing semantics and document that each selected browser recipient is independent; deduplicate named physical-device routes.
- **[Cue assets fail while a challenge is active]** -> Keep time progression independent, settle the failed recipient, and surface actionable diagnostics without extending or cancelling the timer.
- **[Timers complicate the existing queue-oriented Operator model]** -> Render a separate active-timers section backed by timer-specific commands instead of forcing timers into queue owner contracts.

## Migration Plan

1. Add backward-compatible SQLite tables for timer definitions and the timer automation credential verifier/metadata; register the Timers module with safe disabled/hidden shared-surface defaults.
2. Extend portable backup schemas and preflight before exposing authoring so new rows cannot be silently omitted.
3. Add core contracts, repositories, coordinator, management/automation routes, composition projection, and output rendering behind the registered module enablement boundary.
4. Add management and Operator surfaces, then browser/desktop/audio acceptance coverage.
5. On rollback, old binaries ignore the additive tables; no active runtime state requires migration. A user may revoke the automation credential before downgrade, and later re-upgrade preserves definitions unless the database is explicitly replaced.

## Open Questions

None. The approved design fixes lifecycle, sorting, placement, overflow, security, persistence, and verification behavior for the initial implementation.
