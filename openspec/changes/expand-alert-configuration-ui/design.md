# Design: Expand Alert Configuration UI

## Context

The backend and core alert model are ahead of the UI. The UI currently hides most alert configuration power, while the module wizard exposes some alert-ish setup fields that are not schema-backed module config. This change should make the management UI the clear home for alert setup and keep the module config surface focused on module canvas settings.

## Goals / Non-Goals

**Goals:**

- Provide a human-readable alert editor that covers collections, rules, conditions, variants, assets, layout, cooldowns, priorities, weights, duration, and enabled state.
- Keep domain logic out of React components by using typed management API helpers and focused form state utilities.
- Integrate with asset management through reusable picker components.
- Add realistic sample/test alert flows that exercise matching, resolution, and overlay playback.
- Improve maintainability by splitting large forms into small, named components and preserving existing core services.

**Non-Goals:**

- Do not add Speaker.bot or TTS provider-specific controls; that is handled by `add-speakerbot-tts-provider`.
- Do not change the core alert matching semantics unless tests reveal an existing defect.
- Do not build a drag-and-drop canvas editor unless a later slice defines it.

## Dependency Gate

Implementation MUST NOT begin until `serve-overlay-safe-assets` has landed in remote `main`. The asset picker and preview/test flows must use the final overlay-safe asset URL behavior.

## Assumptions

- Existing alert route APIs can support most editor operations with small DTO/UI additions.
- Asset metadata is sufficient for selecting visual/audio assets; thumbnails or waveform previews can be deferred if needed.
- TTS config fields should remain hidden or disabled until `add-speakerbot-tts-provider` lands.

## Decisions

- Model the UI around the core alert hierarchy: collections contain rules; rules contain variants; variants contain media/text/layout.
- Build typed form adapters that convert between API/domain records and editable drafts instead of mutating domain objects directly in React render.
- Use accessible form controls and Testing Library role/label queries for coverage.
- Keep the module wizard limited to schema-backed module config and move alert setup copy/actions into the alert editor.

## Initial Implementation Plan

1. Confirm overlay-safe asset serving is present in remote `main`.
2. Expand the management alert API client types to cover full rule and variant payloads.
3. Build editor components for collections, rules, conditions, variants, assets, layout, and test alerts.
4. Add sample event generation and management route support if the server lacks a test-alert endpoint.
5. Add focused unit, route, and Playwright coverage.

## Risks / Trade-offs

- A single large alert form can become hard to maintain. Mitigation: split by domain concepts and keep pure helpers for draft conversion.
- Condition builders can overfit the first Twitch events. Mitigation: derive options from typed event field metadata where practical.
- Test alert workflows can bypass real EventSub behavior. Mitigation: label them as local sample events and send them through the same matching/resolution/playback path after normalization.

## Open Questions

1. Should test alerts be triggered from a rule editor, a global test-alert panel, or both?
2. Which Twitch event fields must be available in the first condition builder release?
3. Should layout editing use numeric fields only for this slice, or include a visual canvas preview?
