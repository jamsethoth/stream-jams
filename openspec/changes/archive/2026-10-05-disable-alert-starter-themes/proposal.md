## Why

Curated starter themes currently create visual content and expose re-theming controls when operators expect a new alert to begin as a blank canvas. Disabling those entry points makes alert creation predictable while preserving existing saved designs and the dormant theme implementation for possible restoration.

## What Changes

- Create new alerts and first-run starter alerts disabled, needing review, and with zero text, shape, image, video, audio, or TTS layers in both target-profile layouts.
- Remove starter-theme selection from Add alert and remove starter-theme application from the focused alert editor.
- Reset default alerts to the same empty document contract.
- Preserve source designs when creating variations or duplicates.
- Leave existing saved alerts unchanged and retain the internal theme catalog/materialization code without active management-UI entry points.
- Update server, component, Storybook, and Playwright coverage for the empty-alert workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alert-configuration-management`: Replace required starter-theme creation, chooser, and editor re-theming behavior with empty new/default alert creation and reset behavior while retaining copy semantics and existing saved alerts.

## Impact

- Alert creation/reset defaults in core/server composition and management services.
- Add-alert and focused-editor React workflows, stories, and browser tests.
- Canonical alert configuration requirements and their focused validation coverage.
- No database migration, API dependency, or existing saved-document rewrite.
