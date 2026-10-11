# Design: Event Source Maintenance

## Which triggers depend on a source

A trigger loses its source only when no remaining registration can deliver it:

| Trigger | Delivered by |
| --- | --- |
| Selector with `sources: ["twitch"]` | a Twitch registration |
| Selector with `sources: ["streamerbot"]`, any `external` match, Videos Streamer.bot intake | a Streamer.bot registration |
| Selector with `sources: "any"` (canonical or Twitch reward), alert rules by event type | any event source |

Deleting a source suspends only triggers whose row above has no other registration left. Deleting one of two Streamer.bot registrations suspends nothing.

## Suspension marker

Each unit that owns a trigger gets a persisted `sourceSuspension` (`{ reason: "source-removed", since }`), stored with the trigger so backups carry it:

- Alert rules: column on `alert_rules` (rules already have `enabled`; suspension is separate so re-enabling restores the user's own setting).
- Screen Effect bindings and timer event rules: field in their selector document JSON. An effect with another working binding keeps running.
- Videos: on each reward mapping and on the Streamer.bot intake setting.

Matching skips suspended triggers. The marker is cleared only by the user (re-enable, or editing the trigger).

## Edit

`PUT /management/providers/:providerId` takes the same setup input as registration minus `kind`. The service validates, writes the new secret under a new ref, saves the registration, then deletes the old secret; on failure the new secret is deleted and the registration is unchanged (same pattern as `replaceMusicCredential`). An active source triggers `onEventSourceChanged` to reconnect. Twitch edits are name-only; changing account stays "Reconnect Twitch".

## Delete

`GET /management/providers/:providerId/removal-impact` lists the triggers that would be suspended. `DELETE /management/providers/:providerId` runs deactivate, suspension and row delete in one SQLite transaction, then deletes the secret and stops the runtime client. Deleting the Twitch source does not sign out the Twitch account.

## Replace

The setup dialog opens in replace mode for the source's kind. After a passing validation it shows the replace impact (`GET .../replace-impact` with the candidate's broadcaster for Twitch). Confirming calls `POST /management/providers/:providerId/replace` with the setup input: register, copy Streamer.bot subscriptions and forwarding, activate if the old one was active, delete the old one, in one transaction, then secret cleanup. Triggers are not touched.

## Reward check

`GET /twitch/custom-rewards` already returns the connected channel's rewards. A shared core function marks a saved reward unavailable when its broadcaster differs from the connected account or its ID is missing from that list. The alert picker already shows missing selected IDs as "Unavailable reward"; Screen Effects, timers and Videos adopt the same picker. Videos mappings gain `broadcasterId` (migration fills it from the connected account when one exists; otherwise it is set on next save).
