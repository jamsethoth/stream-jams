# Design: Expand Alert Configuration UI

## Context

The backend and core alert model are ahead of the UI. The UI currently hides most alert configuration power, while the module wizard exposes some alert-ish setup fields that are not schema-backed module config. This change should make the management UI the clear home for alert setup and keep the module config surface focused on module canvas settings.

## Goals / Non-Goals

**Goals:**

- Provide a human-readable alert editor that covers collections, rules, conditions, variants, assets, layout, cooldowns, priorities, weights, duration, and enabled state.
- Keep domain logic out of React components by using typed management API helpers and focused form state utilities.
- Integrate with asset management through reusable picker components.
- Add rule-editor sample/test alert flows that exercise matching, resolution, and overlay playback without contacting Twitch.
- Improve maintainability by splitting large forms into small, named components and preserving existing core services.

**Non-Goals:**

- Do not add Speaker.bot or TTS provider-specific controls; that is handled by `add-speakerbot-tts-provider`.
- Do not change the core alert matching semantics unless tests reveal an existing defect.
- Do not build a drag-and-drop canvas editor in this slice. An interactive layout canvas is still required before the initial app scope can be considered complete and is tracked in `docs/future-features.md`.

## Dependency Gate

Implementation MUST NOT begin until `serve-overlay-safe-assets` has landed in remote `main`. The asset picker and preview/test flows must use the final overlay-safe asset URL behavior.

## Assumptions

- Existing alert route APIs can support most editor operations with small DTO/UI additions.
- Asset metadata is sufficient for selecting visual/audio assets; thumbnails or waveform previews can be deferred if needed. Visual controls select only image, GIF, or video assets; audio controls select only audio assets.
- TTS config fields should remain hidden or disabled until `add-speakerbot-tts-provider` lands.

## Decisions

- Model the UI around the core alert hierarchy: collections contain rules; rules contain variants; variants contain media/text/layout.
- Build typed form adapters that convert between API/domain records and editable drafts instead of mutating domain objects directly in React render.
- Use accessible form controls and Testing Library role/label queries for coverage.
- Keep the module wizard limited to schema-backed module config and move alert setup copy/actions into the alert editor.
- Treat a real alert as a provider-originated event with real provider IDs, timestamps, actor data, ingestion logging, dedupe, matching, resolution, cooldown, and overlay playback. Treat a test alert as a management-triggered local sample event that is clearly labeled as test data, does not contact Twitch or EventSub, and runs through the same persisted-rule matching, resolution, cooldown, and playback path after sample-event construction.
- Put test-alert controls in the rule editor for this slice. This lets users test the saved rule they are editing, see success/no-match/cooldown/error state in context, and avoid a broader global testing surface. A global test panel would test the whole alert system independent of a specific editor, but it is deferred until an operator workflow needs it.
- Limit first-slice condition builder fields to normalized `amount`, `tier`, and `rewardId`. Broader accessible fields such as actor identity, message/user input, reward title, resubscription streak, gift count, and provider metadata are deferred to `docs/future-features.md`.
- Use numeric layout fields for `x`, `y`, `width`, `height`, and `zIndex`, paired with a static preview. The preview shows approximate placement and sizing but does not support dragging, resizing, or direct manipulation in this slice.
- Present asset selection as two variant controls: a visual asset picker filtered to image/GIF/video assets and an audio asset picker filtered to audio assets. Users choose human-readable imported asset records; the UI persists asset IDs and previews/renders them through overlay-safe asset URLs where route context permits. Users should not manually copy asset IDs or overlay route keys.
- Use hard delete for collections, rules, and variants with a confirmation dialog that shows an impact summary before acceptance. Collection delete removes the collection and rule membership links; rule delete removes the rule, its conditions, and variants; variant delete removes only that variant. Disable remains the reversible alternative. Backup/history/rollback is a separate future feature.

## Initial Implementation Plan

1. Confirm overlay-safe asset serving is present in remote `main`.
2. Expand the management alert API client types to cover full rule and variant payloads.
3. Build editor components for collections, rules, conditions, variants, assets, numeric layout with static preview, delete confirmations, and rule-editor test alerts.
4. Add sample event generation and management route support if the server lacks a test-alert endpoint.
5. Add focused unit, route, and Playwright coverage.

## Risks / Trade-offs

- A single large alert form can become hard to maintain. Mitigation: split by domain concepts and keep pure helpers for draft conversion.
- Condition builders can overfit the first Twitch events. Mitigation: ship only the minimal normalized field set now and track expanded accessible fields separately.
- Test alert workflows can bypass real EventSub behavior. Mitigation: label them as local sample events and send them through the same matching/resolution/playback path after normalization.
- Hard deletes can remove more than the user expected. Mitigation: require confirmation with an impact summary and keep backup/history/rollback as a separate future feature.

## Resolved Questions

1. Test alerts are triggered from the rule editor only for this slice.
2. The first condition builder exposes only normalized `amount`, `tier`, and `rewardId`.
3. Layout editing uses numeric fields plus a static preview for this slice.
