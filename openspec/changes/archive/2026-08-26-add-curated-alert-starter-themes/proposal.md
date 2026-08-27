## Why

Creating an alert currently begins from a generic document, making common first-run alert styling slower and less approachable. Three bounded, local starter themes provide a polished starting point while keeping the resulting document fully editable and safe within the existing alert-authoring model.

## What Changes

- Add the universal, bundled starter-theme catalog: Clean Signal (the default), Bold Pop, and Neon Terminal.
- Materialize the selected theme into ordinary validated alert documents for every canonical event type and both fixed target profiles.
- Add event-scoped theme selection to alert creation, defaulting omitted callers to Clean Signal.
- Allow an operator to explicitly apply a starter theme to an existing editor draft, preserving alert behavior and nonvisual configuration while resetting visual composition and review state.
- Keep themes asset-free and bounded to text and solid-fill shapes; no marketplace, download, persistent theme linkage, or arbitrary presentation code is introduced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alert-configuration-management`: Alert creation and focused editing gain deterministic, editable starter-theme materialization and explicit re-theming behavior.

## Impact

- Affected areas: core alert-editor contracts and document materialization, management alert create and editor flows, and their API/UI/acceptance coverage.
- No new dependencies, assets, migrations, external fonts, or persistent storage linkage are required.
