# Review: custom data overlays proposal

Branch `codex/custom-data-overlays-proposal` (commit c5a10cf), change `openspec/changes/add-custom-data-overlays`. Reviewed 2026-10-08 against `origin/main`, the project conventions, and external docs. Nothing was implemented.

**Status:** Jams accepted every recommendation on 2026-10-08. The proposal was revised and split into four changes: `add-custom-data-overlays`, `add-data-overlay-event-rules`, `add-twitch-overlay-data` and `add-data-overlay-templates`. Line references below point at the original commit c5a10cf.

**Verdict:** the core model is sound. Shared values separate from canvases, core-owned rules with no scripting, transactional commits, authoritative Twitch snapshots, and copy-on-instantiate templates all hold up. Five things should change before implementation: the Operator gap (1), producers that can't realistically call the API (2, 3), receipt saturation that stops counting mid-stream (4), and goal pinning that blanks the overlay every time a new goal starts (5). Items 6 to 14 are refinements.

Paths below are relative to the repo. `D/` means `openspec/changes/add-custom-data-overlays/`.

---

## Must fix before implementation

### 1. Live counter controls live only in management, which conflicts with the Operator rule and the canonical spec

- **Proposal:** `D/design.md:95` and task 2.5 put "deliberate set/add/subtract/reset" in Data management. Operator is never mentioned.
- **Conflicts with:**
  - `openspec/specs/management-ui-ux/spec.md` ("Management Is A Configuration Surface… SHALL keep live operator controls outside the management experience"; "Live playback operations SHALL remain on the separate `/operator` surface").
  - Jams's standing rule that every module ships operator UI tools (project memory, 2026-10-08).
  - The existing pattern of timer add, subtract and set in Operator (`multi-module-playback-operations` → "Compact accessible timer actions", `apps/web/src/operator/timers-api.ts`).
- **Refine:** add an Operator section with these controls:
  - Pinned values with +1, −1 and set.
  - Reset with a confirm hold, the same way the Stream Deck clear works today.
  - A per-canvas show/hide toggle.
  - A "reset group" action for session-style counters (see 8).

  Management keeps definitions and rules. Add an Operator requirement and scenarios to `data-overlay-canvases` or a new delta on `multi-module-playback-operations`.

### 2. The input paths only work for custom code, and the existing Streamer.bot path is ignored

The pitch is data "arriving through API calls or WebSocket events". The proposal routes all of it through the proof-bound pairing API (`docs/automation-api.md`). That API needs:

- an RFC 7636-style verifier,
- polling and a one-time exchange,
- secure token storage,
- POST bodies with `requestId`, `observedRuntimeId` and revisions.

Most streamer tools can't do this without writing code:

- **Streamer.bot Fetch URL:** "Only `GET` requests are supported at this time"; for POST the docs point to C# ([docs](https://docs.streamer.bot/api/sub-actions/core/network/fetch-url)).
- **The pairing flow itself:** it was designed for the separate Stream Deck plugin project (`docs/automation-api.md`, "Verification boundary").

Stream Jams already has a zero-setup channel that the proposal never mentions. `streamerbot-runtime-service.ts:88-91, 374-401` subscribes to Streamer.bot `General/Custom` broadcasts, and the video shoutout intake uses it through `CPH.WebsocketBroadcastJson` (`docs/video-shoutout.md:13`). Streamer.bot also exposes its global variables over WebSocket:

