## Why

The architecture and simplicity audits identify twelve gaps that make contracts unsafe to substitute or require maintainers to understand duplicate paths. Repair them without broadening product scope or introducing inheritance frameworks.

## What Changes

- Require configured playback outputs to support safety controls and validate shared settings/diagnostic wire responses.
- Separate provider/timer persistence contracts from SQLite implementations and type server-private Music artwork capability.
- Move shared playback identity/ports to neutral ownership and narrow editor dependencies.
- Remove the unused Music publication path and helper APIs; share duration mapping and template rendering; group dialog-owned state.
- Internal adapter/client signatures change; public routes, database schema and product workflows remain compatible.

## Capabilities

### New Capabilities
- `architecture-maintenance-contracts`: Enforce typed substitution, explicit response validation and single implementation ownership for audited boundaries.

### Modified Capabilities
None. Existing product requirements are retained.

## Impact

Core contracts, server runtime/services, web typed clients/editors and desktop transport fixtures. No dependencies, schema migration, feature expansion or normal-profile changes.
