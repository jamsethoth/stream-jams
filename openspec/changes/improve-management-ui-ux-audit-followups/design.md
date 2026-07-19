## Context

PR #66 established the sidebar-first management shell and focused alert editor. A live audit of merge commit `229e7e6` found that the new structure is sound, but several implementation details weaken configuration safety, responsive use, keyboard access, localization readiness, and browser-source reliability. The affected code is concentrated in `apps/web`; existing typed management APIs, route parsing, design tokens, modal foundation, and overlay authorization remain valid.

The work is split by failure domain so independent agents can implement and review overlay transport, management failure states, accessible controls, and shell/editor layout without inventing shared frameworks.

## Goals / Non-Goals

**Goals:**

- Prevent internal management navigation from bypassing unsaved-change confirmation.
- Make initial load failures distinct from empty or editable states.
- Make primary navigation, status, and actions reachable without horizontal scrolling at supported widths.
- Preserve focused-editor context and use the available desktop/tablet viewport.
- Complete required keyboard semantics using native elements and the existing Diagnostics tab pattern.
- Establish dependency-free locale, plural, date, duration, and byte formatting.
- Keep browser-source output connected after transient closes, scale fixed profiles predictably, and render no production error text.
- Close browser-source onboarding gaps without adding OBS integration.

**Non-Goals:**

- No mobile canvas authoring, resizable-pane framework, router package, component library, i18n package, custom profile editor, OBS API integration, or unified-output redesign.
- No translation catalog beyond the typed/default English copy boundary needed to make later extraction mechanical.
- No conversion of every table into a new generic table/card component.

## Decisions

### Keep a focused editor route and repair its shell

The editor remains separate because its alert tree, canvas, inspector, preview, and test controls do not fit the Sets inventory. Focused routes bypass the normal 1280px content cap, render a compact breadcrumb from the loaded set/document, derive Back from the loaded set ID, and use a viewport-height workspace with independently scrolling side panes. At intermediate widths the inspector becomes a full-width row; below 700px the existing larger-screen guard remains.

Alternatives rejected: inline editor (too dense), new resizable-pane dependency (unneeded before fixed layout works), mobile canvas editing (outside MVP).

### Intercept internal links once at the shell boundary

The management shell captures unmodified left-clicks on same-origin `/manage` anchors, parses the target with the existing local route model, and calls the existing guarded navigation function. Modified clicks, downloads, external links, and explicit new-window targets retain native behavior. This fixes correction and usage links at their common boundary without plumbing callbacks through every page or adding a router.

### Keep page-local async state explicit

Settings, Alerts, Assets, and Providers keep their existing local state but return a retry-only failure surface when initial loading fails. They do not render defaults, empty-state creation actions, or stale mutation controls until a successful load establishes authoritative state. A small shared error-cause formatter converts structured validation payloads into operator-safe text; raw detail remains in Diagnostics.

Alternative rejected: generic async state machine/context, because four existing components already expose the necessary loading/error state and do not share data lifecycles.

Loaded alert-editor action failures use the same actionable error content in a fixed bottom-right surface. They can be dismissed immediately and expire after eight seconds, so feedback does not resize or scroll the authoring workspace. Initial editor-load failures remain persistent and inline because no usable workspace exists behind them. Client-only failures receive a local reference ID and are written through the authenticated management diagnostics boundary; backend failures use their public error ID as the runtime-log correlation ID.

All management pages use one shared toast surface for transient action results. Existing page-local state remains the owner because only one route is mounted and pages already own their async lifecycles; a global notification store would add routing, test, and Storybook coupling without improving the user flow. Positive and informational feedback expires after four seconds. Action failures expire after eight seconds, can be dismissed immediately, and retain available timestamp, reference ID, correction, and Diagnostics actions inside the toast. The newest page-local result replaces the prior result instead of building a notification queue.

Toasts are fixed at the bottom-right on desktop and inset from both viewport edges on narrow screens. Their content uses the existing semantic tokens, never exceeds the viewport, and allows long timestamps, references, and localized copy to wrap within the raised surface. `status` announcements remain polite; failure announcements remain alerts. Blocking initial-load failures, stale-runtime refresh failures, field validation, destructive confirmations, wizard failures, and warnings requiring a decision stay inline with the affected content because they must remain visible until corrected or resolved.

