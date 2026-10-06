# Management Component Consistency

## Purpose

Define the shared management presentation, feedback and interaction contracts while preserving local-first domain behavior and native output boundaries.

## Requirements

### Requirement: Management Shares A Mantine Presentation Foundation

Management SHALL use Mantine and a shared application theme for equivalent controls and interaction surfaces in migrated pages. Application-specific wrappers SHALL remain focused on product policy or demonstrated presentation reuse. Domain validation, APIs, auth, persistence and runtime actions SHALL remain outside shared presentation components.

The existing semantic CSS token and persisted theme-preference contract SHALL remain authoritative. Migration SHALL preserve native link behavior and canonical mobile reachability, locale formatting and direction.

#### Scenario: Equivalent controls appear on migrated pages
- **WHEN** a user opens two migrated management pages
- **THEN** equivalent command variants, field labels/help/errors, disabled/pending states and focus treatment follow the shared theme and component contracts
- **AND** page-specific data and mutation rules remain owned by their workflows

#### Scenario: A specialized editor control is retained
- **WHEN** a control requires raw numeric drafts, blur/Enter commits or canvas-specific interaction
- **THEN** migration preserves its behavior and documents the exception
- **AND** it does not introduce a generic field engine to force that control into a standard input

#### Scenario: Theme preference is restored and system appearance changes
- **WHEN** the user reloads with an existing theme preference or the OS theme changes while system mode is selected
- **THEN** Mantine and retained controls show the same effective theme using the existing preference key
- **AND** explicit light/dark overrides and storage-failure feedback remain effective without a second preference owner

#### Scenario: A narrow or RTL management page is used
- **WHEN** the page is shown at 390 CSS pixels or in an RTL locale
- **THEN** identity, current status and primary actions remain reachable without horizontal scrolling
- **AND** mobile navigation, native link behavior, direction and shared locale-aware formatting retain their existing contracts

### Requirement: Management Presentation Preserves Other Application Surfaces

Mantine management provider, styles and components SHALL remain outside Operator, live browser-source and private desktop-overlay rendering entry points. Existing provider-independent shared consumers and required CSS SHALL remain functional. Existing light/dark/system management preferences, production CSP and route bundle budgets SHALL remain effective.

#### Scenario: Management theme changes
- **WHEN** the user changes the supported management theme preference
- **THEN** migrated management controls follow that preference with readable status and visible keyboard focus
- **AND** overlay transparency and fail-closed error behavior remain unchanged

#### Scenario: A foundation component or shared style migrates
- **WHEN** management migrates a dependency also consumed by Operator or a private renderer
- **THEN** the other surface retains a provider-independent compatible component/style boundary
- **AND** Operator badges, timer adjustments, clear confirmation and focus/cancellation behavior continue to work without a Mantine provider
- **AND** built JS/CSS dependency graphs retain the declared surface isolation

#### Scenario: Provider initialization fails
- **WHEN** management provider or theme initialization throws
- **THEN** existing safe bootstrap/error recovery can render without relying on the failed provider
- **AND** the user retains a valid recovery action and safe diagnostic reference

### Requirement: Module Pages Share A Composed Presentation Order

Alerts, Screen Effects, Timers and Music SHALL share the order of inline blocking/stale feedback, saved module controls, output setup, primary workspace and optional secondary sections beneath the existing route header. The layout SHALL omit absent optional sections without blank containers and SHALL preserve module-specific workspaces and deep-link disclosure behavior.

#### Scenario: A module page opens at desktop or compact width
- **WHEN** the user opens any of the four module routes
- **THEN** enablement and output setup occupy equivalent locations before the primary workspace
- **AND** the route title is not duplicated as a second module title
- **AND** saved enablement remains distinct from runtime activity

#### Scenario: A correction link targets a secondary section
- **WHEN** a user follows a valid correction deep link
- **THEN** the owning page expands and focuses the existing target section
- **AND** the layout does not alter the route identity or write configuration

### Requirement: Shared Feedback Retains Actionable Context

Module command outcomes SHALL use the existing shared fixed feedback contract, retaining supported causes, correction links and reference IDs. Initial-load failures, stale refresh data and field validation SHALL remain inline in their affected workflow.

#### Scenario: A command succeeds or fails
- **WHEN** a migrated module command completes
- **THEN** shared transient feedback announces the result once without shifting the workspace
- **AND** dismissal and expiration follow the existing feedback contract
- **AND** a failure preserves available diagnostics and corrective action

#### Scenario: A navigation or selection save fails
- **WHEN** Save and leave or Save and continue fails while its review is open
- **THEN** the active review owns one actionable failure with available reference and correction context
- **AND** the page does not announce the same failure behind that review
- **AND** the retained draft and intended destination permit explicit retry or cancellation

