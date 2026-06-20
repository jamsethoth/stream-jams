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
