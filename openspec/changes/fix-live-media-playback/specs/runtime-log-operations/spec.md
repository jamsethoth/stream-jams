## ADDED Requirements

### Requirement: Playback Diagnostics Distinguish Observed Outcomes
The system SHALL record bounded per-output playback preparation and start timing evidence, terminal outcome, and outstanding recipients when watchdogs expire. Timed completion SHALL NOT conceal sustained media stalls. Diagnostics SHALL preserve configured destinations and normal-speed playback without corrective seeking.

#### Scenario: A playback obligation never completes
- **WHEN** an occurrence watchdog expires
- **THEN** a timeout diagnostic identifies the occurrence and bounded outstanding recipients even if cleanup succeeds

#### Scenario: Media stops progressing
- **WHEN** started media sustains a lack of playback progress
- **THEN** it reports a stalled failure rather than successful duration completion and releases resources for subsequent content
- **AND** transient buffering, intentional teardown and normal loop wrap do not generate false failures

#### Scenario: Outputs start at different times
- **WHEN** prepared recipients start an occurrence
- **THEN** bounded diagnostics preserve scheduled and observed start timing and preparation duration for comparison without per-frame logging

### Requirement: Overlay Transport Failures Retain Evidence
Overlay transport diagnostics SHALL preserve bounded sanitized send exceptions and close details, deduplicate connection failure reports, and record subsequent reconnection without exposing route credentials or raw payloads.

#### Scenario: A send fails and the socket closes
- **WHEN** a current overlay connection encounters a send failure followed by close
- **THEN** diagnostics retain the original failure without repeatedly reporting the same connection failure

### Requirement: Corrupt Runtime Records Do Not Hide Valid Evidence
Runtime log reads SHALL retain valid records when individual records are malformed or incomplete, report the number skipped without copying damaged content, and distinguish incomplete evidence from requested-limit truncation.

#### Scenario: A crash leaves a partial JSONL record
- **WHEN** diagnostics reads a file containing valid records and a partial or invalid record
- **THEN** valid records remain readable and exportable and a bounded diagnostic identifies skipped records and incomplete coverage
- **AND** corrupt raw text and secrets are never included in that diagnostic
