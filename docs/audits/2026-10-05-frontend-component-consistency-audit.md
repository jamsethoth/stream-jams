# Frontend component and module presentation audit

Baseline: `a8ff45d7d6abc19ff8979a6c7d155eef4859b04d`, October 5, 2026. This is a source-grounded audit and refactor recommendation, not implementation approval. Production source, configuration and dependencies are unchanged.

## Findings

### F1 — P2: Module action feedback bypasses the shared feedback contract

Evidence: `ScreenEffectsPage.tsx:176-177` renders success and action errors as inline paragraphs, and its `message()` helper at line 265 reduces errors to a string. `ScreenEffectEditor.tsx:297` also inserts action notices into the workspace. `TimersPage.tsx:144-145` renders an off-screen success announcement and manually constructed error banners. By contrast, `AlertSetsPage.tsx:730-731` uses ManagementToast/ManagementErrorToast, and Settings, Assets and Providers also reuse them.

This contradicts the current UI guideline and UX spec: transient command feedback should use a fixed viewport toast; initial-load failures, stale refresh, field validation and decision-required warnings should remain inline. Current implementations differ in placement, expiration, dismissal and retained diagnostic metadata. This finding does not propose converting every error into a toast.

Repair: migrate module command outcomes to the existing typed toast components; use ManagementErrorBanner for blocking/stale/validation states. Preserve actionable causes, available reference IDs and correction links instead of flattening them into strings. Keep load, refresh and command errors distinguishable in each page's state.

Acceptance: successful commands do not shift the workspace; failures retain correction/Diagnostics information; loading and stale state remain inline; keyboard/screen-reader announcements occur once; notice expiration and dismissal match the shared contract.

### F2 — P2: Tab interactions are duplicated and Timer profile tabs have incomplete semantics

Evidence: `TimerStackEditor.tsx:72` declares a tablist with two role=tab buttons, but supplies neither roving tabIndex, tab/panel linkage nor arrow-key handling. Its preview below is a plain div. `DiagnosticsPanel.tsx:304-324`, `AlertEditorPage.tsx:1107-1129` and `ScreenEffectEditor.tsx:366-375` independently implement selection, IDs and keyboard navigation.

The Timer control is operable as ordinary buttons, but the declared tab widget does not implement the corresponding keyboard and panel contract. Repeating that contract across features invites further drift. [WAI-ARIA tabs guidance](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) defines active-tab focus, arrow navigation and associated tab panels.

Repair: add one small controlled Tabs/TabPanel presentation primitive for real tabbed content. If Timer profile selection is better represented as a constrained value selector, use a native select or radio group instead. Do not use tabs for ordinary action buttons or route navigation. Keep activation mode explicit and preserve editor focus/state on selection.

Acceptance: Tab enters the active tab once; arrows navigate appropriately; IDs/aria-controls/aria-labelledby resolve; selection and panel visibility agree; inactive content does not create unintended keyboard stops. Cover manual versus automatic activation where required.

### F3 — P2: The shared destructive dialog cannot express an in-flight operation

Evidence: `foundation/DestructiveConfirmationDialog.tsx:4-14` has no pending/busy prop, and its confirm button in the action footer is disabled only by typed confirmation. `AssetManager.tsx:231-244` sets busy while awaiting deletion, but leaves deleteItem set until the request completes, and `AssetManager.tsx:320` cannot pass busy to the dialog. The handler has no busy guard. The open dialog consequently permits another confirmation while deletion is pending. Module pages instead hand-build confirmation footers with their own busy checks.

The shared dialog also retains its confirmation text in component state while closed. Typed confirmation is presently used by its story/test, rather than its two production callers; resetting it on reopen/target change is a prerequisite for wider use, not a claim of a current production typed-confirmation bypass.

Repair: make the common confirmation presentation support pending state, scoped error content and controlled cancellation policy. Guard duplicate submissions in the owning workflow as well as disabling the button. Reset target-owned confirmation when reopening/changing targets. Use it for module enable/disable, delete and URL regeneration only after preserving each action's approved consequence and typed-confirmation rules.

Acceptance: a deferred request permits one submission; errors remain reviewable; cancel/reopen and different targets reset confirmation; focus returns correctly; impact details remain explicit. Do not introduce a generic mutation engine or change high-risk confirmation requirements merely to share markup.

### F4 — P3: Module pages share a shell but independently place module controls and section chrome

