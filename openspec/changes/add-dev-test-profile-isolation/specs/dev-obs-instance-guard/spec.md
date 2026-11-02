## ADDED Requirements

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

### Requirement: Harnesses Never Write To An OBS Install
Test and setup code SHALL treat every OBS install directory, including `STREAM_JAMS_TEST_OBS_DIR`, as read-only. It SHALL create `portable_mode.txt` only inside the dev OBS root or a temporary copy.

#### Scenario: Portable marker aimed at the install
- **WHEN** a harness would create `portable_mode.txt` in the directory given as `STREAM_JAMS_TEST_OBS_DIR`
- **THEN** it fails before writing
