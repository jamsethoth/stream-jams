# Overlay Error Presentation

## Production Default

Live overlay errors should fail closed: render nothing on the broadcast surface and report the actionable problem in the management UI or logs.

Use visible overlay diagnostics only in Storybook, local development, or explicit test/debug routes.

## Options

| Option | What viewers see live | What operators see | Use when | Risk |
| --- | --- | --- | --- | --- |
| Transparent fail-closed | Nothing. The stream continues without a broken alert. | A failure should appear in `/manage` diagnostics, queue state, or logs. | Production overlay failure default. | Failure is easy to miss without operator diagnostics. |
| Operator-only diagnostics | Nothing on the overlay. | Actionable status such as missing asset, disconnected overlay, queue error, or provider failure. | Production diagnostics paired with fail-closed rendering. | Only helps if the operator can see `/manage` or logs. |
| Dev/test visible diagnostics | Should not appear on live routes. Storybook or local routes can show a small diagnostic marker. | Developer sees the failed state directly. | Storybook, screenshots, and local debugging. | Must be gated so it cannot leak into live overlay URLs. |
| Live visible diagnostics | Viewers see a fallback message such as `Alert unavailable`. | Same visible failure appears in broadcast output. | Setup or rehearsal only. | Looks unprofessional and may cover stream content or expose internals. |

## Rule

For production: transparent fail-closed overlay plus operator-only diagnostics.

For development: visible diagnostics are allowed only when the route, story, or mode is clearly not live.

## Failure Evidence

Transparent does not mean silent. Before removing failed production content, the
overlay reports one bounded `OverlayPlaybackFailure` through its authenticated
transport. The report carries the stable failure reference, the exact playback
stage (`source-load`, `metadata`, `seek`, `decode`, `play`, or `stall`), a safe summary,
and the serialized cause. The server derives client and target-profile identity
from the authorized connection; it does not trust route identity in the report.

The production overlay DOM must contain no stack, serialized exception,
reference, or diagnostic copy. Operators receive safe recovery copy and the
stable reference in management UI; exception structure is available only in Raw
logs and debug exports. A retry or replacement instruction is a new playback
attempt and must not allow a stale failure callback to remove the new content.

The private desktop overlay follows the same rule. Its renderer returns a
validated failure envelope through IPC, and the desktop host records the
failure before the native window fails transparent.

See [Error provenance](../engineering/error-provenance.md) for ownership,
redaction, bounds, and exception-transport rules.
