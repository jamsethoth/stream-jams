# dev-obs-instance-guard Specification

## Purpose
Confine automated OBS changes to a portable dev OBS that cannot affect the maintainer's production OBS, and provide a repeatable way to build that dev OBS from production settings without copying anything that can go live.
## Requirements
### Requirement: OBS Automation Targets Only A Verified Dev Instance
Every automated obs-websocket client in tests or development scripts SHALL connect through a shared guard. Before the client's first request, the guard SHALL verify all of the following and close the connection if any check fails:
- the port is the configured dev port (4456 by default) and is not 4455;
- the process that owns the listening port runs `obs64.exe` from inside the configured dev OBS root;
- the current profile and scene collection are both named `StreamJamsDev`;
- the profile's `StreamJamsDevInstance` persistent-data value equals the instance ID in `<dev OBS root>\stream-jams-dev-obs.json`.

#### Scenario: Production OBS on 4455
- **WHEN** a test is configured with port 4455
- **THEN** the guard refuses without opening a connection

#### Scenario: Port owned by another OBS
- **WHEN** the dev port is owned by an `obs64.exe` outside the dev OBS root
- **THEN** the guard refuses before authenticating

#### Scenario: Marker mismatch
- **WHEN** the profile names match but the persistent-data instance ID differs from the marker file
- **THEN** the guard closes the connection, and no request is sent

### Requirement: Guarded OBS Clients Cannot Reach Live Outputs Or Devices
The guard SHALL reject these requests: `StartStream`, `StartRecord`, `StartReplayBuffer`, `StartVirtualCam`, `SetStreamServiceSettings`, output-section `SetProfileParameter`, and `CreateInput` of camera or audio-capture kinds (`dshow_input`, `wasapi_input_capture`, `wasapi_output_capture`).

#### Scenario: Test tries to start the virtual camera
- **WHEN** a guarded client sends `StartVirtualCam`
- **THEN** the guard rejects it locally, and OBS never receives it

### Requirement: Reusable Dev OBS Provisioning
A repository command SHALL build or refresh the portable dev OBS from the installed OBS and the production OBS configuration, treating both as read-only. It SHALL copy:
- the program files;
- the production Plugin Manager list, with the Stream Deck plugin disabled;
- the window and dock layout;
- the profile settings, without hotkeys, browser cookie identifiers, credentials or production recording folders;
- the Aitum layout and canvases, without outputs, stream keys, servers or output hotkeys;
- every scene collection, with the production active collection named `StreamJamsDev`.

It SHALL NOT copy a stream service, stream keys, or production `[Locations]`. In the copied collections it SHALL disable camera, DroidCam, game-capture and audio-capture sources; remove global audio devices; route browser-source audio into OBS with monitoring off; remove hotkeys; and remove the output-timer, scene-switcher, script and caption modules. It SHALL point every Stream Jams module browser source at the matching dev runtime output: it reuses an existing dev URL, and creates or regenerates a key only when the dev runtime has none. It SHALL refuse a production Stream Jams origin, a non-loopback origin, port 4455, a target folder that overlaps the install or production configuration or is not a marked dev OBS, and a running dev OBS. Re-running it SHALL keep the WebSocket password and instance marker.

#### Scenario: Fresh dev OBS from production
- **WHEN** the setup command runs against an empty dev folder while the dev Stream Jams is running
- **THEN** the dev OBS opens on profile and collection `StreamJamsDev` without the first-run wizard, passes `connectGuardedObs`, and its Stream Jams browser sources connect to the dev runtime
- **AND** no production OBS file, production Stream Jams credential or production overlay key is written, copied or contacted

#### Scenario: Dev runtime not running
- **WHEN** the setup command runs while the dev Stream Jams is unreachable
- **THEN** Stream Jams browser sources get a placeholder URL without any production key, and the command explains how to fill them in later with the sources command

#### Scenario: Production origin given
- **WHEN** the command is given `http://127.0.0.1:39187` as the Stream Jams origin
- **THEN** it refuses before reading or writing anything

### Requirement: Harnesses Never Write To An OBS Install
Test and setup code SHALL treat every OBS install directory, including `STREAM_JAMS_TEST_OBS_DIR`, as read-only. It SHALL create `portable_mode.txt` only inside the dev OBS root or a temporary copy.

#### Scenario: Portable marker aimed at the install
- **WHEN** a harness would create `portable_mode.txt` in the directory given as `STREAM_JAMS_TEST_OBS_DIR`
- **THEN** it fails before writing

