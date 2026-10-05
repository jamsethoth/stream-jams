## Why

Windows desktop validation intermittently waits for a renderer dialog after its own synthetic crash event invalidates that renderer's quit guard. Cleanup then masks the original failure and leaves Playwright waiting four minutes for worker teardown.

## What Changes

- Isolate healthy-renderer Cancel/Discard validation from renderer-loss diagnostic validation.
- Synchronize quit requests with the real renderer guard registration rather than incidental React timing.
- Preserve primary failures alongside cleanup failures and retain phase evidence in uploaded test results.
- Correct malformed MP4 test-fixture media-header duration units and assert the full metadata duration.
- Keep native process exit and listener shutdown assertions, without adding retries or increasing deadlines.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `production-entrypoint-validation`: require isolated desktop lifecycle fault scenarios, explicit readiness, and retained primary/cleanup evidence.

## Impact

Desktop Playwright tests, test-only helpers, neutral MP4 fixture headers, and the metadata regression test. Production shutdown policy, UI, dependencies, packaging publication, and the manual-only desktop workflow remain unchanged. This addresses the CI test race, not the separately tracked BL-044 native shutdown investigation.
