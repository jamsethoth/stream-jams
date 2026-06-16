# Proposal: Add Overlay Output Management

## Why

The MVP requires users to copy module-specific and unified browser-source URLs, but the current management UI calls endpoints that the server does not implement. Users need a real management workflow for creating, viewing, copying, regenerating, revoking, and monitoring overlay outputs without exposing management privileges to browser-source routes.

## What Changes

- Add management APIs for listing copyable overlay output URLs for module-specific and unified outputs.
- Add management APIs for creating, regenerating, and revoking live/test overlay route keys.
- Add management APIs for listing connected overlay clients.
- Connect the existing management UI overlay panel to real server data instead of optional mocked endpoints.
- Persist route-key metadata through the existing overlay access repository while storing route secrets only as protected verifiers plus encrypted-at-rest recoverable values.
- Add tests for URL generation, key lifecycle, client listing, and authorization separation.

## Capabilities

### New Capabilities

- `overlay-output-management`: Management users can administer browser-source overlay outputs and route keys.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: overlay access service/repository, secret-store usage for recoverable route secrets, overlay gateway client registry, management routes, web management API, overlay outputs panel, tests, and runbook docs.
- Dependencies: implementation MUST wait until both `serve-local-web-app-shell` and `replace-dev-secret-store` are merged and present in remote `main` so generated URLs follow the final local app serving contract and route keys can be encrypted at rest through the finalized local secret-store path.
