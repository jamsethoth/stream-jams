## MODIFIED Requirements

### Requirement: Desktop Scope Remains A Runnable Folder
The desktop delivery SHALL remain a runnable Windows application folder. CI SHALL be permitted to publish that existing folder as a short-lived authenticated workflow artifact only after packaged verification succeeds. The desktop delivery SHALL NOT introduce an installer, code signing, durable release publication, automatic updates, startup-at-login, a Windows service, portable user state, or secret-store migration.

#### Scenario: Desktop build is completed
- **WHEN** the packaging command succeeds
- **THEN** it produces a runnable Windows x64 folder and does not install, sign, create a durable release, configure an update feed, move user state beside the executable, or alter login startup behavior

#### Scenario: Verified CI artifact is published
- **WHEN** an eligible CI run packages and verifies the runnable Windows x64 folder successfully
- **THEN** CI may expose that exact folder as a bounded authenticated workflow artifact without changing its runtime behavior, user-data paths, or credential storage
