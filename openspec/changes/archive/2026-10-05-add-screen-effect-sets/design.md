## Context

User approved set → effect → variant hierarchy and confirmed only one set should be live. Existing definitions have stable IDs and coordinated media variants, but no set membership. Build on the approved presentation change in this branch.

## Goals / Non-Goals

Provide persistent sets and the familiar Alerts hierarchy. Keep existing effect documents and their media, bindings, IDs and enabled flags intact on migration. Multiple live sets, trigger grouping beyond effects and shared effect membership are outside scope.

## Decisions

- Store membership separately from effect documents so existing document contracts and queued snapshots remain compatible. Every new effect is assigned atomically; existing effects enter Default.
- Require case-insensitive unique set names and use stable generated IDs. Create and duplicate produce inactive sets. Duplication clones all child IDs and keeps media references; activation remains explicit.
- Protect active-set deletion. Switching active sets is transactional and confirmed; only enabled members of the active set match subsequent trusted triggers. Already admitted occurrences retain snapshots, matching existing semantics. Explicit saved tests remain separately confirmed.
- Reuse protected management routes and typed clients. Set changes run through the existing maintenance boundary.
- Module page expands selected set and effect disclosures. Variant actions enter the editor with the selected variant in the URL. Editor selection keeps unsaved-navigation guards.
- Follow UX spec Alerts Module, Sets Page, Alert Editor and Cross-Cutting UX Rules. This extends the approved post-MVP module.

## Risks / Trade-offs

- Migration must preserve all existing children and output references; test upgrade and restart with populated data.
- Activation can race with async admission; define selection at admission snapshot and verify events after activation use the new active set.
- Normal profile is currently running an older schema; rebuild and stop the owned service before relaunching. Preserve a backup before migration.

## Verification

Test repository transactions, unique names, activation, deletion guards, copying, migration, API protection, active-set filtering, inactive editing, dirty navigation, hierarchy and variant deep links. Run affected-package checks and browser/Storybook gates. Inspect rebuilt UI with isolated data before updating the user's running instance.
