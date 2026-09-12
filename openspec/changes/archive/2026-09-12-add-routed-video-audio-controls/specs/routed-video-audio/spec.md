## ADDED Requirements

### Requirement: Video Soundtracks Are Explicitly User Controlled
Every new video layer SHALL have an enabled-by-default `Play embedded audio` setting and independently bounded volume from 0 through 1. Adding, removing or enabling a separate sound SHALL NOT implicitly alter that setting. These controls SHALL be embedded in each owning Alert or Screen Effect editor, not a global mixer.

#### Scenario: User adds separate sound to a new video
- **WHEN** a new video layer has its soundtrack enabled and the user adds another sound
- **THEN** both sources remain enabled with independent volumes
- **AND** a nonblocking notice explains that both will play

#### Scenario: User disables the video soundtrack
- **WHEN** the user disables `Play embedded audio` and saves
- **THEN** future occurrences exclude that video's audio while retaining the video and separate sound

#### Scenario: Draft is undone
- **WHEN** a user changes the soundtrack toggle, volume or destinations and activates Undo before Save
- **THEN** that draft change is reversed without mutating active or pending playback

### Requirement: Legacy Videos Retain Silent Behavior
Legacy saved video layers without soundtrack fields SHALL deserialize and migrate with embedded audio disabled. New-layer construction SHALL be distinguished from legacy deserialization. Existing assets, layout, explicit sound and output selections SHALL be preserved.

#### Scenario: Old alert or variation is loaded
- **WHEN** an old persisted alert default or variation contains a video with an audio track but no soundtrack setting
- **THEN** its video remains silent until the user explicitly enables and saves embedded audio
- **AND** loading, previewing or testing does not make it newly audible

#### Scenario: Legacy backup is restored
- **WHEN** a valid backup with the old document schema is restored
- **THEN** the same silent migration applies to every legacy video layer
- **AND** the restored document round-trips with explicit soundtrack settings

#### Scenario: Configured video is duplicated
- **WHEN** a current alert or variation is duplicated
- **THEN** its soundtrack choice, volumes and item-wide destinations are copied and can subsequently diverge independently

### Requirement: Media Audio Is Resolved Before Visual Expansion
Enabled soundtracks SHALL resolve as explicit media-audio layers once per selected document, using logical layer identity, asset ID, source kind and volume. Visual video elements SHALL remain internally muted. All media-audio layers SHALL inherit the existing item-wide Browser Source flag and named route IDs without per-layer destinations.

#### Scenario: Video appears on two profiles and desktop
- **WHEN** the same selected document is visually expanded to several destinations
- **THEN** its enabled soundtrack plays once per selected physical device, not once per visual destination
- **AND** each browser recipient receives only its own selected browser-audio instructions

#### Scenario: Only device soundtrack is selected
- **WHEN** a valid video's visual destinations and Browser Source audio are off but an available device route and embedded audio are enabled
- **THEN** the occurrence can deliver the soundtrack without a visual recipient

#### Scenario: No audio outputs are selected
- **WHEN** Browser Source audio is off and no device routes are selected
- **THEN** video and explicit sound settings remain saved but emit no media audio
- **AND** visual playback and separately configured TTS keep their own behavior

### Requirement: Local Video Audio Uses Validated Bounded Assets
The runtime SHALL accept only registered local assets and explicitly supported video container/codec combinations for soundtrack delivery. It SHALL retain 25 MiB per transport asset, 100 MiB per batch and the 5-second preparation/start ceiling. It SHALL NOT automatically extract/transcode or fall back to another audio destination.

#### Scenario: Video has a supported soundtrack
- **WHEN** the selected local asset is within bounds and its audio track can be decoded
- **THEN** the shared media player delivers it through the selected Browser Source/device paths

#### Scenario: Video cannot supply playable audio
- **WHEN** the asset is missing, oversized, malformed or has an unsupported audio codec
- **THEN** the affected audio recipient fails with an actionable management result within the start deadline
- **AND** healthy explicit sounds and visual recipients are not blocked indefinitely

#### Scenario: Trackless video is selected
- **WHEN** an otherwise valid video has no audio track
- **THEN** no soundtrack is emitted and its audio obligation settles without holding the queue until transport timeout

### Requirement: Video And Soundtrack Share Occurrence Timing
Visual media and routed soundtracks SHALL share an occurrence start epoch, end deadline and media offset. Late recipients SHALL seek to elapsed media time or fail closed within the bounded start window; they SHALL NOT restart from zero or extend the occurrence.

#### Scenario: Device preparation finishes after visual start
- **WHEN** a healthy device becomes ready while the occurrence is still active
- **THEN** its soundtrack begins at the current media offset rather than the beginning
- **AND** it stops no later than the occurrence deadline plus the existing transport grace

#### Scenario: Preparation finishes after skip
- **WHEN** an asynchronous media load resolves after its occurrence was skipped or expired
- **THEN** it emits no audio or visuals and cannot acknowledge a replacement occurrence

#### Scenario: Combined playback is accepted
- **WHEN** packaged Windows and OBS acceptance tests exercise known audio/visual marker fixtures on the declared supported destinations
- **THEN** verification records onset skew and drift against the 150 ms local target
- **AND** a failing target remains an explicit capability decision rather than an unqualified synchronization claim

### Requirement: Shared Safety Controls Include Enabled Soundtracks
Global mute, stop, duration limits, recipient failure and generation validation SHALL apply to video-derived media audio as they do to uploaded explicit sound. Ordinary occurrence cleanup SHALL retain existing silence guarantees and SHALL NOT change TTS provider routing.

#### Scenario: Active video audio is muted
- **WHEN** authoritative global mute becomes enabled
- **THEN** browser and device soundtrack elements become muted immediately while video visuals continue
- **AND** newly connected/recreated recipients apply mute before starting media

#### Scenario: Stop does not acknowledge
- **WHEN** device playback has not acknowledged an occurrence stop within 2 seconds
- **THEN** the owned player is destroyed to guarantee silence before replacement delivery
- **AND** affected work is failed rather than silently left running
