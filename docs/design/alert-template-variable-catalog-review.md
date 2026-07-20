# Alert Template Variable Catalog Review

## Review Status

Approved and implemented. The editor uses the event-specific catalogs below, all rendering paths share one template-context builder, and saved compatibility keys remain renderable without appearing in the picker.

## Catalog Rules

Approved rules:

1. Show only values useful for the selected event type.
2. Use user-facing names and stable aliases; do not expose normalized object structure such as `actor.displayName`.
3. Keep old keys working for saved alerts, but hide redundant or internal keys from new insertion choices.
4. Do not expose IDs, provider routing fields, arbitrary metadata, or raw collection objects unless a real message-authoring use exists.
5. Missing nullable values render as empty text. The picker description must say when a value can be unavailable.
6. Preview, test, and live playback must use the same context builder so a picker variable cannot work only in preview.

## Normalized Fields Shared By Every Event

| Normalized field | Type | Meaning | Picker recommendation |
| --- | --- | --- | --- |
| `id` | `string` | Internal event identifier | Hide |
| `providerId` | `"twitch"` | Normalized provider identifier | Hide |
| `sourcePlatform` | `"twitch"` | Source platform | Hide; event type already establishes context |
| `ingestProvider` | `"twitch" \| "streamerbot"` | Intake route used | Hide; useful for conditions and Diagnostics, not alert copy |
| `occurredAt` | ISO date-time string | Event occurrence time | Hide until formatted date/time variables exist |
| `type` | canonical event type | Event discriminator | Hide; editor already scopes the alert to one type |
| `actor.id` | `string \| null` | Internal platform actor ID | Hide |
| `actor.displayName` | `string` | Normalized actor display name | Hidden compatibility key; expose a relevant user-facing name alias instead |
| `message` | `string \| null` | Optional viewer message | Expose only for Resubscription and Cheer |
| `amount` | `number \| null` | Event-dependent primary quantity | Hide generic key when a clearer event alias exists |
| `metadata` | `Record<string, unknown>` | Sanitized transport and diagnostic metadata | Hide from picker; shape is not a stable authoring contract |

## Complete Event Input And Approved Picker

### Follow

Normalized event-specific input: `amount: null`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |

### Subscription

Normalized event-specific input: `amount: number` (currently always `1`), `tier: "1000" \| "2000" \| "3000" \| "prime"`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |
| Tier | `{tier}` | `tier` |

Do not show `Quantity`; normalized `amount` is currently fixed at `1` and adds no useful message information.

### Resubscription

Normalized event-specific input: `amount: number` (cumulative months), `tier`, `streakMonths: number | null`, plus optional common `message`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |
| Total months | `{totalMonths}` | `amount` |
| Current streak | `{streakMonths}` | `streakMonths` |
| Tier | `{tier}` | `tier` |
| Message | `{message}` | `message` |

Keep existing `{amount}`, `{tenure}`, and `{tenureMonths}` aliases hidden for compatibility if they have shipped in saved templates.

### Cheer

Normalized event-specific input: `amount: number` (Bits), plus optional common `message`. Anonymous cheers normalize `actor.displayName` to `Anonymous`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |
| Bits | `{cheerAmount}` | `amount` |
| Message | `{message}` | `message` |

### Raid

Normalized event-specific input: `amount: number` (viewer count).

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |
| Raid viewers | `{raidViewers}` | `amount` |

### Channel Point Redemption

Normalized event-specific input: `amount: null`, `rewardId: string`, `rewardTitle: string`, `userInput: string | null`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| User name | `{userName}` | `actor.displayName` |
| Reward title | `{rewardTitle}` | `rewardTitle` |
| User input | `{userInput}` | `userInput` |

Hide `rewardId`; it is useful for matching rules, not viewer-facing text.

### Gift Subscription

Normalized event-specific input: `amount: 1`, `tier`, `recipient: { id, displayName }`, `gifter: { id, displayName } | null`. The base actor is the recipient.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| Recipient name | `{recipientName}` | `recipient.displayName` |
| Gifter name | `{gifterName}` | `gifter.displayName`; empty when unavailable |
| Tier | `{tier}` | `tier` |

Do not show generic `User name` for this event because it obscures whether the value is the recipient or gifter. Keep `{userName}` and `{recipient.displayName}` hidden for compatibility.

### Community Gift

