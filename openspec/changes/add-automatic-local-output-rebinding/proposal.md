# Proposal: Add Automatic Local Output Rebinding

## Intent

Persisted Chromium audio-device IDs and Electron display IDs can change across Windows or application restarts while their user-visible names remain stable. Add an explicit per-binding recovery option that follows one exact saved name without weakening existing fail-closed output behavior.

## Scope

In scope:

- Add an opt-in `Automatically follow this exact device name` setting to each named audio route.
- Persist the authoritative selected audio-device label and reconcile a missing ID only when exactly one current device has the same case-sensitive label.
- Add an independent opt-in `Automatically follow this exact display name` setting to the desktop overlay.
- Persist the authoritative selected display label and apply the same exact unique-match rule.
- Persist a replacement ID before it is used, preserve current occurrences, and expose actionable management status.
- Clear machine-local IDs, labels, and consent in portable backups and restores.
- Normalize the existing Live TTS checkbox presentation without changing TTS behavior.

Out of scope:

- Native Windows Core Audio or display-configuration identity bridges.
- Fuzzy, coordinate, primary-display, default-device, communications-device, or enumeration-order fallback.
- Global consent, automatic replay, or retargeting active work.

## Approach

Add one framework-independent exact-label cardinality helper and keep reconciliation in the existing audio and surface services. Browser requests can opt in but cannot author trusted labels. Both services compare the saved snapshot again inside the existing mutation boundary, save a uniquely matched replacement ID first, and apply it only to future work.

## Impact

- Existing and new bindings remain opt-out by default.
- A uniquely named replacement can recover automatically after explicit consent.
- Missing, differently cased, duplicated, or unsaved names remain unavailable with no fallback.
- Database schema version 26 adds the audio consent column; desktop JSON uses compatibility defaults.
- Portable archives remain safe to restore on another machine.
