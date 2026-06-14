# Proposal: Serve Overlay Safe Assets

## Why

Overlay playback instructions can reference visual and audio assets, but the overlay client currently resolves them to `/assets/:assetId` while the server exposes `/assets/:assetId/file` only behind management authorization. Browser-source overlays need a scoped way to fetch media assets without receiving management API access.

## What Changes

- Add overlay-safe media asset URLs for image, GIF, video, and audio playback instructions.
- Keep management asset import/listing endpoints protected by management authorization.
- Authorize overlay media reads with the relevant overlay output/key scope rather than a management session.
- Update overlay client asset URL resolution and tests to match the server route.
- Add missing-file, unsupported-media, revoked-key, and redaction behavior for overlay asset reads.

## Capabilities

### New Capabilities

- `overlay-safe-assets`: Browser-source overlays can load media assets through scoped, non-management asset URLs.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: asset routes, overlay route/key helpers, overlay playback instructions or client route parsing, overlay React rendering, diagnostics redaction, asset tests, overlay tests, and runbook docs.
- Dependencies: implementation MUST wait until both `serve-local-web-app-shell` and `add-overlay-output-management` are merged and present in remote `main`.
