## Why

The rebuilt management UI still presents several advanced Settings workflows as one long page, exposes technical identifiers and unexplained speech units, and reports setup completion without separately identifying enabled alert configuration that needs attention. These issues were confirmed in the live audit and require an honest, accessible follow-up before the integrated UX work is complete.

## What Changes

- Put advanced server, storage, audio-output, and overlay-surface settings behind native disclosures while keeping important state, errors, and save actions discoverable.
- Keep restore confirmation and regeneration controls hidden until backup preflight succeeds, and open the restore disclosure for a `#backup-restore` deep link.
- Align the desktop tray checkbox with its label at desktop and narrow widths.
- Present readable event, module, and reward names while preserving stored identifiers and typed payloads.
- Add explicit units and explanatory guidance to Browser Speech volume and rate controls without changing their numeric values or validation.
- Add a narrow typed Home summary that separates setup completion from enabled alert configuration attention and links affected alerts to their editors.
- Verify the production components in a served app backed by disposable runtime storage and isolated secrets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `management-ui-ux`: Settings uses progressive disclosure and Home reports alert configuration attention separately from setup completion.
- `configuration-backup-restore`: Restore controls remain gated by a valid preflight and restore deep links reveal the relevant workflow.
- `windows-desktop-runtime`: The close-to-tray choice has an explicit, aligned checkbox label.
- `asset-library-management`: Asset event types use readable labels without changing filter values.
- `overlay-output-management`: Overlay and audio-output settings expose readable module names inside summarized disclosures.
- `alert-configuration-management`: Event and reward conditions use readable catalog-backed summaries and Home derives attention from enabled default and variation inventory entries.
- `alert-tts-configuration`: Browser Speech numeric controls expose unchanged values with explicit units and guidance.

## Impact

The change affects existing management contracts and server summary composition, React management pages, their CSS, tests, stories, Playwright coverage, and verification documentation. It adds no dependency, persistence migration, matching change, queue behavior, provider behavior, output routing change, or new live-delivery claim.