- `GetGlobals` and `GetGlobal` requests ([requests](https://docs.streamer.bot/api/servers/websocket/requests)).
- `Misc.GlobalVariableCreated`, `Misc.GlobalVariableUpdated` and `Misc.GlobalVariableDeleted` events ([events](https://docs.streamer.bot/api/websocket/events/misc)).

**Refine:**

1. Add "Streamer.bot custom broadcast" as a custom source kind. It would use the same versioned flat schema and rules, keyed by a `source: "StreamJams", type: "Data"` marker the way video shoutouts are. No pairing would be needed, because the user already trusted that connection.
2. Consider "Streamer.bot global variable" as a read-only provider measurement, with a snapshot from `GetGlobals` and updates from `GlobalVariableUpdated`. It fits the proposal's own "authoritative snapshot" pattern from section 5. It also lets users who already keep counters in Streamer.bot bind to them without double-counting.
3. Keep the paired HTTP and WebSocket API for native tools. Name the target producers in the proposal so the ergonomics can be judged against them.

### 3. Required `requestId` plus revisions break stateless producers

`D/design.md:67`: every write requires `requestId` and `observedRuntimeId`, and direct commands also require `expectedRevision`.

- **A hard-coded button counts once.** Picture a Stream Deck or HTTP button with a fixed body. Its second press carries the same `requestId` and the same body hash. Under section 4 it returns the old receipt and doesn't increment. A button that never generates a new ID would count once per seven-day retention window. Prior art makes the key optional: Stripe says "All POST requests accept idempotency keys" ([Stripe](https://docs.stripe.com/api/idempotent_requests)), and the IETF draft defines an optional header ([draft-07](https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html)).
- **`expectedRevision` on add and subtract adds failures without protecting anything.** Revision guards prevent lost updates on absolute writes, the If-Match pattern. Deltas commute, so two "+1" calls racing are both correct. With a guard, a burst of deaths from one producer would turn into 409s that need a fresh GET plus a "new deliberate gesture" each.
- **`observedRuntimeId` on events breaks producers on every app restart.** Dedupe for events is already keyed by source, event ID and data epoch (`D/design.md:77`). The runtime guard adds no safety, but every producer must re-read state after each Stream Jams restart before it can submit.

**Refine:**

| Write | Required | Optional |
| --- | --- | --- |
| `set` | `expectedRevision` | `requestId` |
| `add`, `subtract` | nothing | `requestId`, `expectedRevision` (no-dedupe, no-guard mode when omitted) |
| Events | stable `eventId` | none (drop `observedRuntimeId`) |

Document that omitting `requestId` means at-most-once is the caller's responsibility.

### 4. Receipt saturation fails closed and stops all counting mid-stream

`D/design.md:79` keeps receipts for seven days with a 100,000 cap and rejects new writes at capacity.

- 100,000 receipts over seven days averages about 14,000 writes a day.
- One grant at the proposed 10 writes/s fills the store in under three hours.
- After that, every data write is rejected for up to a week, including writes from unrelated producers.
- The spec doesn't say whether built-in Twitch or Streamer.bot events also write receipts. If they do, a busy chat-driven counter reaches the cap faster.

A self-inflicted outage on stream is worse than a weaker dedupe window. Stripe prunes keys after 24 hours ([Stripe](https://docs.stripe.com/api/idempotent_requests)). The IETF draft only asks that the expiry policy be published (§2.3).

**Refine:**

- Use a 24 to 48 hour retention window.
- Bound receipts per grant or per source so one producer can't exhaust the others.
- At the cap, evict the oldest entries and record a diagnostic instead of rejecting.
- State whether built-in events write receipts. The existing in-memory dedupe in `EventIngestionService` may be enough for them.

### 5. Pinning a Creator Goal blanks the overlay on every new goal

`D/design.md:87` and the spec scenario "Goal ends and another begins" say an ended goal never rebinds and the user must pick the new one.

Twitch's guide says: "Although the API currently supports only one goal, you should write your application to support one or more goals" ([Creator Goals guide](https://dev.twitch.tv/docs/api/goals/)). Twitch's launch post says goals stay active "until the creator deletes them or starts a new one" ([Twitch blog](https://blog.twitch.tv/en/2021/09/08/ready--set--goals-rally-the-squad-with-new-creator-goals)). Allowing several goals at once is an open creator request ([UserVoice](https://twitch.uservoice.com/forums/923383-creators-and-stream-features/suggestions/44479266-let-streamers-have-multiple-goals-at-one-time)). In practice a streamer reaches a goal and immediately creates the next one in the Twitch dashboard. Under this spec the bar then reports "ended" and hides until someone opens Stream Jams management.

**Refine (updated after Jams's question):** model goals as a list, as Twitch asks, but default each binding to "the active goal of type X", for example `follower` or `subscription`. If two active goals ever share a type, pick the most recently started one and show that choice in management. Keep pinning a specific goal ID as an option. Add a scenario showing a follow-type goal replaced by a new follow-type goal and continuing to render. Keep the "Combined goals panel" starter, because it also combines custom goals with the Twitch goal and is ready for multiple Twitch goals if they arrive.

---

## Should refine

### 6. Default "hide" for stale provider data makes overlays flicker during API blips

`D/design.md:103` hides provider measurements by default when they go stale. Follower totals refresh every 60 seconds and become stale after one failed refresh, so a single Twitch 5xx or reconnect makes the follower bar disappear on stream. The repo's fail-closed rule covers broken content (`docs/ai/overlay-error-presentation.md`, "Live overlay errors should fail closed"). A correct number that is two minutes old isn't an error.

**Refine:** default to retain-last with a grace period, for example hiding after 10 minutes stale or when the goal has ended. Keep hiding for unresolved or unauthorized bindings.

### 7. Adding `channel:read:goals` will disconnect every existing Twitch user unless scope gating is split

`apps/server/src/modules/twitch/twitch-eventsub-runtime-service.ts:105` disconnects EventSub entirely when any scope in `defaultTwitchOAuthScopes` (`twitch-oauth-service.ts:19`) is missing. The spec's requirement is right: goal readiness should be independent of alert readiness. But the obvious implementation, appending the scope to that list, would knock out alerts for everyone until they reconnect.

**Refine:** have task 5.1 name this explicitly. Split the list into required scopes and optional capability scopes, and add a regression test showing an account without goal scope keeps alert intake. Two smaller notes:

- The follower total needs no new scope. Any token can read `total` from Get Channel Followers ([Twitch dev forum](https://discuss.dev.twitch.com/t/get-followers-count/48066)).
- EventSub WebSocket has "no replay of events that are lost" across a dropped connection ([Twitch](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)). The resnapshot-on-reconnect design is therefore necessary, and the spec already covers it correctly.

### 8. Manual-only reset leaves out the most common counter lifecycle

- StreamElements session data resets automatically 15 minutes after each stream ends, while goal data persists ([StreamElements](https://support.streamelements.com/hc/en-us/articles/10474424314642-Widget-Data-Overview)).
- The app already normalizes `stream_online` and `stream_offline` events (`packages/core/src/events/types.ts:186-190`).

Deferring scheduled resets is reasonable. Requiring a streamer to reset five session counters by hand every stream isn't.

**Refine:** add an optional reset group (session or campaign) with one Operator reset action. Optionally add "reset this group on stream online", using an existing normalized event. That isn't a scheduler, so it fits the non-goals.

### 9. "Moderation where applicable" is too vague for viewer-controlled text

The Latest supporter starter renders usernames and messages from viewers. Offensive usernames were the main vector in the 2021 hate-raid wave ([TechRadar](https://www.techradar.com/news/when-action-leads-to-inaction-the-twitch-hate-raids), [Indiecator](https://indiecator.org/2021/08/17/how-to-protect-yourself-from-hate-raids/)). The repo already has `renderedText` moderation (`packages/core/src/moderation/moderation-service.ts`).

**Refine:** make the requirement say that every text value written from an event field passes `renderedText` moderation at write time, before persistence, so every output shows the same cleaned value. Add a scenario that writes a blocked username into Latest supporter.

### 10. The WebSocket ticket flow solves a browser problem for clients that aren't browsers

`D/design.md:69` gives the reason "browser upgrades cannot rely on HTTP Authorization headers". But the API rejects browser Origins (`docs/automation-api.md`, first paragraph), and native WebSocket clients can send headers on the upgrade, for example Node `ws` and .NET `ClientWebSocket.Options.SetRequestHeader`. The extra HTTP call, the 30-second single-use ticket store and the five-second first-frame timeout add moving parts without a matching threat.

**Refine:** authenticate with a bearer token on the upgrade request, or with the bearer token in the first frame, and drop tickets. A separate question is whether Jams meant inbound WebSocket at all (see open questions).

### 11. Money and decimal kinds have no v1 producer

- No normalized event carries money: `types.ts` has no donation type, and BL-020 keeps donation adapters deferred.
- Decimal values have no named use case.

Both still bring a currency catalog, scaled-integer arithmetic, Intl formatting and template compatibility checks into the first slice.

**Refine:** ship integer and text first, and add money in the slice that delivers a real money source, whether that is BL-020 or a Streamer.bot donation trigger. Keep the current design text as the contract for that later slice.

### 12. One change with 38 tasks contradicts the repo's slice rule

`AGENTS.md` says "Process one independently reviewable slice at a time", and the design lists six slices itself (`D/design.md` Risks). For comparison, the video-shoutout change has 23 tasks and is still in review.

**Refine:** split into separate OpenSpec changes, each with its own acceptance:

1. Values, canvases, browser and desktop output, and Operator controls.
2. Rules over normalized and Streamer.bot custom events.
3. Twitch follower and goal sources.
4. Paired HTTP and WebSocket ingress with receipts.
5. Templates.

Slice 1 alone delivers a usable feature.

### 13. Scenarios bundle several behaviors

Several scenarios test two cases at once:

- "Invalid second rule and receipt saturation"
- "Reused ticket and slow consumer"
- "Decrease and over-target"
- "Incompatible currency or missing asset"
- "Invalid arithmetic or currency"

They hide behind "or" and "respectively", which makes the requirement-to-test trace in task 1.4 ambiguous. Split each into one WHEN/THEN per behavior. The prose is also very compressed throughout. Expand the design decisions enough that a reviewer can read them without decoding.

### 14. Docs drift

- `docs/backlog.md:39` still lists "creator goals" under BL-020, and `docs/product-plan.md:173` still defers creator goals. Update both if BL-055 takes Creator Goals over.
- All canvases share one row in each shared surface's module layer order (`shared-overlay-surfaces` → "Each Shared Surface Owns Ordered Module Layers"). A canvas can't sit above Alerts while another sits below. State this limit, or plan per-canvas layer rows.
- No element supports value-change animation, such as a count-up or an animated bar fill, or a completed-goal style. Most goal widgets have both. If v1 excludes them, list them in the non-goals.

---

## Conventions check

| Rule (Jams, 2026-10-08) | Proposal |
| --- | --- |
| Desktop overlay and dedicated browser source | ✓ Module-specific, unified browser and private desktop surfaces (`data-overlay-canvases` → "Coherent scoped live projections") |
| Management UI | ✓ |
| Operator UI tools | ✗ Missing (finding 1) |
| Queues survive restarts | n/a: no queue. Values persist ✓ |
| Desktop mirroring first-class | n/a: no media. Same projection on every output ✓ |

## Open questions for Jams

1. "WebSocket events": does that mean producers connect to Stream Jams (as proposed), or Stream Jams listens to events from tools it already connects to, such as Streamer.bot? Recommendation: support Streamer.bot custom broadcasts first, then paired native input.
2. Ship integer and text only in v1, with money arriving alongside a real donation source? Recommendation: yes.
3. Should a Twitch goal binding follow the current active goal by default? Recommendation: yes.

## Decisions from Jams (2026-10-08)

1. **Event intake:** Stream Jams listens to events from tools like Streamer.bot; producers don't need to connect into it. Make Streamer.bot custom broadcasts (and optionally globals) the primary custom source, and drop or defer the inbound WebSocket ingress (findings 2 and 10).
2. **Value kinds:** v1 ships integer and text only. Money and decimal arrive with a real money source (finding 11).
3. **Twitch goals:** handled as a list with "active goal of type X" binding by default (finding 5, updated).
