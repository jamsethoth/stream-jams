## Why
The separate Stream Deck plugin needs scoped local controls without management credentials. Existing timer automation lacks state-aware gestures, adjustments, bulk controls and operational queue access.
## What Changes
- Versioned automation discovery/state and guarded timer/queue commands.
- Proof-bound explicit pairing, per-installation scoped grants, revocation and export exclusion.
- Active reset uses latest saved duration silently, preserving run presentation and state.
- Server bulk timer pause/resume and queue pause/skip/clear/mute.
- **BREAKING** Replace legacy shared mute with independent Alerts/Effects mute; All sets both; timer cues independent. User explicitly waived legacy mute compatibility.
## Capabilities
### New Capabilities
- `scoped-automation`: Pairing, authorization, state and command contract for local integrations.
### Modified Capabilities
- `alert-playback-operator-controls`: Independent Alerts/Effects mute and truthful All control; timer cues independent.
## Impact
Core timer/playback contracts; Fastify routes, SQLite grants, runtime composition; browser/desktop audio; management approval and tray/dashboard controls. No new third-party dependency planned. Separate plugin repository remains unchanged.
