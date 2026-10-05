## Context

The current frontend already has a shared modal focus trap, grouped alert event projections, route-guarded management navigation, scoped Screen Effects controls, and a typed asset-filter model. The audit corrections therefore change presentation and focus lifecycle at existing React boundaries rather than introducing new domain models. The applicable MVP UX sections are Operator Console, Information Architecture, Visual Foundation accessibility/responsive scope, Cross-Cutting Confirmation Pattern, Alert Sets, Alert Editor, and Asset Library. All six corrections are within the implemented product surface; no backlog item, runtime contract, or output destination is promoted.

Source inspection and Storybook fixtures are diagnostic inputs only. Final acceptance uses the built production UI served by a task-owned local runtime on an unused loopback port with a disposable synthetic SQLite/assets profile. The fixture must not read or mutate user configuration, connect real outputs, or dispatch live tests. Where transient operator state cannot be persisted, the fixture may stub only that response while retaining the real served shell, routing, auth bootstrap, and layout; this limitation is recorded separately from full runtime-state acceptance.

## Goals / Non-Goals

**Goals:**

- Make destructive operator confirmation keyboard-safe and make active playback the first operational content.
- Reduce default visual density in grouped alerts, mobile navigation, Screen Effects forms, and asset filtering.
- Preserve typed APIs, route identity, dirty-navigation guards, selection/draft state, filter semantics, queue semantics, and existing failure handling.
- Cover changed behavior with focused unit, Storybook, Playwright, and multi-viewport browser evidence.

**Non-Goals:**

- No server, persistence, schema, matching, queueing, authorization, or output-routing changes.
- No new component library, modal/drawer system, dependency, route, or saved preference.
- No implementation of the earlier audit plan or standalone mobile alert-editor workspace.
- No production setting changes or real output dispatch during verification.

## Decisions

1. **Reuse `ModalSurface` for operator confirmation.** The invoking element is retained for restoration, Cancel receives initial focus, and a stable local heading is the fallback when refresh removes or disables the trigger. A second focus-trap implementation would duplicate shared behavior and drift from management confirmations.

2. **Reorder existing operator sections rather than derive a second playback view.** Connection and safety state stay first, current module occurrences follow, and queue/module controls follow current playback. Existing item identities and callbacks remain unchanged.

3. **Filter grouped alert presentation from unfiltered inventory presence.** A group is configured when any stored default or variation exists, regardless of enabled or validation state. Search and other filters operate after this visibility choice. The reveal control changes display only; the Add alert dialog always uses the full canonical catalog.

4. **Use an inline mobile navigation disclosure.** The existing link structure and guarded `onNavigate` path are reused. The disclosure owns only open/closed view state, closes after successful navigation, and stays contextual when dirty navigation is canceled. A drawer would add focus trapping and layering without benefit.

5. **Use scoped checkbox classes.** Screen Effects output controls reuse the existing inline checkbox rule. Shared media-audio markup is changed only if all consumers share the same contract; otherwise the Screen Effects caller supplies a scoped class.

6. **Keep primary asset filters permanently visible and secondary controls mounted in a disclosure.** Search and Type remain outside. Secondary values are not reset when collapsed. The badge count is derived from six non-default scalar fields plus individually selected tags, while the existing clear/reset semantics remain authoritative.

## Risks / Trade-offs

- **Configured-only alert defaults can make the complete catalog less obvious** → Keep a visible `Show unused event types` control and full-catalog Add alert workflow, with an empty-set creation prompt.
- **Operator content can still be pushed below the fold by safety or error notices** → Geometry acceptance uses the healthy populated fixture and explicitly permits actionable notices to consume space.
- **Mobile navigation state can conflict with async dirty-route confirmation** → Close only after the active route changes; cancellation preserves the open disclosure and current route.
- **Hidden active asset filters can confuse result counts** → Show a deterministic active-secondary count beside More filters and an accessible Clear filters action.
- **Shared checkbox changes could regress unrelated consumers** → Inspect consumers first and prefer caller-scoped CSS when contracts differ.
