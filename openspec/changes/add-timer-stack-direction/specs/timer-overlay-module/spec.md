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
