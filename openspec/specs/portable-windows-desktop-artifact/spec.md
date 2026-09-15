# Portable Windows Desktop Artifact Specification

## Purpose

Define authenticated, short-lived CI publication of the verified Windows x64 desktop package, including its traceable identity, integrity metadata, contents, and operational limits.

## Requirements

### Requirement: Eligible CI Runs Publish Only Verified Desktop Artifacts
The CI workflow SHALL publish the Windows x64 desktop package only after the existing packaging command and packaged desktop test suite complete successfully in the same job. Publication SHALL be limited to pushes to `main` and explicitly dispatched workflow runs.

#### Scenario: Main build passes packaged verification
- **WHEN** a push to `main` completes Windows desktop packaging and all packaged desktop tests successfully
- **THEN** CI publishes the tested runnable folder as a workflow artifact

#### Scenario: Manual build passes packaged verification
- **WHEN** an explicitly dispatched workflow run completes Windows desktop packaging and all packaged desktop tests successfully
- **THEN** CI publishes the tested runnable folder as a workflow artifact identified with the selected ref and commit SHA

#### Scenario: Packaging or verification fails
- **WHEN** Windows desktop packaging or any packaged desktop test fails or is cancelled
- **THEN** CI does not publish a runnable desktop artifact for that job

#### Scenario: Pull request desktop job passes
- **WHEN** the Windows desktop job succeeds for a pull-request event
- **THEN** CI does not publish the runnable desktop artifact

### Requirement: Artifact Identity And Integrity Are Traceable
Each portable desktop artifact SHALL identify Windows x64, the selected ref, and the full source commit SHA. GitHub's immutable artifact digest SHALL be retained as the SHA-256 identity for the downloadable archive, and the workflow summary SHALL record the authenticated artifact URL, digest, ref, commit SHA, unsigned status, and retention policy.

#### Scenario: Artifact upload succeeds
- **WHEN** CI uploads an eligible desktop artifact
- **THEN** the artifact name and workflow summary unambiguously identify its platform, architecture, ref, and source commit
- **AND** the summary exposes the artifact service's SHA-256 digest and authenticated download URL

#### Scenario: Expected package folder is absent
- **WHEN** the artifact upload step cannot find the expected `Stream Jams-win32-x64` output folder
- **THEN** the job fails instead of publishing an empty or partial artifact

### Requirement: Artifact Contents Exclude Runtime State And Secrets
The artifact SHALL contain the complete packaged application folder required to launch Stream Jams and SHALL exclude source staging, test evidence, temporary profiles, user configuration, databases, assets, credentials, live overlay URLs, and other machine-specific state. Workflow permissions SHALL remain read-only and hidden-file upload SHALL remain disabled.

#### Scenario: Maintainer extracts the artifact
- **WHEN** an authenticated maintainer downloads and extracts the artifact
- **THEN** the extracted files include the complete runnable Windows application folder
- **AND** no `.stream-jams` profile, operating-system credential, live route key, temporary test profile, or source staging directory is present

#### Scenario: Artifact publication is configured
- **WHEN** the workflow uploads the portable desktop artifact
- **THEN** publication requires no release-write, package-write, identity-token, or repository secret permission

### Requirement: Portable Artifacts Are Bounded And Documented
Portable desktop artifacts SHALL expire after 30 days and SHALL require authenticated GitHub access. The runbook SHALL document download, digest verification, complete-folder extraction, launch, manual replacement, unsigned Windows warnings, expiry, and the separation between portable application files and persistent user data or credentials.

#### Scenario: Maintainer installs an artifact for local use
- **WHEN** a maintainer follows the documented portable-artifact procedure
- **THEN** they can identify the intended run and commit, verify its displayed digest, extract the complete folder, and launch `Stream Jams.exe`
- **AND** the instructions explain that Windows may warn about the unsigned binary

#### Scenario: Maintainer replaces an older artifact
- **WHEN** a maintainer quits Stream Jams and replaces the prior application folder with a newer verified artifact
- **THEN** existing `.stream-jams` data and operating-system keyring credentials remain outside the application folder and are not presented as portable content

#### Scenario: Artifact reaches its retention limit
- **WHEN** 30 days have elapsed or the associated run or artifact is deleted earlier
- **THEN** the authenticated download URL is no longer guaranteed to work and no permanent release availability is implied
