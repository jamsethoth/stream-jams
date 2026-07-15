# Penpot Current State

This document records the repo-aligned Penpot baseline for Stream Jams.
The repo remains the source of truth for product behavior; Penpot is the visual baseline for review and redesign work.

## Capture Status

- Screenshot manifest created: 2026-06-21T22:31:29-04:00
- Penpot inventory refreshed: 2026-06-22T15:48:36.712Z
- Penpot version observed: 2.16.1
- MCP mode: local plugin and MCP server
- Plugin manifest URL: `http://localhost:4400/manifest.json`
- MCP server URL: `http://localhost:4401/mcp`
- Live inventory status: connected and read successfully
- Selection count during inventory: 0
- Management coverage: 30 of 30 required states captured
- Overlay coverage: 4 of 4 required states captured
- Orphan cleanup status: only intentional baseline/reference boards remain outside the required captured-state lists.

## Source Anchors

- `docs/product-plan.md`
- `apps/web/src/App.css`
- `apps/web/src/management/ManagementApp.tsx`
- `apps/web/src/management/navigation/ManagementNavigation.tsx`
- `apps/web/src/overlay/OverlayApp.tsx`
- `apps/web/src/overlay/components/OverlaySurface.tsx`

## Penpot Pages

- `00 Repo Baseline` (`511bd401-aa1d-80ff-8008-351e03897bb2`): product scope, source anchors, and repo-state notes.
- `01 Management UI - Current` (`31f6bc78-998e-805c-8008-35231db228b2`): current React/Vite management UI states.
- `02 Overlay - Current` (`31f6bc78-998e-805c-8008-35231f1a4256`): current browser-source overlay states.
- `03 Tokens & Components` (`31f6bc78-998e-805c-8008-3523213300c7`): extracted current visual primitives and reusable UI pieces.
- `10 Redesign Concepts` (`31f6bc78-998e-805c-8008-352322e6e926`): future approved redesign concepts only.

## Reference Boards

- `Repo Baseline - Current State`: 1440 x 1080, 31 children.
- `Management UI - Current Baseline`: 1440 x 1180, 109 children.
- `Overlay Surface - Current Baseline`: 1920 x 1080, 152 children.
- `Tokens & Components - Current CSS`: 1440 x 1240, 80 children.
- `Redesign Concepts - Reserved`: 1440 x 900, 16 children.

## Current Management UI Coverage

Desktop tab-state boards on `01 Management UI - Current`:

- `Management UI - Dashboard selected`: 1440 x 1000.
- `Management UI - Twitch selected`: 1440 x 1000.
- `Management UI - Diagnostics selected`: 1440 x 1000.
- `Management UI - Modules selected`: 1440 x 1000.
- `Management UI - Overlays selected`: 1440 x 1000.
- `Management UI - Playback selected`: 1440 x 1000.
- `Management UI - TTS selected`: 1440 x 1000.
- `Management UI - Settings selected`: 1440 x 1000.
- `Management UI - Alerts selected`: 1440 x 1104.
- `Management UI - Assets selected`: 1440 x 1000.

Mobile tab-state boards on `01 Management UI - Current`:

- `Management UI - Mobile Dashboard selected`: 390 x 900.
- `Management UI - Mobile Twitch selected`: 390 x 900.
- `Management UI - Mobile Diagnostics selected`: 390 x 1006.
- `Management UI - Mobile Modules selected`: 390 x 900.
- `Management UI - Mobile Overlays selected`: 467 x 977.
- `Management UI - Mobile Playback selected`: 390 x 900.
- `Management UI - Mobile TTS selected`: 390 x 1087.
- `Management UI - Mobile Settings selected`: 390 x 900.
- `Management UI - Mobile Alerts selected`: 390 x 1352.
- `Management UI - Mobile Assets selected`: 390 x 900.

Seeded and action-state boards on `01 Management UI - Current`:

- `Management UI - Seeded Dashboard`: 1440 x 1000.
- `Management UI - Seeded Alerts`: 1440 x 2517.
- `Management UI - Seeded Assets`: 1440 x 1000.
- `Management UI - Overlay URL Generated Redacted`: 1440 x 1000.
- `Management UI - TTS Test Result`: 1440 x 1075.
- `Management UI - Playback After Test Alert`: 1440 x 1000.
- `Management UI - Diagnostics After Test Alert`: 1440 x 1035.
- `Management UI - Twitch Connected`: 1440 x 1000.
- `Management UI - Alerts Test Alert Queued`: 1440 x 2576.
- `Management UI - Assets Import Error`: 1440 x 1000.

## Current Overlay Coverage

Boards on `02 Overlay - Current`:

- `Overlay - Empty Test Route`: 1920 x 1080.
- `Overlay - Empty Live Route`: 1920 x 1080.
- `Overlay - Live Alert`: 1920 x 1080.
- `Overlay - Invalid Route Error`: 1920 x 1080.

## Security Notes

- Overlay route keys are secrets.
- Screenshots, exports, manifests, issues, PRs, and chat messages must not include raw overlay route keys, bearer tokens, Twitch tokens, or copied secret values.
- The overlay URL state is represented only by `Management UI - Overlay URL Generated Redacted`.

## Known Gaps

- PNG/SVG board exports are not committed yet.
- Penpot remains the review baseline only; repo code and docs remain the product source of truth.

## Refresh Checklist

1. Start local Penpot MCP.
2. Open the Penpot project and reconnect the MCP plugin.
3. Run read-only inventory.
4. Update `docs/design/penpot-current-state.json` with page IDs, board IDs, dimensions, child counts, and source export file names.
5. Export board PNGs to `docs/design/penpot-exports/current/` only when repo-reviewable visual snapshots are needed.
