## ADDED Requirements

### Requirement: Credential Names Are Scoped By Profile
The OS-backed secret store SHALL name every credential `<prefix>:<namespace>:<name>`, with account `<accountId>`. The prefix SHALL come from the runtime profile: `stream-jams` for `production`, `stream-jams-dev` for `dev`, and `stream-jams-test-<runId>` for `test`, where `STREAM_JAMS_KEYRING_PREFIX` supplies the test run ID. A `dev` or `test` runtime SHALL never read, write or delete a credential with the `stream-jams` prefix.

#### Scenario: Dev connects music without touching production
- **WHEN** a `dev` runtime pairs Pear Desktop
- **THEN** it creates or reads `stream-jams-dev:music:client-id`, and the production `stream-jams:music:client-id` entry is unchanged

#### Scenario: Test run cleanup
- **WHEN** a desktop test run with prefix `stream-jams-test-<runId>` finishes
- **THEN** the harness deletes every credential with that prefix and no other credential
