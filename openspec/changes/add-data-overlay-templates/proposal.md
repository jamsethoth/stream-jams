## Why

Building a goal bar or counter badge from scratch takes time. Starter canvases and saved templates let streamers begin from a finished design, and reuse their own layouts.

## What Changes

- Add four bundled starters: Counter badge, Goal bar, Latest supporter and Combined goals panel.
- Let users save a canvas, or a selection of elements, as a template.
- Templates hold layout, styling, asset references and typed binding slots. They never hold live values, applied-event records or credentials.
- Instantiating a template creates an independent copy. Later template edits never change existing canvases.
- Each slot must be mapped to a compatible existing value or goal, or to a newly created custom value. Provider slots, such as the Twitch follower total, require a configured source.
- Inserting an element group flattens it into ordinary elements. There are no nested groups.

## Out of scope

- A template marketplace, sharing service or import from other products.
- Linked templates that update their copies.

## Capabilities

### New Capabilities
- `data-overlay-templates`: bundled and saved templates, slot mapping and instantiation.

### Modified Capabilities
- `configuration-backup-restore`: include saved templates.

## Impact

Core owns the template and slot schemas and reference rewriting. Server owns template repositories and atomic instantiation. Web owns the template picker, slot mapping and the "save as template" flow. Depends on slice 1 ([`add-custom-data-overlays`](../add-custom-data-overlays/proposal.md)). Provider slots become usable when slices 2 or 3 provide sources. Tracked as BL-063.
