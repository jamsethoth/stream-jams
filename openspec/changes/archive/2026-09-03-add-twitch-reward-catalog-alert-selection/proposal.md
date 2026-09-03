## Why

Channel-point redemption alerts currently require operators to type a Twitch reward ID manually, even though the linked Twitch account can provide its custom reward catalog. This makes configuration error-prone and prevents an operator from conveniently using one shared alert for several real rewards.

## What Changes

- Add a management-only Twitch reward catalog endpoint that lists the linked broadcaster's custom channel-point rewards without exposing the Twitch access token to the browser.
- Add a reward picker to channel-point redemption alert authoring so operators select rewards by current Twitch metadata while saved matching continues to use stable reward IDs.
- Add a `oneOf` alert condition operator for matching `channelPointReward` against a non-empty set of unique reward IDs, enabling one shared alert to cover several selected rewards.
- Distinguish a snapshot selection of all currently listed rewards from an explicit catch-all option that also covers future rewards.
- Preserve saved reward IDs when Twitch is unavailable or a reward is deleted, disabled, paused, out of stock, or belongs to a previously linked account.
- Warn when a shared selection can overlap other active redemption alerts, while preserving the existing behavior that every matching active alert may play.
- Keep Twitch EventSub subscriptions, normalized redemption events, and alert playback composition unchanged.

## Capabilities

### New Capabilities

- `twitch-reward-catalog`: Retrieve a sanitized catalog of custom channel-point rewards for the linked Twitch broadcaster, including refresh and actionable failure states.

### Modified Capabilities

- `alert-configuration-management`: Author and maintain shared channel-point redemption alerts that match one of multiple selected Twitch reward IDs, including catch-all, unresolved selections, overlap guidance, and representative test events.

## Impact

- Adds a protected management API route and Twitch API client operation in `apps/server` using the existing linked-account OAuth token and `channel:read:redemptions` scope.
- Extends alert condition contracts, validation, evaluation, and sample-event generation in `packages/core`; existing `equals` conditions remain valid and unchanged.
- Updates the alert creation and editor workflows in `apps/web`, with proportional Storybook and browser-visible workflow coverage.
- Expands exported alert configuration JSON through the existing condition-value representation; no SQLite migration or new dependency is expected.
- Does not manage Twitch rewards, fetch redemption history, persist a reward catalog, subscribe to reward lifecycle events, or include automatic Twitch rewards or Power-Ups.
