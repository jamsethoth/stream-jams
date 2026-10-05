## Why

Control DX12 in borderless mode becomes a topmost window when focused and overtakes the desktop overlay. A live test produced audio with no visible video; native observations placed Control above the still-visible, still-topmost overlay. Setting topmost only at window creation does not satisfy the supported borderless workflow.

## What Changes

- Restore the ready desktop overlay above competing ordinary desktop windows without activating it, including playback start and later ordering changes.
- Bound recovery work to the live, visible window and preserve fail-closed display and renderer lifecycle behavior.
- Add automated native competition, foreground preservation, click-through, visual marker, and teardown tests, plus a prepared real-game observation runner that triggers playback for the user.
- Record measured recovery latency and distinguish desktop composition evidence from physical monitor confirmation.
- Keep exclusive fullscreen compatibility as the separate BL-049 stretch investigation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shared-overlay-surfaces`: automatic non-activating ordering recovery and automated regression evidence for borderless applications.

## Impact

Desktop native window and private playback dispatch; focused Vitest tests; isolated Windows Playwright/native diagnostics; test and verification documentation. No server API, persistent user setting, web UI, or dependency change is planned. Existing production installation and user data are not replaced by unattended validation.
