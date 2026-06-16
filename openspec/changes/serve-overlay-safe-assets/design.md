# Design: Serve Overlay Safe Assets

## Context

Management users import assets and configure alert variants that reference asset IDs. At playback time, the browser-source overlay needs to load those files directly through the browser. The current management-only `/assets/:assetId/file` route cannot be used by OBS browser sources, and exposing it publicly would weaken the management/overlay authorization boundary.

## Goals / Non-Goals

**Goals:**

- Provide scoped overlay media URLs that load only files referenced by overlay playback instructions or allowed by the selected overlay output scope.
- Keep asset import/list/update operations management-only.
- Keep media URLs browser-compatible for `<img>`, `<video>`, and `<audio>` elements.
- Preserve MIME type correctness, cache headers appropriate for local files, and traversal-resistant file reads.
- Redact route keys and asset storage paths from logs and diagnostics.

**Non-Goals:**

- Do not add cloud asset storage.
- Do not implement media transcoding beyond existing validation.
- Do not redesign the asset manager UI except where needed for diagnostics.
- Do not add public LAN asset serving.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` and `add-overlay-output-management` have both landed in remote `main`. The final overlay output URL and route-key contract must be used for asset authorization and URL generation.

## Assumptions

- Overlay media reads should be authorized by overlay route key or a derived scoped token, not by management session tokens.
- Asset IDs are not secrets, but filesystem storage paths and overlay route keys are secrets or sensitive operational details.
- The overlay client can derive media URLs from its parsed overlay route context or receive resolved URLs in playback instructions.

## Decisions

- Prefer route-key-scoped media URLs over unauthenticated `/assets/:assetId` URLs. This keeps the overlay authorization model explicit and avoids making all imported media public to any local browser.
- Use the existing overlay route key directly for media reads rather than minting a second media token. The media routes are:
  - `/overlay/modules/:moduleId/:purpose/:overlayKey/assets/:assetId`
  - `/overlay/unified/:purpose/:overlayKey/assets/:assetId`
- Authorize media reads through the same overlay access verifier used by overlay shell/composition routes. A valid overlay key may read imported media by asset ID for its route scope; per-rule asset allowlists are deferred until output-specific asset manifests exist.
- Keep management asset download at its existing management route or explicitly separate it from overlay media reads.
- Centralize asset URL construction in one shared client/server contract so tests can catch path drift.
- Return `401` for invalid, revoked, or wrong-scope overlay keys before asset lookup. Return `404 OVERLAY_ASSET_NOT_FOUND` for missing records, missing files, and invalid stored paths so overlay responses do not reveal storage implementation details.
- Use `Cache-Control: no-store` for route-key-scoped media responses so long-lived OBS browser sources do not keep using media URLs after key revocation.

## Initial Implementation Plan

1. Confirm app shell and overlay output management contracts from remote `main`.
2. Define the overlay asset media route shape and authorization strategy.
3. Add server route support for overlay-safe asset reads using existing asset repository/store abstractions.
4. Update overlay client resolution and playback instruction tests.
5. Add diagnostics and tests for unauthorized, revoked, missing, and valid media reads.

## Risks / Trade-offs

- Embedding route keys in media URLs can leak through browser dev tools or logs. Mitigation: redact keys consistently and keep the threat model local-only for MVP.
- Authorizing every media read can add complexity to simple asset rendering. Mitigation: reuse existing overlay key verification and keep the route helper small.
- Long-lived OBS sources may cache revoked media URLs. Mitigation: use conservative cache headers for key-scoped URLs and test revocation behavior.

## Open Questions

None for this slice. Per-output asset manifests and range streaming can be added later if large-media playback or tighter asset scoping proves necessary.
