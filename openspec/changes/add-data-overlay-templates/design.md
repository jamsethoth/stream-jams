## Context

The implemented data catalog and canvas service provide typed bindings, bounded documents and one transactional mutation boundary. Templates reuse those contracts. Four bundled starters must work with an empty catalog, and saved templates must remain useful after their original values or images are removed.

## Goals / Non-Goals

Provide reusable canvas or selection layouts, private sample previews, compatible mapping, atomic creation and flat insertion. Copies remain independent. Templates store no live counts, goal baselines, provider account identity, credentials or event history. Persistent groups, remote assets and new provider integrations remain out of scope.

## Decisions

- Use strict versioned documents with typed local slots. Sanitizing a canvas rewrites value/goal references to slot IDs and clears bound literal text. Persist only style, geometry, registered asset identifiers and source-kind requirements. Copying live catalog documents would retain counts and account identity.
- Keep bundled starters in core and user templates in a separate typed SQLite repository. Limit user templates and slots to 100 each, with the existing 100-element canvas bound. Bundled starters are immutable and excluded from backup rows.
- Resolve every mapping in one `DataOverlayService` mutation. New custom values and goals, captured saved baselines, fresh canvas/element IDs and reference rewrites either all commit or all roll back. Client-side sequences of create requests could leave partial data.
- Validate required provider kind and runtime readiness using trusted source provenance, including account invalidation. Manual values cannot impersonate a provider. Native Twitch Creator Goal binding remains unavailable until its source integration is implemented; the central bus prerequisite is now available.
- Insert selected layouts as ordinary elements with new IDs and translated bounded geometry. This avoids a second persistent grouping model.
- Preserve missing template images as a typed `missing-image` editor placeholder carrying the original asset ID. It owns no asset foreign key or output grant and always projects transparent. Management offers replacement by a registered image. Silently dropping the element would lose layout and correction context; a fake asset record would violate asset ownership.
- Preview from sample-only values and goals through the existing projection and renderer. No preview action invokes live value commands.

## Risks / Trade-offs

- A provider can disconnect during mapping → validate readiness in the synchronous mutation, then let ordinary source status hide output on disconnect.
- Source values and derived goals can change before creation → capture new baselines inside the transaction, not in the form or template.
- User template images can be removed → retain an identifiable placeholder and validate it on backup roundtrip.
- Whole-catalog writes have bounded cost → retain existing limits and one post-commit publication rather than adding a separate mutation pipeline.

## Migration Plan

Migration 043 adds `data_templates` with stable ID, normalized unique name and validated document after reconciling main's migration history. Backup schema 42 requires the section; compatible earlier schemas restore an empty user-template catalog. Validate user-only documents and slot references before replacement. Operational rollback restores exact prior template state; portable restored canvases remain disabled. No secret or connection state is added to backups.

## Open Questions

No independent template implementation decision remains open. Provider-specific templates can only expose source kinds that the runtime actually implements; Creator Goal support remains tracked by `add-twitch-overlay-data`.