#### Scenario: A navigation save requires live-impact consent
- **WHEN** a dirty provider subscription draft lacks its required live-impact confirmation
- **THEN** the review instructs the user to cancel and review the impact
- **AND** it does not issue a mutation or supply consent on the user's behalf

### Requirement: Shared Confirmations Prevent Duplicate Mutations

Shared confirmation dialogs SHALL support pending operations, explicit cancellation policy, scoped errors and target-owned confirmation reset. The owning workflow SHALL also guard duplicate submissions while an operation is in flight.

#### Scenario: Confirmation request remains pending
- **WHEN** the user confirms a destructive action and the request is deferred
- **THEN** exactly one request is issued despite repeated activation
- **AND** confirm and cancellation controls reflect the approved pending policy

#### Scenario: A non-abortable confirmation is pending
- **WHEN** a destructive request is in flight and its workflow cannot cancel it
- **THEN** confirm, cancel, close, Escape and outside-click dismissal are blocked
- **AND** the dialog does not imply cancellation or automatically retry the mutation

#### Scenario: Confirmation fails for the same target
- **WHEN** a request fails
- **THEN** the pending guard is released and scoped failure details remain reviewable
- **AND** the user can explicitly retry or dismiss without losing the reviewed same-target confirmation draft

#### Scenario: Confirmation reopens or changes target
- **WHEN** the dialog reopens or its stable target identity changes
- **THEN** target-owned typed confirmation and stale scoped errors reset
- **AND** closing restores focus to the trigger or a valid fallback when the trigger was removed or disabled

### Requirement: Shared Management Overlays Preserve Interaction Contracts

Management dialogs and action menus SHALL use the shared Mantine presentation boundary while retaining accessible naming, disabled/danger actions, focus behavior, dirty-navigation decisions and appropriate dismissal. A migration SHALL remove superseded custom focus/positioning/listener code after its callers move and SHALL preserve portal theme/direction and layering.

#### Scenario: A menu opens a dialog with a select
- **WHEN** a user opens a dialog from an action menu and opens an embedded select
- **THEN** the menu closes, focus transfers to the dialog and the select is visible and operable above it
- **AND** dismissal affects the intended surface and subsequent close returns focus to a valid workflow control

#### Scenario: Save and leave remains pending
- **WHEN** a dirty-navigation save is still in flight
- **THEN** repeated activation cannot issue another save or prematurely leave the workflow
- **AND** success, failure and cancellation follow the existing navigation decision contract

### Requirement: Tabs And Output Rows Share Appropriate Semantics

Real tabbed panels SHALL use one shared keyboard and panel association contract, retaining the existing automatic arrow/Home/End behavior. Timer profile selection SHALL use labelled value-selector semantics. Compatible module outputs SHALL reuse shared presentation while preserving URL security and output-specific metadata.

#### Scenario: A user navigates tabbed content with a keyboard
- **WHEN** the user enters a tab list and navigates or activates a tab
- **THEN** focus, selection and visible panel follow the canonical automatic activation contract
- **AND** tab/panel IDs resolve and inactive content does not create unintended keyboard stops

#### Scenario: An editor changes visible panels
- **WHEN** the user selects another panel and later returns
- **THEN** unsaved drafts and committed selection retain their existing lifecycle
- **AND** hidden panels do not gain new media playback or polling side effects from component mount defaults
- **AND** existing preview/resource cleanup remains effective

#### Scenario: A user inspects a module output
- **WHEN** the user reveals, copies or regenerates a browser-source URL
- **THEN** masking, readiness, dimensions where applicable and stale/listener metadata use shared presentation
- **AND** existing purpose scoping, clipboard behavior and regeneration confirmations remain effective

### Requirement: Production Migration Preserves Existing Workflows

Production migration SHALL preserve canonical asset and module contracts, media behavior, dirty-state protection, validation, persistence and deep links. Sample prototype behavior SHALL NOT replace production behavior. Changed production presentation SHALL receive proportional Storybook, interaction and live browser verification.

#### Scenario: Assets migrates first
- **WHEN** the user searches, filters, imports, previews, edits, replaces or deletes a production asset
- **THEN** all existing compatible controls, collapsed secondary filters, media playback, usage impact and stable-ID behavior remain effective
- **AND** invalid uploads and in-use deletion retain existing safeguards

#### Scenario: A migration slice is delivered
- **WHEN** a page family completes adoption
- **THEN** superseded presentation implementations and unused styles are removed after callers move
- **AND** affected tests, theme/RTL/compact/state stories and rebuilt live workflow evidence demonstrate preserved behavior before a later slice depends on it
- **AND** every management route is accounted for as migrated or a documented specific exception

#### Scenario: The foundation slice is delivered
- **WHEN** provider, global styles, shared menu or modal surfaces change
- **THEN** representative existing management routes and cross-surface consumers pass their compatibility checks before Assets migration depends on the foundation
- **AND** browser/Storybook verification exercises real portals and focus behavior, production CSP and route budgets
