# Design: Add Overlay Output Management

## Context

The server already has overlay route-key verification and hashed key persistence, and the UI already has an overlay outputs panel. The missing layer is the management contract that turns those pieces into a user-facing browser-source URL workflow. This change should preserve the strict separation between management authorization and overlay route authorization.

## Goals / Non-Goals

**Goals:**

- Provide management APIs for output URL listing, route-key lifecycle, and connected overlay client status.
- Generate module-specific and unified live/test URLs from the configured local origin.
- Store only hashed route keys and redact route secrets in logs and diagnostics.
- Keep UI state honest: if no output exists, show a real empty state and available creation actions.
- Add route, service, UI, and browser-visible tests for the full lifecycle.

**Non-Goals:**

- Do not implement overlay media asset serving; that is handled by `serve-overlay-safe-assets`.
- Do not redesign module configuration.
- Do not add LAN, cloud, or public overlay URL support.
- Do not grant overlay keys access to management APIs.

## Dependency Gate

Implementation MUST NOT begin until `serve-local-web-app-shell` has landed in remote `main`. The first task must fetch `origin/main` and confirm the final `/manage`, module overlay, and unified overlay URL format.

## Assumptions

- Overlay outputs can be modeled from existing overlay access keys plus module definitions and output purpose (`live` or `test`).
- One output may have separate live and test keys, and key regeneration should invalidate only the selected purpose/output.
- Connected-client state is runtime-only and does not need SQLite persistence.

## Decisions

- Add explicit management route modules, likely under `/management/overlay-outputs` and `/management/overlay-clients`, instead of overloading overlay browser-source routes.
- Return plaintext route keys only once at creation/regeneration time; list endpoints return full URLs only for currently valid keys if the plaintext key is available by design, or return metadata plus a regenerate action if not.
- Prefer service-level URL generation over UI-side path assembly so future host/port changes are centralized and tested.
- Keep connected-client listing behind management auth and rate limiting.

## Initial Implementation Plan

1. Confirm the final app serving URL contract from remote `main`.
2. Define core/server DTOs for overlay outputs, key lifecycle actions, and connected clients.
3. Add management routes and service methods over the existing overlay access repository/gateway.
4. Update the management API and overlay outputs panel to use real lifecycle endpoints.
5. Add tests for service behavior, route authorization, UI copy/regenerate/revoke flows, and e2e behavior against the real endpoints.

## Risks / Trade-offs

- Existing hashed keys may not allow reconstructing prior plaintext URLs. Mitigation: require regeneration for old records or store an encrypted/recoverable display secret only if product explicitly requires it.
- URL generation can drift from overlay routes. Mitigation: centralize path builders and use them in routes/tests/UI.
- Revoking a key can interrupt a live OBS source. Mitigation: make revoke/regenerate explicit, scoped, and confirmed in UI.

## Open Questions

1. Should list endpoints return full copyable URLs for existing keys, or should full plaintext URLs only be shown immediately after create/regenerate?
2. Should every module get default live/test outputs automatically, or should users explicitly create outputs?
3. What connected-client fields are required in the UI: route type, module ID, purpose, connected time, remote address, user agent, or last ping?
