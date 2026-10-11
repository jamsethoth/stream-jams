# Proposal: Edit, Replace And Delete Event Sources

## Why

On 2026-10-11 the maintainer found that a registered event source cannot be edited or deleted. On `main` the Event Sources table offers only Activate/Deactivate (`apps/web/src/management/providers/ProviderPage.tsx`), and the provider API has no update or delete route (`apps/server/src/http/routes/management-providers.ts`). A mistyped Streamer.bot host, port or password means registering a second source, and unused sources and their stored secrets stay forever.

Module rules and triggers match a source *kind* (`twitch`, `streamerbot`) and an event identity, not a registration ID (`packages/core/src/event-bus/selector.ts`). Editing a source in place therefore breaks nothing. Only two things genuinely strand a trigger: no registration left that can deliver it, or a Twitch reward ID that belongs to a channel that is no longer connected (or a reward deleted and recreated on Twitch).

The maintainer chose (2026-10-11) edit and delete at the source level, a Replace flow at the source level, and a per-module fix for Twitch rewards that no longer match.

## What Changes

- **Edit**: rename any event source; change Streamer.bot protocol, host, port, endpoint, password and the unauthenticated-local switch. Changes are validated exactly like registration before anything is saved; the stored secret is replaced only after a passing validation. An active source reconnects with the new settings.
- **Delete**: shows the impact first (which alert rules, Screen Effect triggers, timer rules and Videos intake would lose their only source), then in one transaction removes the registration and suspends those triggers with the reason "Source removed". The stored secret is deleted after the transaction commits.
- **Restore suspended triggers**: when a source that can deliver a suspended trigger is registered again, management lists the suspended triggers with a one-click re-enable. Nothing re-enables silently.
- **Replace**: from a registered source, set up a new source of the same kind, see what will keep matching and what will not (for Twitch, rewards that belong to another channel), then swap in one step: the new source takes the old one's Streamer.bot subscriptions and forwarding switch, becomes active if the old one was, and the old one is deleted. Triggers stay enabled.
- **Reward fix**: a saved Twitch reward is flagged "Reward unavailable" when its channel is not the connected one or its ID is no longer in the reward catalog. Alert rules, Screen Effects, timer rules and Videos channel-point mappings show the flag with the existing reward picker so the user can pick the replacement; saving clears the flag. Videos reward mappings start storing the broadcaster ID so they can be checked.

## Out Of Scope

- Bulk remapping rewards by title during Replace (offered 2026-10-11, not chosen).
- Signing out of the Twitch account. Deleting the Twitch event source keeps the account connection, which Videos metadata lookup and the reward catalog also use.
- Editing TTS or Music sources (Music already has re-pairing).

## Impact

- `apps/server/src/http/routes/management-providers.ts`, `provider-management-service.ts`, `sqlite-provider-registration-repository.ts`, event-source runtime coordinator.
- Alert, Screen Effect, timer and Videos repositories and management services (suspension marker and reward check).
- `apps/web/src/management/providers/ProviderPage.tsx`, Screen Effect, timer and Videos editors, `TwitchRewardPicker.tsx`; stories and Playwright coverage.
- New migration for the suspension marker and Videos mapping broadcaster ID; backup/restore keeps both.
- New `event-source-maintenance` capability.
