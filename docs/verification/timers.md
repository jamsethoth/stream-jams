# Timers verification

Implementation checkpoint: September 29, 2026. This is local implementation and automated acceptance evidence for `add-timer-overlay-module`; it is not a published release or physical Stream Deck certification.

## Verified behavior

- Reusable Timer definitions persist with stable IDs, duration, optional icon/start/end assets, Browser Source output, and explicit named-device routes. Active running, paused, and completed generations remain memory-only and are empty after runtime restart.
- One active generation is admitted per definition. Start is retry-safe; pause, resume, stop, and restart preserve immutable admitted snapshots, and completion remains visible at zero for three seconds.
- Completed timers sort first, running timers sort by soonest completion, and paused timers sort below running timers by remaining duration. Landscape and Vertical profiles independently support horizontal or vertical equal slots, bounded capacity, truncated labels, and a `+N more` badge.
- Browser module/unified output and the native desktop module render normalized Timer snapshots. Surface visibility hides visuals without changing timer state. Start/end cue admission uses explicit Browser Source and/or named-device destinations.
- The dedicated loopback HTTP bearer supports discovery plus start, pause, resume, stop, and restart. Rotation immediately invalidates the prior bearer; revocation disables it; browser-origin, invalid-bearer, malformed, and authoring-override requests are rejected.
- Portable configuration includes definitions, layouts, assets, and route references while excluding active generations and Timer automation verifier material. Restore starts Timers idle and requires a new automation credential.

## Exact acceptance fixtures

The served-browser management fixture used Timer ID `timer-paws`, icon `icon-paws`, start cue `audio-start`, end cue `audio-end`, and named route `speakers`. It saved Landscape as horizontal with capacity 4 and Vertical as vertical with capacity 2, reloaded the definition, edited its label, and exercised start, pause, resume, restart, and stop.

The browser overlay fixture used Landscape horizontal capacity 3 and verified completed/running/paused ordering, equal card widths, ellipsis, `+2 more`, late join, and WebSocket reconnect continuity.

The final packaged desktop profile is retained at `C:\Users\James\AppData\Local\Temp\stream-jams-desktop-timers-FGVe8m`. Its definitions were:

| Timer ID | Label | Duration | Cue routes |
| --- | --- | ---: | --- |
| `timer_a579d247-8f64-45f5-8f6e-65329689c64f` | Long mitts timer | 120,000 ms | None; visual-only native lifecycle fixture |
| `timer_5a762984-405d-46bb-aec9-bf8292ee3578` | Short reward timer | 1,000 ms | None; visual-only native lifecycle fixture |

That run verified two simultaneous native cards, pause/resume/restart, the three-second completion hold, desktop layer hide/show, and bounded Quit while the long timer remained active. The owned service completed shutdown about 16 ms after `service-stop-requested`; Electron reached `electron-quit` about 53 ms after that request. The final packaged `app.asar` SHA-256 was `a2dfa12ced800bbc72685c3b7d9e70912827d9b830da15aff58e68617b47f61d`.

## Automated gates

Fresh final results:

- `corepack pnpm lint`: passed, including error-provenance validation.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: 274 Vitest files / 2,324 tests passed, followed by 22 Node script tests passed.
- `corepack pnpm build`: passed; production route budgets passed.
- `corepack pnpm build-storybook`: passed.
- `corepack pnpm test:storybook:ci`: 26 suites / 254 tests passed in Chromium. Storybook emitted only its existing Story Store deprecation warning.
- `corepack pnpm test:e2e`: 58 browser Playwright tests passed, including Timer management, overlay, and generic HTTP automation.
- `corepack pnpm test:desktop`: 25 non-hardware packaged desktop tests passed, including the Timer run above plus native SQLite/keyring, audio transport, overlay renderer, recovery/lifecycle, shutdown, and silent WebM/MP4 coverage.
- `git diff --check`: passed.
- `openspec.cmd validate add-timer-overlay-module --strict`: passed.

## Failures found and corrected

- The first packaged Timer Quit exposed that runtime cleanup closed the shared desktop overlay transport before clearing the Timer module snapshot. Cleanup now unsubscribes Timer output changes, drains the serialized sync tail, clears the module, and only then closes shared output transports. A lifecycle-aware runtime regression proves the ordering.
- The desktop supervisor initially rejected the final `sync-module` clear after entering `stopping`. It now permits only `stop`, `sync-module`, and `close` overlay lifecycle commands during shutdown; ordinary overlay work remains rejected. A supervisor regression protects the boundary.
- The first full unit run had three stale fixtures: two exact registered-module lists omitted Timers, and a synthetic migration rewind left migration 028 applied. Those fixtures were corrected; the clean rerun passed all 2,324 tests.
- The first browser Playwright run was 57/58 because an exact asset-usage label omitted the new module prefix. The assertion now expects `Alerts / ...`; the clean rerun passed 58/58.
- The first complete desktop run was 24/25 because its worker-only fixture acknowledged audio lifecycle RPCs but ignored overlay lifecycle RPCs. The fixture now acknowledges configure/sync/close only and still rejects playback; the clean rerun passed 25/25.
- Two final packaging attempts received HTTP 500 from GitHub's Electron `SHASUMS256.txt` endpoint after the Electron ZIP cache hit. A traced retry succeeded when the endpoint recovered. No dependency, mirror, checksum policy, or product code was changed to bypass verification.

## Remaining manual acceptance

- No physical Stream Deck button/profile was configured or pressed. The generic-client test exercised the same loopback HTTP contract against a real built local runtime without writing bearer values to artifacts, but physical Stream Deck UI acceptance remains outstanding.
- Browser and native desktop Timer rendering were verified in separate real renderers, not observed side-by-side in one packaged run. Packaged named-device audio, mute, missing-output, renderer recovery, and Timer cue routing have combined automated coverage, but a single integrated packaged Timer cue matrix remains outstanding.
- No audible physical-device, OBS mixer, or live-stream output was used. The desktop suite used silent media and isolated disposable profiles.
