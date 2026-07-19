## ADDED Requirements

### Requirement: Browser-Source Setup Shows Required Profile Dimensions
The management UI SHALL show the required width and height for every browser-source target profile together with concise manual setup guidance.

#### Scenario: Landscape source is ready
- **WHEN** a user expands the Landscape browser-source row
- **THEN** the row shows `1920 x 1080` and explains that the copied URL is added as a browser source

#### Scenario: Vertical source is ready
- **WHEN** a user expands the Vertical browser-source row
- **THEN** the row shows `1080 x 1920` and explains that the copied URL is added as a browser source

### Requirement: Revealed Route Keys Can Be Re-Masked
The management UI SHALL let a user hide a revealed browser-source URL without reloading or changing its route key.

#### Scenario: User hides revealed URL
- **WHEN** a browser-source URL is currently revealed and the user activates Hide
- **THEN** the same URL is immediately masked
- **AND** no server mutation or route-key regeneration occurs
