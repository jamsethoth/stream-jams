## ADDED Requirements

### Requirement: GPU Acceleration Is On By Default With A Restart-Applied Opt-Out
The system SHALL persist `desktop.gpuAcceleration`, default it to true (including for saved configurations without the field), and expose it as an explicit desktop-only management setting beside the close-to-tray preference. Because the desktop host decides hardware acceleration before it is ready, the main process SHALL mirror the saved value to a validated preference file in its Electron profile and SHALL read that file at the next launch, treating a missing, unreadable or malformed file as enabled. A change SHALL take effect only at the next launch, and the management UI SHALL say so. Turning it off is the fallback when the GPU process keeps the desktop app from exiting after Quit.

#### Scenario: Default launch
- **WHEN** the desktop app starts without a saved GPU preference
- **THEN** hardware acceleration remains enabled

#### Scenario: Operator turns GPU acceleration off
- **WHEN** an operator clears **Use GPU acceleration** and saves desktop settings
- **THEN** the preference is persisted and mirrored to the launch preference file
- **AND** the management UI notes that the change applies after Stream Jams restarts
- **AND** the next launch disables hardware acceleration before the app is ready

#### Scenario: Launch preference is damaged or cannot be written
- **WHEN** the launch preference file is malformed or unreadable at startup
- **THEN** hardware acceleration remains enabled
- **AND WHEN** mirroring the saved value to that file fails
- **THEN** the failure is recorded as a local desktop diagnostic and the service setting remains authoritative

#### Scenario: Invalid setting is submitted
- **WHEN** a desktop settings update carries a non-boolean or unknown field
- **THEN** it is rejected with an actionable validation error and nothing is persisted or applied
