## ADDED Requirements

### Requirement: Reward Conditions Use Catalog-Backed Readable Summaries
Alert condition summaries SHALL use the existing typed local reward catalog once per page context and SHALL preserve stored reward identifiers.

#### Scenario: Reward title is available
- **WHEN** a stored reward identifier matches a loaded catalog entry
- **THEN** the condition summary shows the reward title without changing the stored condition

#### Scenario: Reward title is unavailable
- **WHEN** the catalog cannot load or the stored identifier has no matching entry
- **THEN** the condition summary shows `Unavailable reward` and retains the identifier in secondary diagnostic details

### Requirement: Enabled Alert Attention Respects Rule And Route Semantics
The server SHALL derive Home alert-configuration attention from enabled default and variation inventory entries, intended visual profiles, route intent, and existing validation results, while preserving the active overview's existing zero-enabled-rules boundary.

#### Scenario: Enabled child variation needs attention
- **WHEN** the default variant is disabled but an enabled child variation requires configuration review
- **THEN** the alert appears in Home attention

#### Scenario: Unused visual profile needs review
- **WHEN** an enabled alert has one usable intended visual profile and an unused profile remains unreviewed
- **THEN** the unused profile alone does not place the alert in attention

#### Scenario: Route is device-only
- **WHEN** an enabled alert routes only resolved device audio and has no intended visual output
- **THEN** missing visual profiles alone do not mark the alert broken

#### Scenario: Saved configuration cannot be read
- **WHEN** an enabled alert document is missing, unreadable, or cannot be evaluated safely
- **THEN** the summary reports attention or unavailable and never an all-clear

#### Scenario: Editor readiness follows the current draft
- **WHEN** an operator changes the enabled profiles, content, or output destinations in the alert editor
- **THEN** readiness is derived from the current draft rather than retained inventory targets or saved validation issues

#### Scenario: Saved editor facts are reconciled
- **WHEN** an alert document saves successfully
- **THEN** the editor refreshes saved set facts without discarding edits made while the save was in flight

#### Scenario: Enabled content is empty
- **WHEN** an enabled alert has no visible browser content and no resolved device audio
- **THEN** Home and the editor require review instead of reporting configuration ready

#### Scenario: Device-only audio is configured
- **WHEN** an enabled alert has resolved device audio, no browser output, and no enabled visual profile
- **THEN** Home and the editor do not require a visual profile solely for that route

#### Scenario: Browser and device outputs are mixed
- **WHEN** resolved audio targets a device and Browser Source while an enabled browser profile still needs review
- **THEN** Home and the editor keep the browser-profile review requirement
