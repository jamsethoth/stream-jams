## ADDED Requirements

### Requirement: Timer Stack Direction Is Configurable
Each Timer profile appearance SHALL offer four stack directions: top to bottom, bottom to top, left to right and right to left.

A reversed direction SHALL place the first card in visible order at the bottom (vertical) or right (horizontal) end of the reserved footprint, with later cards stepping toward the start. The overflow badge SHALL sit at the start end, before every card. Direction SHALL NOT change the sort order, the browser content canvas size, the reserved footprint or the saved desktop placement.

Desktop placement MAY override the reverse flag for the desktop overlay only. When it has no override, the desktop overlay SHALL follow the profile appearance. Configurations saved without a direction SHALL keep the original top-to-bottom or left-to-right behaviour.

#### Scenario: Bottom-anchored stack lists soonest timer at the bottom
- **WHEN** the operator saves Bottom to top and six timers are active with four visible
- **THEN** the browser source shows the timer with the least time remaining in the bottom slot and the next three above it
- **AND** the "+2 more" badge sits above the topmost card, without changing the browser canvas size

#### Scenario: Desktop keeps its own direction
- **WHEN** the browser source direction is Bottom to top and the desktop direction is set to Top to bottom
- **THEN** the desktop overlay lists the soonest timer at the top with the badge below the cards, and the browser source stays reversed

#### Scenario: Older configuration keeps its direction
- **WHEN** a saved Timer configuration has no direction
- **THEN** it validates unchanged and renders top to bottom or left to right as before

### Requirement: Timer Card Shadow Is Configurable
Each Timer profile appearance SHALL offer a card shadow with X and Y offset, blur, spread and an RGBA color, using the same shadow fields as the Music widget. A fully transparent color SHALL mean no shadow.

The browser content canvas SHALL reserve a transparent margin on each side sized from the shadow, and no margin when the shadow is off. Configurations saved without a shadow SHALL keep the original card shadow and the original 48/40/48/56px margin.

#### Scenario: Shadow off starts the stack at the source corner
- **WHEN** the operator turns the Timer shadow off and saves
- **THEN** the browser source content canvas shrinks to the stack's footprint and the first card sits at its top-left corner

#### Scenario: Older configuration keeps its shadow
- **WHEN** a saved Timer configuration has no shadow
- **THEN** cards render with the original shadow and the browser content canvas keeps its original size
