## MODIFIED Requirements

### Requirement: Local Video Audio Uses Validated Bounded Assets
The runtime SHALL accept only registered local assets and explicitly supported video container/codec combinations for soundtrack delivery. It SHALL use scoped streaming references subject to the existing media import limits and bounded streaming resource limits, replacing the 25 MiB per transport asset and 100 MiB bulk-batch restrictions. It SHALL retain the 5-second preparation/start ceiling and SHALL NOT automatically extract/transcode or fall back to another audio destination.

#### Scenario: Video has a supported soundtrack
- **WHEN** the selected local asset is within its media import bounds and its audio track can be decoded
- **THEN** the shared media player delivers it through the selected Browser Source/device paths
- **AND** a video between 25 MiB and the video import limit is eligible for device soundtrack delivery

#### Scenario: Video cannot supply playable audio
- **WHEN** the asset is missing, outside its media import bounds, changed, malformed, or has an unsupported audio codec
- **THEN** the affected audio recipient fails with an actionable management result within the start deadline
- **AND** healthy explicit sounds and visual recipients are not blocked indefinitely

#### Scenario: Trackless video is selected
- **WHEN** an otherwise valid video has no audio track
- **THEN** no soundtrack is emitted and its audio obligation settles without holding the queue until transport timeout

## ADDED Requirements

### Requirement: Streamed Soundtracks Preserve Explicit Device Gain
The private audio player SHALL consume authorized media under its own origin and SHALL preserve configured device selection, deduplication, volume, amplification, fades, and mute. It SHALL NOT replace a scoped stream with arbitrary network/file access or silently fall back to a full-body transfer.

#### Scenario: Streamed audio uses amplification
- **WHEN** a supported streamed soundtrack uses gain above 100 percent
- **THEN** the Web Audio path SHALL produce audible output only on the selected device without CORS-induced silence

#### Scenario: Two routes identify the same device
- **WHEN** a streamed layer has two selected route IDs resolving to one physical device
- **THEN** it SHALL play once on that device while retaining both route identities for diagnostics