Evidence: `ManagementApp.tsx:104-126` already owns navigation, PageHeader, route description and outer content. Alerts place module status/actions with the Alert sets heading (`AlertSetsPage.tsx:760-769`); Effects do so with a second Screen Effects heading (`ScreenEffectsPage.tsx:171-175`); Timers do so with a second Timers heading (`TimersPage.tsx:150`); Music uses a detached action row (`MusicPage.tsx:181`). All four already put browser sources before their primary workspace, but there is no common internal module-page contract.

Repair: retain the existing application shell and introduce a modest ModulePageLayout plus ModuleControls presentation. Standardize placement of module enablement, source/output setup, the primary workspace and secondary settings. Reuse section headings/actions rather than repeating route titles. Pages retain their own data fetching, enablement confirmation, dirty state, persistence, polling and domain-specific content.

Acceptance: all four module routes render the same module-control/output/workspace order, with consistent desktop/compact layouts. Missing optional sections leave no blank containers. Saved module enablement remains distinct from runtime activity. Existing deep links and default disclosure states continue to work.

### F5 — P3: Browser output rows repeat an existing shared component

Evidence: `foundation/BrowserSourceRow.tsx:5-15` already supplies readiness, dimensions, telemetry, setup guidance, masked/revealed URL and an action slot; Music consumes it at `MusicPage.tsx:164-168`. Alerts duplicate those fields around `AlertSetsPage.tsx:1223-1248`; Timers duplicate them at `TimersPage.tsx:179`. Effects uses a different list/MaskedValue presentation at `ScreenEffectsPage.tsx:168`, without the same per-profile guidance.

Repair: reuse BrowserSourceRow for compatible Alerts/Timers output rows. Adapt its presentation for Effects' module/unified outputs without inventing dimensions or profile semantics absent from that output contract. Allow explicit supplemental metadata where necessary. Keep URL creation, clipboard work, regeneration, secret reveal and status polling with the caller or its existing domain controller. BrowserSourcesPanel already provides useful shared disclosure and summary presentation; extend its use instead of replacing it.

Acceptance: output masking/reveal/copy, dimensions, readiness and stale/listener telemetry agree across applicable pages; action names remain accessible; regeneration rules and purpose-scoped keys remain unchanged. Do not hide security policy in a reusable row.

### F6 — P3: Section/disclosure presentation and layout rules have multiple owners

Evidence: timer and Effects section headings independently use flex alignment/gap/space-between (`timers.css:13-20`, `screen-effects.css:16-23`); Alerts has another heading rule (`alert-sets-page.css:20`); Music owns section and disclosure components (`MusicPage.tsx:223-229`, `music.css:4-7`). Settings independently implements controlled native details sections (`SettingsPanel.tsx:324`). Page gaps also vary: Timers 18px, Effects 20px, while section/action spacing is feature-owned.

These are maintenance duplication and a consistency opportunity, not evidence that every differing gap is wrong. Color tokens are already widely reused. Preview canvases and raw log surfaces intentionally use specialized colors; blanket replacement of all literal colors would be inappropriate.

Repair: introduce shared SectionHeading, ModuleSection and DisclosureSection presentation with one spacing/typography/responsive policy. Prefer native details for disclosure where its behavior fits; keep an explicit controlled form for deep-link/focus requirements. Let callers own expansion, rollups and headings. Keep inventory trees and canvas/editor panels specialized. Promote only genuinely common spacing/radius values into semantic tokens.

Acceptance: consistent heading levels, spacing and compact wrapping; collapsed summaries retain blockers/warnings; correction deep links expand the right section; IDs remain unique; no nested-card styling introduced.

### F7 — P3: Common controls are standardized mainly through CSS, without a small typed component contract

Evidence: the management AST inventory found 316 button, 150 input, 52 select and 6 textarea JSX sites across 62 production management TSX files. These counts are occurrences, not defects. `App.css:647-694` supplies shared button variants, but pages assemble class strings themselves. Field labels/help/errors are assembled locally; MusicNumberField (`music/MusicNumberField.tsx:3-12`) and StyleNumberInput (`alerts/editor/AlertEditorPage.tsx:1895`) have specialized validation/commit rules. There is no common management Button/FormField API in the current foundation inventory.

Repair: add a small native-element-based Button/ActionLink, FormField, action-row and empty/loading-state set where repeated usage justifies it. Give command buttons explicit variants, sizes, pending/disabled behavior and a safe default type=button. FormField should consistently associate label/help/error IDs while callers retain native input semantics. Reuse existing status, error, toast, modal and menu components. Preserve specialized raw numeric draft, blur/Enter commit and domain validation rules; do not automatically merge every numeric input into one configurable field engine.

