## ADDED Requirements

### Requirement: Curated Starter Theme Catalog Is Bounded And Universal
The system SHALL provide exactly the `clean-signal`, `bold-pop`, and `neon-terminal` curated starter themes, SHALL default to `clean-signal`, and SHALL support every canonical event type with landscape `1920x1080` and vertical `1080x1920` profiles. Themes SHALL contain only text and solid-fill shape layers and SHALL NOT introduce assets, dependencies, migrations, external fonts, arbitrary CSS/HTML/JS, marketplace/download behavior, or persistent theme linkage.

#### Scenario: Catalog is requested for a canonical event
- **WHEN** a management client requests or selects a starter theme for any canonical event type
- **THEN** all three themes are available with Clean Signal identified as the default
- **AND** each theme provides valid landscape and vertical output

#### Scenario: Theme output is bounded
- **WHEN** a theme is materialized
- **THEN** its composition contains only text and solid-fill shape layers
- **AND** no asset, external resource, arbitrary presentation code, or saved theme reference is required

### Requirement: Curated Theme Blueprints Preserve Approved Visual Treatments
The materializer SHALL use a 2.5% internal inset, an eyebrow in the upper 20–25% of its panel, and the remaining panel area for the message. Clean Signal SHALL use translucent navy `#07111DDE`, cyan `#53D8FBFF` accent, system sans 56px/800 message, fade 300ms ease-out, and panels `(15,66,70,22)%` landscape and `(9,66,82,18)%` vertical. Bold Pop SHALL use axis-aligned magenta `#EF3F8FFF`, cyan `#16D9D2FF`, and yellow `#FFD34EFF` blocks behind dark `#171321F2`, rounded sans 64px/800 message, scale 300ms ease-out, and unrotated overlapping rectangles around `(18,67,64,20)%` landscape and `(11,64,78,20)%` vertical. Neon Terminal SHALL use near-black `#020805F2`, green `#31F577FF` top rule and shadow, monospace 52px/700 message, slide-up 300ms ease-out, and panels `(14,66,72,20)%` landscape and `(8,64,84,20)%` vertical.

#### Scenario: Selected theme is materialized
- **WHEN** Clean Signal, Bold Pop, or Neon Terminal is selected
- **THEN** the generated text, shapes, colors, typography, animation, and profile geometry match that theme's approved treatment
- **AND** Bold Pop's blocks remain axis-aligned and unrotated

### Requirement: Theme Materialization Is Deterministic And Validated
The system SHALL materialize a selected starter theme deterministically and idempotently, SHALL derive stable layer identity and order from the document identity, theme ID, and semantic role, and SHALL return output validated by the alert editor document schema. Fixed-profile geometry SHALL use explicit target layouts, integer scaling/rounding, and remain in bounds.

#### Scenario: Same input is materialized twice
- **WHEN** the same document identity, canonical event input, and theme ID are materialized twice
- **THEN** the outputs have the same layer IDs, order, and content
- **AND** each output validates as an alert editor document

### Requirement: Alert Creation Selects A Starter Theme Compatibly
The management alert-create input SHALL accept an optional validated starter theme ID and SHALL parse an omitted value as `clean-signal`. The Add alert workflow SHALL show an event-scoped accessible chooser and SHALL always submit its selected theme.

#### Scenario: Existing caller omits theme
- **WHEN** an existing create caller submits a valid event type and name without a theme ID
- **THEN** the parsed input uses `clean-signal`
- **AND** the created editor document is materialized with Clean Signal

#### Scenario: Operator chooses a theme for a new alert
- **WHEN** an operator selects Bold Pop or Neon Terminal in Add alert and submits
- **THEN** the request includes the selected validated theme ID
- **AND** the created alert has that theme's ordinary editable document

### Requirement: Existing Alert Re-theming Preserves Behavior And Resets Visual Review
The focused editor SHALL require an explicit `Apply theme` action before applying a starter theme to an existing draft. Application SHALL preserve alert identity, name, event type, matching and variation behavior, cooldown, priority, duration, samples, template variables, audio, and TTS; SHALL replace text, shape, image, and video composition; SHALL disable the alert; SHALL mark both profiles `needs-review`; and SHALL preserve profile availability.

#### Scenario: Operator applies a theme to an existing draft
- **WHEN** an operator confirms `Apply theme` in the focused editor
- **THEN** the selected theme replaces the draft's visual composition while preserving its nonvisual behavior and profile availability
- **AND** the alert is disabled and both profiles require review
- **AND** existing undo, dirty-state, save, and live-impact behavior apply to the updated draft

#### Scenario: Operator opens then cancels the chooser
- **WHEN** an operator opens the starter-theme flow but does not activate `Apply theme`
- **THEN** the editor draft remains unchanged
- **AND** no alert state or review state is changed

### Requirement: Re-theming Preserves The Primary Message Deterministically
When applying a starter theme, the system SHALL choose the primary message from a text layer named `Message` case-insensitively, then the first visible text layer by order, then the first text layer by order, and finally the canonical starter message. Applying a theme SHALL materialize an ordinary editable document, and future catalog changes SHALL NOT silently mutate an existing alert.

#### Scenario: Existing alert contains text layers
- **WHEN** an operator applies a theme to an alert with a case-insensitive `Message` text layer
- **THEN** the resulting theme message uses that layer's message
- **AND** other visual layers are replaced

#### Scenario: Existing alert has no text layers
- **WHEN** an operator applies a theme to an alert with no text layers
- **THEN** the resulting theme message uses the canonical starter message
- **AND** later catalog changes do not alter the saved materialized document

### Requirement: Theme Previews And Review Guidance Are Actionable
The management UI SHALL render resolved read-only landscape and vertical previews for each chooser option and SHALL provide confirmation and post-application guidance that visual composition is replaced, nonvisual behavior is preserved, the alert is disabled, both profiles require review, and the draft must be saved.

#### Scenario: Operator views a theme chooser
- **WHEN** an operator opens starter-theme selection for a canonical event
- **THEN** each option exposes readable landscape and vertical previews with resolved sample text rather than raw template placeholders
- **AND** the controls remain keyboard-operable and accurately reflect the selected value

#### Scenario: Theme is applied
- **WHEN** the editor applies a starter theme
- **THEN** it shows guidance to review both profiles and save the draft
- **AND** the guidance does not imply that a catalog link will update the alert later
