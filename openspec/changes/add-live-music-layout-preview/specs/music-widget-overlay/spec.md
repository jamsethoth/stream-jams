## MODIFIED Requirements

### Requirement: Live Failures Are Transparent And Preview Is Isolated
Empty, disconnected, authentication-failed, stale, malformed or disabled Music output SHALL be transparent without setup text, debug details or secrets. Management SHALL expose actionable status and mark retained evidence stale. Mock preview and explicit test output SHALL use the production renderer and SHALL never publish fixture data to live recipients or change the selected provider. While the selected source is connected, fresh and playing a track, the management preview SHALL render that track and its artwork through the production renderer and update as it changes; otherwise it SHALL render the sample track. The preview SHALL read live playback only through authorized management routes and SHALL NOT publish to live recipients.

#### Scenario: Source fails during live output
- **WHEN** Pear disconnects or requires authentication
- **THEN** live Music clears and management displays the cause and recovery action
- **AND** unrelated modules continue operating

#### Scenario: User previews appearance with mock metadata
- **WHEN** the user previews a mock track with unsaved appearance settings
- **THEN** only preview or the explicitly selected test output changes and live provider/settings remain intact

#### Scenario: Preview follows the playing track
- **WHEN** the selected source is connected and playing a track while the Music page is open
- **THEN** the layout preview shows that track's title, artists, album and artwork with the unsaved appearance settings
- **AND** it returns to the sample track when the source disconnects, goes stale or stops reporting a track