Normalized event-specific input: `amount: number` (gift count), `tier`, `cumulativeTotal: number | null`, `anonymous: boolean`. The base actor is the gifter or `Anonymous`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| Gifter name | `{gifterName}` | `actor.displayName` |
| Gift count | `{giftCount}` | `amount` |
| Tier | `{tier}` | `tier` |
| Cumulative gifts | `{cumulativeGifts}` | `cumulativeTotal`; empty when unavailable |

The `anonymous` boolean need not be inserted into messages because `Gifter name` already resolves to `Anonymous`.

### Hype Train Start, Progress, And End

All three phases normalize: `amount: number | null`, `trainId: string`, `level: number | null`, `progress: number | null`, `goal: number | null`, `total: number | null`, `startedAt: string | null`, `expiresAt: string | null`, `endedAt: string | null`, `cooldownEndsAt: string | null`.

Approved picker for all three phases:

| Label | Key | Source |
| --- | --- | --- |
| Level | `{level}` | `level` |
| Progress | `{progress}` | `progress` |
| Goal | `{goal}` | `goal` |
| Total | `{total}` | `total` |

Do not show `User name`; normalized actor is the broadcaster, not the contributing viewer. Hide `trainId` and raw timestamps. Phase-specific time labels can be added later with locale-aware formatting.

### Poll Start, Progress, And End

All three phases normalize: `amount: number` (total votes), `pollId: string`, `title: string`, `choices: readonly { id, title, totalVotes }[]`, `totalVotes: number`, `startedAt: string`, `endsAt: string`, `status: string`.

Approved picker for all three phases:

| Label | Key | Source |
| --- | --- | --- |
| Poll title | `{title}` | `title` |
| Total votes | `{totalVotes}` | `totalVotes` |
| Status | `{status}` | `status` |

Do not show `User name`; actor is the broadcaster. Hide `pollId`, raw timestamps, generic `amount`, and `choices`. Choice arrays need deliberate derived variables such as winning or leading choice before they are useful in a text template.

### Prediction Start, Progress, Lock, And End

All four phases normalize: `amount: number` (total points), `predictionId: string`, `title: string`, `outcomes: readonly { id, title, totalUsers, totalPoints }[]`, `totalUsers: number`, `totalPoints: number`, `startedAt: string`, `locksAt: string | null`, `endedAt: string | null`, `status: string`, `winningOutcomeId: string | null`.

Approved picker for all four phases:

| Label | Key | Source |
| --- | --- | --- |
| Prediction title | `{title}` | `title` |
| Participants | `{totalUsers}` | `totalUsers` |
| Total points | `{totalPoints}` | `totalPoints` |
| Status | `{status}` | `status` |

Do not show `User name`; actor is the broadcaster. Hide IDs, timestamps, generic `amount`, and the raw `outcomes` array. A future `Winning outcome` variable should resolve the winning ID to an outcome title rather than expose the ID.

### Stream Online

Normalized event-specific input: `amount: null`, `streamId: string | null`, `streamType: string | null`, `startedAt: string | null`, `endedAt: null`.

Approved picker:

| Label | Key | Source |
| --- | --- | --- |
| Stream type | `{streamType}` | `streamType`; empty when unavailable |

Do not show `User name`; actor is the broadcaster. Hide `streamId` and raw timestamp until formatted time variables exist.

### Stream Offline

Normalized event-specific input: `amount: null`, `streamId: string | null`, `streamType: string | null`, `startedAt: null`, `endedAt: string | null`.

Approved picker: no variables. A fixed message is sufficient with current normalized data. Add a locale-formatted `Ended at` variable only if a real design needs it.

## Rendering Contract

Local canvas preview, local TTS preview, server test send, and live playback now use the same core context mapping. The mapping exposes the approved aliases, sanitizes metadata, renders nullable values as empty text, and does not copy arbitrary sample fields into the top-level template context.

Previously shipped keys such as `actor.displayName`, `recipient.displayName`, `amount`, `tenure`, `tenureMonths`, and `cumulativeTotal` remain available to saved templates but are hidden from the insertion picker.

## Approved Decisions

1. Accept user-facing aliases `totalMonths`, `recipientName`, `gifterName`, `giftCount`, and `cumulativeGifts`.
2. Hide generic `amount`, internal IDs, raw timestamps, arbitrary metadata, and raw arrays from the picker.
3. Keep every previously shipped key working but hidden when a clearer alias replaces it.
4. Use empty text for unavailable nullable values; do not inject `null`, `undefined`, or technical fallback copy.
5. Defer poll-choice, prediction-outcome, and formatted-time variables until concrete message designs require them.