Alternatives rejected: a shell-level notification context/store, because page-local state already covers the mounted route; CSS-only repositioning of every existing notice, because it would duplicate timing, dismissal, overflow, and accessibility behavior; a toast dependency, because the required surface is small and existing foundation components provide the content and tokens.

The editor exposes actor-name variables only when the selected event has a useful actor. Follow, subscription, resubscription, cheer, raid, and channel-point alerts expose `User name`; gift alerts expose `Recipient name` and `Gifter name`; community gifts expose `Gifter name`. Broadcaster/system events such as hype trains, polls, predictions, and stream status do not show an irrelevant actor choice.

The picker uses concise event-specific aliases: `totalMonths`, `cheerAmount`, `raidViewers`, `rewardTitle`, `userInput`, `recipientName`, `gifterName`, `giftCount`, `cumulativeGifts`, hype-train totals, poll totals, prediction totals, and `streamType`. Generic amounts, internal IDs, raw timestamps, arbitrary metadata, and collection-valued choices or outcomes remain out of the picker. Nullable values render as empty text.

One core template-context builder maps both normalized live events and editor sample payloads to the same aliases. Local preview, server test send, and live resolution all use it. Previously supported keys such as `{actor.displayName}`, `{recipient.displayName}`, `{amount}`, `{tenure}`, `{tenureMonths}`, and `{cumulativeTotal}` remain renderable for saved-template compatibility but are not offered for new insertion.

### Use native responsive behavior before new components

The mobile navigation wraps into visible destinations instead of relying on an unlabelled horizontal scrollbar. Modules is a non-link group on desktop so only Alerts is current. Dense tables retain semantic markup, but narrow breakpoints hide secondary columns and keep identity, status, and primary actions visible; details remain available in the selected/detail region. Asset filters collapse behind a native `details` summary on narrow screens.

### Reuse working keyboard patterns

Inspector tabs copy Diagnostics' roving-tabindex and Arrow/Home/End behavior. Asset choices remain native buttons with `aria-pressed` rather than incomplete listbox semantics. Canvas layer buttons handle Enter/Space and expose selection. Disabled destructive actions receive visible referenced help.

### Use platform internationalization primitives

A small formatter module uses `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.PluralRules`; no dependency is added. Startup sets document language from `navigator.language` with English fallback and derives direction from a small RTL-language set. User-generated overlay text uses `dir="auto"`. Existing English copy remains the default dictionary boundary; translation delivery is future work.

### Reconnect and scale inside the overlay client/surface

The overlay client owns one reconnect loop: retry after 1, 2, 4, 8, then 10 seconds capped until disposed; each successful open resets the delay. Cleanup cancels pending timers and closes the active socket. Tests use fake timers and a fake WebSocket implementation.

The render surface treats Landscape as 1920x1080 and Vertical as 1080x1920, uniformly scales the fixed canvas to fit the browser viewport, and centers it in transparent remaining space. Layer geometry remains stored in target-profile pixels. Production transport/internal failures return an empty overlay root; Storybook keeps explicit safe diagnostic stories through props rather than live-route error text.

### Keep browser-source onboarding local to Alerts

Each profile row shows its required width and height plus short browser-source setup guidance. Reveal becomes a toggle so the route key can be re-masked immediately. No OBS detection or automation is added.

## Risks / Trade-offs

- [Compact table breakpoints can hide useful comparison data] -> Preserve selected/detail panels and keep full semantic tables above the narrow breakpoint.
- [Reconnect loops can create duplicate sockets] -> One owner, one timer, and disposal tests; reset delay only after `open`.
- [Scaling changes noncanonical browser-source output] -> Preserve canonical dimensions exactly at 1:1 and add Landscape/Vertical viewport tests.
- [Shell click interception can break native link behavior] -> Intercept only same-origin, unmodified, left-button `/manage` navigation.
- [Locale foundation does not translate existing copy] -> Limit this change to document metadata and shared formatting; add pseudolocale/RTL stories to expose remaining embedded copy.
- [Existing templates use superseded variable names] -> Keep previously supported keys in the shared context while removing them from the insertion catalog.
- [Parallel agents share one worktree] -> Assign disjoint file families and run integrated validation after all slices land.

## Migration Plan

No persistence or API migration is required. Ship as a frontend/server-shell update, rebuild the web bundle, restart the local service, and verify management plus both overlay profiles. Rollback is the branch revert; stored configuration and route keys are unchanged.

## Open Questions

None block implementation. Unified-output management and full translation catalogs remain separate product decisions.
