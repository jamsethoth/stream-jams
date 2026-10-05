# Design: Automatic Local Output Rebinding

## Matching contract

Core exposes a pure helper that compares endpoint labels with exact, case-sensitive equality and reports `none`, one value, or `ambiguous` with a count. Callers only reconcile a missing saved ID when consent is enabled, a nonblank trusted saved label exists, and the helper reports exactly one candidate. A currently available ID is never rematched.

## Audio routes

`AudioOutputRoute` gains `autoFollowDeviceName`, persisted as a checked SQLite boolean that defaults to false. Create and patch requests may submit consent, while the service continues to derive `deviceLabel` from current host enumeration. Unbinding clears the ID and label and disables consent.

`AudioOutputService` snapshots the route before asynchronous enumeration. Reconciliation re-reads the route inside the configuration mutation boundary and writes only when ID, label, and consent still equal the snapshot. A successful write affects later playback; the occurrence that triggered discovery retains its original route snapshot. Session status distinguishes disabled, no-match, ambiguous, rebound, and not-needed outcomes.

## Desktop surface

Persisted desktop configuration gains `displayLabel` and `autoFollowDisplayName`, both compatibility-defaulted for legacy JSON. The browser-facing update schema omits `displayLabel`; `SurfaceSettingsService` derives it from the current Electron display inventory. Enabling consent requires a current selected display with a trusted label. Clearing selection clears label and consent, while disabling the overlay preserves a valid binding.

Startup reconciliation follows the same snapshot, exact-match, compare-before-write, and durable-before-configure ordering as audio. Display disconnection still hides active content and never replays it.

## Startup and failures

Runtime composition asks both services to reconcile after an authoritative desktop host is available. Enumeration, persistence, or host-application failure is logged safely and leaves the saved binding authoritative and unavailable. Manual changes or deletion that complete while enumeration is pending win over stale reconciliation.

## Portability

Portable audio rows keep stable route identity and name but clear ID, label, and consent. Portable desktop JSON keeps non-binding settings but is disabled with ID and label null and consent false. Schema-26 restore explicitly supports compatible schemas 19 through 25 while retaining existing validation.

## Management and presentation

Audio and desktop forms expose separate native checkboxes participating in existing Save/Revert dirty state. Help text states that matching is exact, duplicate names remain unavailable, and no default is used. Successful automatic changes are session notices and do not expose opaque IDs.

The Live TTS checkbox reuses `alert-editor-inspector__check`, preserving its semantic behavior while constraining the native control to 16 by 16 pixels.

## Safety invariants

- Consent defaults off and is scoped to one binding.
- Labels are server-derived and cannot be supplied by browser clients.
- Only one exact current label match is accepted.
- Persistence precedes runtime use.
- Active work is neither retargeted nor replayed.
- No native dependency or alternative fallback path is added.
