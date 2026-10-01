# local-media-streaming

## Purpose

Define bounded, version-pinned registered local media delivery and its integrity, authorization, lifetime and playback guarantees.

## Requirements

### Requirement: Supported Local Media Uses Bounded Delivery
Registered PNG, JPEG, WebP, GIF, MP4, WebM video, MP3, WAV, Ogg, and WebM audio SHALL be delivered through bounded file streams for applicable management previews, browser sources, desktop visuals, and selected-device audio. Original media bytes, transparency, codec data, and current import limits SHALL be preserved. Playback delivery SHALL NOT accumulate complete media bodies or transfer them through desktop IPC.

#### Scenario: Accepted large video supplies audio
- **WHEN** an accepted video larger than 25 MiB and no larger than the current 100 MiB import limit has a supported soundtrack and an available selected device
- **THEN** its file size SHALL NOT disqualify soundtrack playback
- **AND** playback SHALL retain the selected route and original media bytes

#### Scenario: Supported visual media is delivered
- **WHEN** a registered image, GIF, or transparent video is loaded on a compatible surface
- **THEN** the native element SHALL consume its authorized streamed resource
- **AND** application transport SHALL NOT construct a complete fetched-media Blob

#### Scenario: Codec is unsupported
- **WHEN** an accepted container contains media the recipient cannot decode
- **THEN** that recipient SHALL report a bounded decode failure without automatic conversion or rerouting

### Requirement: Playback Pins A Consistent Asset Version
The system SHALL pin media version identity and duration at the same transient admission boundary. All later preparation and range reads for that occurrence SHALL use that version. Pins SHALL be released on rejection, purge, skip, completion, terminal failure, or owner loss. Persistent module presentations and management previews SHALL have separately bounded lifetimes.

#### Scenario: Queued media is replaced
- **WHEN** a registered asset is replaced after an occurrence was admitted
- **THEN** the queued occurrence SHALL retain its original bytes and duration snapshot
- **AND** future admissions SHALL use the replacement

#### Scenario: Several recipients share a version
- **WHEN** one recipient completes while another authorized recipient still needs the version
- **THEN** the version SHALL remain readable for the remaining owner

#### Scenario: Timer presentation remains active
- **WHEN** a timer icon remains on a persistent module presentation
- **THEN** its media ownership SHALL remain valid for that presentation revision
- **AND** visibility/reorder changes SHALL NOT prematurely revoke its media

### Requirement: Retired Versions Are Recoverably Reclaimed
Replacement/deletion cleanup SHALL retain pinned versions until owners and active readers release them. Retirement intent SHALL survive process interruption and SHALL be reconciled with authoritative asset metadata before deletion. Cleanup SHALL only delete explicitly retired managed versions and SHALL never delete a current registered file or an unrelated file.

#### Scenario: Replacement completes during a range read
- **WHEN** new asset metadata commits while an old-version response is active
- **THEN** that response and subsequent authorized reads from existing owners SHALL continue using the old version
- **AND** old storage SHALL become eligible for cleanup after its final owner and reader release it

#### Scenario: Process stops during replacement
- **WHEN** the service restarts with an incomplete retirement record
- **THEN** it SHALL protect the version referenced by current metadata and idempotently reconcile retired storage
- **AND** grants from the prior service generation SHALL be invalid

### Requirement: Streaming Preserves Integrity And Path Confinement
Only registered pinned assets with supported MIME types and valid size/version metadata SHALL be readable. File access SHALL remain within the configured asset root after resolving filesystem links. Desktop preparation SHALL retain pre-playback checksum verification using bounded incremental reads, sharing verification within a preparation group. Missing, changed, or mismatched files SHALL fail before affected playback starts.

The application SHALL NOT add media-body caching or reuse successful checksum results across preparation groups. In-flight verification sharing SHALL be limited to recipients of the same preparation group. The streaming integrity claim SHALL distinguish initial checksum verification plus managed immutability/change detection from the current verified in-memory byte snapshot.

