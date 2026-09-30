# Routed Video Audio Specification

## Purpose

Define explicit video-soundtrack authoring, migration, routing, bounded playback, synchronization, and safety behavior for alert and screen-effect media.

## Requirements

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
Visual media and routed soundtracks SHALL prepare before sharing a scheduled occurrence start epoch. Healthy media SHALL start from zero at normal speed. Actual media onset SHALL anchor its full configured playback interval and envelope, while separate bounded preparation, startup and completion watchdogs release failures. Late startup SHALL NOT cause catch-up seeking, rate changes or a strict skew cutoff.

#### Scenario: Device preparation finishes slowly
- **WHEN** a configured device needs longer to prepare its media than another participating output
- **THEN** healthy prepared outputs wait for preparation to settle before a common future start is selected
- **AND** preparation time does not consume the clip's playback interval

#### Scenario: Preparation finishes after skip
- **WHEN** an asynchronous media load resolves after its occurrence was skipped or expired
- **THEN** it emits no audio or visuals and cannot acknowledge a replacement occurrence

#### Scenario: Combined playback is accepted
- **WHEN** packaged Windows and OBS acceptance tests exercise known audio/visual marker fixtures on the declared supported destinations
- **THEN** verification records onset skew and the physical destinations tested
- **AND** approximate simultaneous start is acceptable without claiming frame-perfect synchronization

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

### Requirement: Routed Video Soundtracks Use Normalized Envelopes
The system SHALL carry explicit soundtrack fade durations and effective source playback duration in normalized video-audio instructions.

#### Scenario: Browser route plays video audio
- **WHEN** a video soundtrack is enabled on a browser-routed Alert or Screen Effect
- **THEN** its element volume SHALL follow the normalized envelope from actual audio onset until its effective playback duration or media end

#### Scenario: Device route plays video audio
- **WHEN** a video soundtrack is routed to an explicit device
- **THEN** device playback SHALL use the same normalized envelope and effective duration as browser playback, anchored to actual audio onset

#### Scenario: Video audio is disabled
- **WHEN** embedded video audio is disabled
- **THEN** soundtrack fade settings SHALL NOT create an audio playback instruction

### Requirement: Playback Failure Causes Survive Recipient Boundaries
Desktop visual and selected-device audio failures SHALL retain bounded original stage and exception evidence through IPC to operator logs, including resolved audio results containing failed route IDs. Playback SHALL use only configured destinations and SHALL NOT introduce fallback devices or browser audio.

#### Scenario: Desktop video preparation fails
- **WHEN** a private overlay video fails during an active occurrence
- **THEN** the original failure envelope reaches host diagnostics and the occurrence fails transparent
- **AND** the failure alone does not mark the renderer connection unavailable

#### Scenario: Selected device fails
- **WHEN** source creation, device binding, metadata, seek, decode, play or device disappearance fails
- **THEN** the affected configured routes and original failure stage are reported
- **AND** healthy configured recipients continue without rerouting the failed audio

#### Scenario: Unavailable selected route
- **WHEN** a Screen Effect's selected route cannot be prepared or its result contains failed route IDs
- **THEN** the failure is logged even if the playback promise resolves normally

### Requirement: Prepared Outputs Start Content Together From The Beginning
Participating browser-source, desktop-overlay and configured audio outputs SHALL prepare their media before the coordinator chooses a shared near-future start. Media SHALL start from the beginning at normal speed. Small differences in actual startup SHALL NOT cause catch-up seeks, rate changes or suppressed clips. Preparation SHALL NOT consume the configured playback interval.

#### Scenario: Actual playback starts slightly late
- **WHEN** a prepared media element starts after the scheduled epoch
- **THEN** its playback interval and volume envelope use its actual onset
- **AND** its tail is not truncated or muted early because of startup latency
- **AND** a separate bounded watchdog still releases genuinely stalled work

#### Scenario: One output loads slowly
- **WHEN** a short clip takes more than 150 ms to become ready on one output
- **THEN** ready outputs remain silent and hidden until all participating preparations settle
- **AND** the coordinator schedules the same future start on healthy prepared outputs, retaining their actual media elements
- **AND** each plays from zero at normal speed for its configured interval

#### Scenario: Preparation fails or is cancelled
- **WHEN** a recipient fails, disconnects, stalls beyond the preparation deadline, or the occurrence is stopped
- **THEN** its preparation obligation and media resources are released
- **AND** cancelled callbacks cannot start or affect a replacement occurrence
- **AND** a failed recipient does not prevent healthy configured recipients or subsequent occurrences from playing

### Requirement: Failed Output Targets Recover Automatically
Owned desktop renderers SHALL recover from repeated crashes or connection stalls without requiring manual retry. Recovery SHALL use bounded delays and honor shutdown and output configuration. Browser sources SHALL reconnect with bounded delays. Recovery SHALL restore the target for subsequent content without replaying interrupted transient occurrences.

#### Scenario: Repeated renderer failure
- **WHEN** an owned output renderer fails more than once
- **THEN** the interrupted occurrence may fail
- **AND** subsequent playback waits for bounded automatic recovery and uses the recovered output
- **AND** no unselected audio destination is added

#### Scenario: Output reconnects after an interrupted clip
- **WHEN** a target reconnects after its active clip was interrupted
- **THEN** subsequent clips can play
- **AND** reconnect does not seek into or replay the interrupted clip
