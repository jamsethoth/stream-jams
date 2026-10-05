## ADDED Requirements

### Requirement: Mobile Management Navigation Uses A Compact Disclosure
At the existing compact-navigation breakpoint, management SHALL show a short product/current-section header and an initially collapsed Navigation button that reveals all existing destinations in one readable column while desktop navigation remains unchanged.

#### Scenario: Mobile route opens directly
- **WHEN** a management child route opens at the compact breakpoint
- **THEN** the collapsed header identifies Stream Jams and the current section within approximately 120 CSS pixels of height
- **AND** hidden navigation links are not keyboard reachable
- **AND** the page has no horizontal overflow at 390 CSS pixels wide

#### Scenario: Navigation disclosure is operated by keyboard
- **WHEN** a keyboard user activates the Navigation button
- **THEN** the button exposes `aria-expanded` and `aria-controls`
- **AND** existing destinations appear in a single column with Modules and its children visibly grouped
- **AND** Escape closes the disclosure and restores focus to the button without trapping focus

#### Scenario: Mobile navigation succeeds
- **WHEN** a user follows a destination and the guarded route transition succeeds
- **THEN** the active route and `aria-current` update through the existing route boundary
- **AND** the disclosure closes

#### Scenario: Dirty navigation is canceled
- **WHEN** an unsaved-change confirmation cancels a requested mobile route transition
- **THEN** the active route does not change
- **AND** the navigation disclosure and current route context remain available

#### Scenario: Desktop navigation is rendered
- **WHEN** management is wider than the compact breakpoint
- **THEN** the existing sidebar hierarchy and every current destination remain visible without disclosure interaction