#### Scenario: File differs from its registered checksum
- **WHEN** desktop preparation detects a size or checksum mismatch
- **THEN** it SHALL reject the affected media with an integrity-stage diagnostic
- **AND** it SHALL NOT start playback and discover the mismatch only after delivery

#### Scenario: File link escapes the asset root
- **WHEN** a registered storage path resolves through a symlink or junction outside the configured root
- **THEN** file access SHALL be rejected without reading the target

#### Scenario: Several destinations prepare one version
- **WHEN** multiple recipients prepare the same pinned file version together
- **THEN** verification SHALL be shared without retaining the complete file in memory
- **AND** cancellation by one recipient SHALL NOT invalidate a remaining healthy owner

#### Scenario: A later occurrence prepares the same asset
- **WHEN** a new preparation group uses a version verified by an earlier group
- **THEN** it SHALL perform fresh verification rather than reuse the earlier checksum result

### Requirement: Media Grants Are Narrow Revocable Capabilities
Media grants SHALL authorize only GET/HEAD reads of their pinned versions, SHALL be unguessable, and SHALL be bound to their issuing session or trusted runtime owner and generation. They SHALL NOT authorize management actions, arbitrary URLs, or arbitrary filesystem paths. Expiry, revocation, and owner loss SHALL cancel affected open responses and reject later reads. Grant secrets SHALL be excluded from logs, diagnostics, exports, and saved documents.

#### Scenario: Grant is reused outside its scope
- **WHEN** a request uses a grant for another asset, version, recipient, or generation
- **THEN** access SHALL fail before revealing media bytes or metadata

#### Scenario: Revoked grant has an active response
- **WHEN** its owner is revoked or expires
- **THEN** the response SHALL be cancelled and its file handle released
- **AND** subsequent range requests SHALL fail

### Requirement: Resource Limits Bound Streaming Work
The shared media service SHALL initially allow at most 256 concurrent media response streams with 64 KiB file-read high-water marks and 4,096 live grants. Existing queue, layer, recipient, and document limits SHALL continue. Capacity exhaustion SHALL reject new work with a bounded actionable failure without evicting active owners. Each response SHALL close its stream and handle on completion, cancellation, disconnect, or error.

#### Scenario: A consumer reads slowly
- **WHEN** an authorized response cannot drain as quickly as disk reads
- **THEN** backpressure SHALL bound application read buffering without accumulating the remaining file

#### Scenario: Service reaches capacity
- **WHEN** new media work would exceed a declared limit
- **THEN** new work SHALL fail with a capacity reason and existing valid playback SHALL keep its ownership

#### Scenario: Repeated seeks are cancelled
- **WHEN** media elements abandon successive range requests
- **THEN** abandoned readers SHALL release their buffers, handles, and capacity slots
- **AND** active-reader counts SHALL return to baseline after playback stops

### Requirement: Streaming Retains Output Timing And Safety
Streaming SHALL retain preparation-before-scheduled-start, actual-onset duration/fades, normal-speed playback, existing start/stall/completion deadlines, muted visual videos, explicit device routing, and recipient failure isolation. Stop SHALL silence buffered media as well as revoke access. Interrupted content SHALL NOT replay on recovery.

#### Scenario: Media is ready before full download
- **WHEN** a recipient has enough decoded data to begin
- **THEN** it SHALL settle preparation without waiting for the entire file and retain that element for scheduled playback

#### Scenario: Stop follows successful buffering
- **WHEN** an occurrence is stopped after some data has already buffered
- **THEN** its player SHALL pause and detach media sources in addition to cancelling streams
- **AND** existing host-stop enforcement SHALL guarantee silence for an unresponsive owned player

#### Scenario: Streaming acceptance is evaluated
- **WHEN** the change is considered complete
- **THEN** tests SHALL cover every supported format on applicable paths and demonstrate large-video audio, transparent video, explicit gain/routing, version replacement, cancellation, and bounded application transfer memory
- **AND** packaged Electron and physical OBS/device evidence SHALL be identified separately from browser-only tests
