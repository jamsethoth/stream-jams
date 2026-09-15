## Context

The management UI already has the required alert inventory, focused editor, Home readiness data, typed test-delivery clients, and Screen Effects confirmation flow. The problems are presentation and editor view-state ownership: similar actions have ambiguous names, profile switching is treated like document navigation, readiness is spread across controls, Home over-emphasizes completed work, and alert rows duplicate secondary actions at responsive breakpoints.

The implementation remains frontend-only. Existing server contracts continue to determine saved-versus-draft payloads, eligible destinations, profile availability, TTS behavior, and explicit live-output confirmations.

## Goals / Non-Goals

**Goals:**

- Make sample, local preview, draft test, and saved test behavior clear before activation.
- Keep one alert draft and its history intact while the user changes the viewed fixed profile.
- Present one honest configuration-readiness summary and the highest-priority next correction.
- Put Home problems and incomplete setup before completed work.
- Keep only frequent alert-row actions inline while retaining every secondary action accessibly.

**Non-Goals:**

- No new rendering surface, runtime matching behavior, destination fallback, backend contract, persistence model, navigation redesign, bulk operation, or dependency.
- No automatic save, review, enablement, activation, or live delivery.
- No mobile canvas redesign or changes to secret overlay URL handling.

## Decisions

### Labels follow the data source and delivery effect

Inventory sample inspection is named `Sample message`; local editor rendering remains `Preview`; alert delivery is `Test draft` in the editor and `Test saved` in inventory; Screen Effects uses `Test saved…` because confirmation follows. Compact summaries use existing human-readable profile and device-route names. This keeps distinct contracts visible instead of inventing a shared abstraction that could obscure saved-versus-draft behavior.

### Fixed profiles are editor view state

The editor retains its single document, dirty flag, undo/redo stack, and profile-specific viewport state when changing the selected profile. Switching stops transient preview but does not save, discard, enable, or review anything. The existing navigation guard still owns attempts to leave the editor.

### Readiness is derived from existing facts

A small view helper derives status text and one correction target from current validation blockers, intended reviewed/enabled profiles, alert enabled state, and set activation state. Priority is blockers, review, profile enablement, alert enablement, then set activation. The UI describes configuration readiness only and explicitly avoids claiming output connectivity or successful delivery.

### Home uses progressive disclosure

Existing setup rows are partitioned without reordering: incomplete rows remain visible and the first is identified as the next action; completed rows move into a native `details` disclosure. Problems render first. All-complete state keeps a concise readiness summary and active-set information.

### Alert rows have one responsive action model

Edit, Test saved, and Enable/Disable remain inline. Sample message, Add variation, Duplicate, Reset, and Delete appear once in the existing native More disclosure at all widths. This removes duplicate accessibility-tree entries and avoids a custom menu dependency.

## Risks / Trade-offs

- [Readiness facts can be stale or incomplete] → Label the result as configuration readiness, preserve Unsaved context, and show limited/unknown status instead of a green delivery claim.
- [Removing the profile-switch modal could hide data loss] → Preserve the shared document and history, keep explicit Revert and Save, and retain the route-level dirty guard including failed-save state.
- [Compact summaries could expose sensitive routing data] → Display only existing human-readable destination names; never render route keys or browser-source URLs.
- [Moving actions into More adds one interaction] → Keep frequent actions inline and use native keyboard-operable disclosure with focus restoration tests.

## Migration Plan

No data migration is required. Ship the frontend and documentation together; rollback is a normal code revert because persisted documents and APIs do not change.

## Open Questions

None. If current typed clients lack a required readiness fact, the UI will state the limitation and implementation will stop before expanding contracts.