Acceptance: labels and validation help remain associated, form submit intent remains explicit, native attributes and refs remain available, long labels wrap, keyboard focus is visible, and primary/destructive controls have consistent semantics. Disclosure, canvas handles, tab and menu buttons need their own interaction contracts and should not be mechanically replaced with command-button styling.

## Existing strengths and scope

The foundation already includes PageHeader/Breadcrumbs, StatusBadge, ModalSurface, ActionMenu, shared feedback, MaskedValue, BrowserSourcesPanel/BrowserSourceRow, destructive/dirty-navigation dialogs and formatting helpers. ManagementApp owns the route shell; EventSourcesPage and TtsProvidersPage already share ProviderPage. Colors use semantic CSS variables. Production components are used in Storybook with interaction/accessibility gates. These should be retained.

The scan inventoried all 62 production management TSX files, excluding named tests/stories. Manual tracing concentrated on all four module landing pages, shared foundation components, Alerts/Effects editors, TimerStackEditor, Providers, Assets, Settings, Audio and Diagnostics. Operator and live/private overlay boundaries were checked to establish reuse limits; their full runtime/render behavior was not re-audited. This is not a line-by-line correctness audit of every hook or a rendered visual/accessibility certification. Source and existing test/story coverage were inspected; no browser, service or test suite was launched for this read-only audit. The previous repair suite's green results do not establish compliance with the new proposed component contracts.

## Recommended presentation contract

Yes: a common module-page presentation is appropriate. Use composition with ordinary JSX/typed props. React documents children as a way to let wrappers accept arbitrary content, and cautions against fragile child introspection/manipulation. See [React composition through children](https://react.dev/learn/passing-props-to-a-component) and [Children caveats](https://react.dev/reference/react/Children). The slot names below are a Stream Jams design recommendation, not a React-mandated standard.

Common order beneath the existing PageHeader:

1. Blocking/stale feedback inline; transient toasts at the shared fixed viewport location.
2. Module controls: saved enabled/disabled state and the explicit enable/disable action.
3. Browser sources/output setup: compact, usually collapsed, with readiness/connection summary.
4. Primary workspace: set hierarchy for Alerts/Effects, countdown inventory for Timers, preview/appearance for Music.
5. Secondary sections: layout, advanced appearance/CSS, credentials or other module-specific settings, with explicit disclosure policy.

Conceptual API (not implemented):

```tsx
<ModulePageLayout
  feedback={feedback}
  controls={<ModuleControls /* controlled saved state and actions */ />}
  outputs={<BrowserSourcesPanel /* controlled output summary */ />}
  secondary={secondarySections}
>
  <ModuleSection title="Alert sets" actions={setActions}>
    {alertSetHierarchy}
  </ModuleSection>
</ModulePageLayout>
```

The layout owns placement and presentation only. It must not accept ManagementApi, fetch data, build output URLs, normalize provider events, perform mutations, or decide whether a module may run. Use named ReactNode slots where content placement matters and children for the primary workspace. Avoid cloneElement, child-type inspection, a schema-generated page engine or a long list of feature booleans.

Other page families should compose the same primitives but keep appropriate structures: integration setup, assets/inventory, settings/diagnostics and focused canvas editors. Focused editors need a separate EditorLayout if shared regions justify one. The Operator console emphasizes immediate controls; live overlays must stay transparent and fail closed. They should not inherit the management-page template.

## Migration and enforcement

1. Fix F1–F3 behavioral/accessibility gaps, using existing feedback and modal foundation.
2. Add the minimal layout/section/control primitives with real Storybook stories for loading, empty, error, pending, long copy, dark theme and compact width. Document the supported props and exceptions.
3. Migrate one inventory module and Music first to prove that the template handles different workspaces without feature flags; then migrate the remaining module pages and shared output rows.
4. Migrate repeated controls in other page families incrementally. Delete superseded styles and helper markup only after verified callers move. Preserve domain controllers and approved workflows.
5. Add parameterized page-contract tests for all four modules: common order, enablement controls, output summaries, errors and keyboard behavior. Add focused primitive tests for tabs, modal pending/reset/focus, fields and native button semantics. Keep route-level Playwright workflows for persistence, dirty navigation, correction links and output security.
6. After adoption, use targeted lint/import checks to require the shared components for equivalent patterns in migrated modules, with documented native/specialized exceptions. Storybook and UI tests validate behavior; do not mistake a raw HTML ban for semantic consistency. Avoid a global ban on buttons, inputs or CSS.

Keep the library local to apps/web's existing foundation until another application needs the same UI. No new component dependency, package or inheritance hierarchy is justified by this audit. A future implementation should have an OpenSpec change and scoped slices; this audit itself authorizes no product refactor, commit, push or PR.
