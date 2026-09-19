## Why

Alerts and Screen Effect variants currently use fixed playback durations, so operators must manually copy media lengths and can become out of sync after asset replacement. Local audio sources also lack fade controls.

## What Changes

- Persist authoritative duration metadata for accepted timed media during import, replacement, or bounded management repair.
- Let Alerts and Screen Effect variants either match their longest eligible media or use a custom duration.
- Carry independent fade-in and fade-out durations for local audio sources through preview, browser, and explicit-device playback.
- Preserve existing objects as Custom with fades disabled while new objects default to Match longest media.

This change depends on the unified Screen Effect variant/editor contract in PR #117 and is delivered as a separate stacked slice. The approved design is `docs/superpowers/specs/2026-09-18-media-synced-duration-and-audio-fades-design.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-library-management`: Persist and repair timed-media duration metadata.
- `alert-configuration-management`: Author and preview automatic or custom Alert timing and local-media fades.
- `alert-audio-routing`: Carry and apply normalized per-source audio envelopes.
- `screen-effects`: Author, resolve, and preview per-variant timing and fades.
- `routed-video-audio`: Apply the same soundtrack envelope across browser and device routes.

## Impact

Core contracts and pure playback logic, SQLite migration 024, server asset ingestion and runtime composition, Alert and Screen Effect coordinators, browser and desktop media playback, both management editors, backups, Storybook, and affected browser/desktop journeys. The server adds exact dependency `music-metadata@11.15.0`; live triggers perform no media parsing or filesystem reads.
