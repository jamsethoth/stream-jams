## ADDED Requirements

### Requirement: Packaged Windows Entry Point Is Validated
The validation workflow SHALL exercise the actual packaged Windows application in addition to existing CLI/runtime tests and SHALL detect dependencies or paths that accidentally rely on the source checkout.

#### Scenario: Packaged smoke runs with an isolated profile
- **WHEN** Windows desktop validation launches the packaged executable with an isolated temporary profile outside the checkout
- **THEN** it verifies health, built management assets, SQLite persistence, packaged native keyring availability, and ordinary owned-process shutdown
- **AND** it does not access or replace the operator's live profile

#### Scenario: Package is incomplete
- **WHEN** a production workspace dependency, web asset, or required native binary is missing from the packaged layout
- **THEN** desktop validation fails rather than passing based only on development startup

#### Scenario: Interactive lifecycle is accepted
- **WHEN** the desktop change is accepted for delivery
- **THEN** Windows evidence covers tray hide/reopen, default and disabled close behavior, duplicate launch, port conflict, and no owned listener after Quit
