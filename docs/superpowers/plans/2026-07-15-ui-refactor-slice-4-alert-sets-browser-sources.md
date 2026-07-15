# UI Refactor Slice 4: Alert Sets And Browser Sources

Status: complete.

OpenSpec change: `refactor-management-ui-ux`.

## Scope

Replace the form-first Alerts surface with the selected alert-set workspace. Treat existing collections as the persisted set boundary while enforcing one active set, creating a starter `Default` set for empty installations, and keeping browser-source management inside Alerts.

## Backend Contract

- Map collections and their rules into alert-set overview/detail records with stable IDs, fixed landscape/vertical profiles, validation, starter-review state, and inventory rows.
- Create a disabled, needs-review starter set on first run and keep set activation separate from saved configuration.
- Enforce one active set transactionally. Block invalid activation and require confirmation for warnings.
- Support create, rename, duplicate, activate, mark-reviewed, enable-alert, and guarded delete commands through authorized management routes.
- Scope Alerts route keys independently by target profile while preserving existing profile-less overlay URLs.
- Derive browser-source connection state from current and recent overlay clients and reuse existing key create/regenerate routes.

## UI Contract

- `Modules > Alerts` opens a selected-set overview with set switcher, active/inactive banner, validation summary, set list, alert inventory, and browser sources.
- Starter rows expose Preview, Edit, and Enable actions. Marking starter review complete is set-level and does not enable alerts.
- Inactive valid sets can be activated; blockers disable activation; warnings require an impact confirmation.
- Landscape and vertical browser-source rows show live/test state, last connection, masked URL, temporary reveal, copy feedback, and per-profile key actions.
- Regenerating a connected or recently connected route key requires typed confirmation and explains the OBS/browser-source update impact.

## Verification

1. Add failing contract, repository, service, route, output-scope, API-client, and screen tests.
2. Add alert-set metadata and profile-scoped overlay-key migrations.
3. Implement alert-set composition/commands and wire them into the existing management service and route-key APIs.
4. Implement the Alerts workspace and required Storybook states.
5. Run focused tests, lint, typecheck, full tests, build, Storybook build/tests, Playwright, strict OpenSpec validation, and responsive visual checks.

## Completion Evidence

- Alert-set and overlay-profile contract, repository, service, route, API-client, component, Storybook, and browser tests are implemented.
- The full unit/integration suite passes with 109 files and 487 tests.
- The full Playwright suite passes with 12 browser workflows.
- Storybook interaction/accessibility tests pass with 12 suites and 38 tests; the production Storybook build also passes.
- Responsive visual checks pass at 1440x1000 and 390x844 with no page-level overflow, clipped controls, or browser console errors.
