## Why

Streamers display goals, session counts, latest-supporter labels, and custom challenge information using dedicated widgets, bot variables, text files, or coded browser overlays. Stream Jams should make these behaviors easy to create visually, with persistent shared data supplied by local API calls or received events and rendered on user-designed canvases.

## What Changes

- Add a disabled-by-default Data Overlays module with multiple saved freeform canvases, text, images, solid shapes, progress bars, layer ordering, positioning, styling, and keyboard-accessible editing.
- Add canvas-independent named number, text, and money values, plus goals referencing values. Multiple elements and canvases can share a value; canvas deletion never deletes data.
- Persist data across restarts, default to manual resets, and expose deliberate set/add/subtract/reset controls. Support fixed targets and saved-baseline progress as proposed goal modes.
- Add visual rules that map normalized provider events or explicitly configured custom event schemas to typed updates. Support constants, selected event fields, bounded filters, and fixed multipliers without executable expressions.
- Add direct Twitch follower-total and active Creator Goals data sources using initial API snapshots, goal lifecycle events, bounded reconciliation, and capability-specific authorization readiness.
- Extend proof-bound local automation grants with explicit data-read, data-write, and custom-event-submit consent. Provide guarded HTTP updates and an authenticated WebSocket input using the same update/event contracts.
- Add editable whole-canvas templates and insertable element groups, with explicit value mapping and isolated sample previews. Templates instantiate copies rather than modifying live canvases later.
- Deliver server-authoritative snapshots and ordered output updates, durable bounded duplicate receipts, recovery diagnostics, and reference-safe backup/restore.
- Keep donation-provider adapters under BL-020; generic typed money updates/custom events work without introducing payment processing. Automatic reset scheduling, arbitrary remote WebSocket subscriptions, custom code, and general-purpose design-tool composition remain deferred.

## Capabilities

### New Capabilities
- `shared-overlay-values`: Persistent typed values, goals, lifecycle, manual correction, reference integrity, and source freshness.
- `overlay-value-inputs`: Visual event rules, custom event schemas, guarded direct updates, WebSocket ingress, and transactional duplicate protection.
- `data-overlay-canvases`: Multiple bounded freeform layouts, value bindings, visual editing, authorized browser/unified/desktop output, and isolated previews.
- `data-overlay-templates`: Bundled canvas/group starters and saved user templates with independent copies and explicit data mapping.
- `twitch-overlay-data`: Authoritative follower totals and active Twitch goal state, source lifecycle, and scope/readiness handling.

### Modified Capabilities
- `scoped-automation`: Add explicit consent and discovery for local data/event inputs without extending existing grants or legacy credentials.
- `configuration-backup-restore`: Include data definitions/state, rules, canvases, and templates while invalidating external-input authority and preserving reference integrity.

## Impact

Core owns schemas, typed formatting, goal projection, matching, and deterministic mutations. Server owns typed SQLite repositories/migrations, atomic receipts, event fan-out, automation ingress, snapshots, maintenance guards, and diagnostics. Web owns Data/Canvas authoring, template selection, preview, and overlay rendering; desktop integrates the existing private shared surface rather than adding a new window or scheduler. Existing alert/timer event behavior remains authoritative and unchanged.

Frontend work follows `docs/ai/frontend-agent-guide.md` and the existing UX/design-token rules. Implementation includes focused domain/API tests, Storybook states, disposable-service Playwright acceptance, and bounded OBS/desktop acceptance. No new dependency is assumed; evaluate editor needs before choosing a library. Track this outcome as BL-055. This proposal does not authorize implementation or publishing.
