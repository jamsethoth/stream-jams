## ADDED Requirements

### Requirement: Alert Sample Preview And Tests Describe Their Effects

The management UI SHALL distinguish text-only saved sample inspection, local draft preview, draft delivery testing, and saved delivery testing using accurate accessible names and compact destination summaries.

#### Scenario: Saved sample message is inspected

- **WHEN** a user opens Sample message from an alert inventory row
- **THEN** the dialog explains that it shows sample text rather than the rendered design
- **AND** opening or closing it does not enqueue playback or play media

#### Scenario: Draft is previewed locally

- **WHEN** a user chooses Preview in the focused editor
- **THEN** persistent help identifies it as local and governed by the current preview audio and TTS options
- **AND** it does not dispatch media to configured live device routes

#### Scenario: Draft or saved alert is tested

- **WHEN** a user chooses Test draft in the editor or Test saved in inventory
- **THEN** the action uses the named draft or saved input respectively
- **AND** a compact summary names selected browser profiles, selected device destinations, and included audio or TTS where exposed by the existing contract
- **AND** unavailable destinations and correction actions remain visible without exposing route keys or secret URLs

### Requirement: Alert Profiles Share One Editor Draft

Landscape and Vertical selection SHALL change editor view state while preserving one shared unsaved alert document, its priority and content edits, and its undo and redo history.

#### Scenario: User edits both profiles before saving

- **WHEN** a user edits Landscape, switches to Vertical, edits Vertical, and returns to Landscape
- **THEN** no profile-switch save or discard prompt appears
- **AND** both profile edits remain in the shared draft with Unsaved visible
- **AND** switching does not enable or mark either profile reviewed

#### Scenario: Shared draft is saved or reverted

- **WHEN** the user explicitly saves or reverts after editing either profile
- **THEN** Save persists both profiles and Revert restores both profiles from the saved document
- **AND** switching profiles does not autosave

#### Scenario: User leaves the editor with a dirty draft

- **WHEN** a user navigates to another alert or management route with unsaved changes, including after a failed save
- **THEN** the existing dirty-navigation safeguard remains active

### Requirement: Alert Editor Summarizes Configuration Readiness

The focused editor SHALL present one compact Live readiness summary derived from current draft and saved-set facts, and SHALL distinguish configuration readiness from output connectivity or delivery evidence.

#### Scenario: Configuration has a correction

- **WHEN** blockers, an intended profile requiring review or enablement, a disabled alert, or an inactive set prevent configuration readiness
- **THEN** the summary names the highest-priority correction in that order
- **AND** provides one keyboard-operable action that focuses or opens the existing control or activation flow
- **AND** set activation continues through dirty navigation and existing impact confirmation

#### Scenario: Optional profile is disabled

- **WHEN** one valid reviewed enabled profile is intended and another profile is disabled or unreviewed
- **THEN** the optional profile does not prevent configuration readiness
- **AND** the system does not silently review or enable it

#### Scenario: Draft is configuration-ready

- **WHEN** the current draft satisfies known configuration prerequisites
- **THEN** the summary states whether the ready configuration is unsaved
- **AND** it does not claim that outputs are connected or real delivery succeeded
- **AND** unknown or stale evidence never produces an authoritative live-delivery claim

### Requirement: Alert Inventory Presents Primary And Secondary Actions Once

Each alert row SHALL keep Edit, Test saved, and Enable or Disable inline and SHALL expose Sample message, eligible Add variation, Duplicate, Reset, and Delete exactly once through the existing More disclosure at all supported widths.

#### Scenario: User operates row actions

- **WHEN** a keyboard user navigates an alert row at desktop or narrow width
- **THEN** each eligible secondary action appears once in the active accessibility tree
- **AND** More actions are keyboard-operable with useful focus restoration after dialogs and mutations

#### Scenario: Row content needs additional space

- **WHEN** an alert has a long name, validation summary, or multiple test profiles
- **THEN** row content and actions wrap without hiding primary actions
- **AND** default and variation rows retain their correct eligibility and disabled states
