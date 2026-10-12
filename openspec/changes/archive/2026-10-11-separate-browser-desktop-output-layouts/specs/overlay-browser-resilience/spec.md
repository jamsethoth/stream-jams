## MODIFIED Requirements

### Requirement: Management Test Audio Can Be Activated In Place
Ordinary browser outputs SHALL apply the same transparent failure policy to manually submitted and subscribed events. They SHALL NOT expose an audio activation prompt or retain failed audio for an automatic later retry merely because event provenance is manual. Management SHALL explain required OBS/browser audio setup and allow an explicit new manual submission after correction. Local editor previews SHALL retain their own explicit audio activation controls without becoming a separate event output.

#### Scenario: Browser blocks manual-event audio
- **WHEN** a manually submitted event reaches ordinary output and audio playback requires user activation
- **THEN** that failed playback follows the existing transparent failure/report contract and renders no operator control on stream
- **AND** management reports the setup correction and an explicit new submission is required to play again

#### Scenario: Browser blocks subscribed-event audio
- **WHEN** subscribed event audio is rejected for the same reason
- **THEN** identical failure handling applies without an on-stream prompt or retained auto-retry

#### Scenario: Editor preview needs activation
- **WHEN** the operator enables audio in a local editor preview
- **THEN** the preview's explicit gesture may activate its local playback without publishing a bus event or sending device audio
