# Architecture maintenance contracts

## Purpose

Keep service, persistence, output and browser boundaries explicit while sharing proven transformations and removing unused implementation paths.

## Requirements

### Requirement: Explicit safe output and wire contracts
Configured outputs MUST implement mute operations, and domain clients MUST validate settings and diagnostics responses using authoritative browser-compatible schemas. Whole optional output absence SHALL remain supported.

#### Scenario: Unsupported configured output
- **WHEN** an output lacks a required mute operation
- **THEN** admission or safety application fails explicitly instead of reporting success

#### Scenario: Malformed successful response
- **WHEN** settings or exports contain wrong types or missing required fields
- **THEN** the domain client rejects them before components consume them

### Requirement: Substitutable persistence and private capability boundaries
Provider and timer credential services MUST consume typed repositories. Timer rotation SHALL remain atomic and verifier-only. Music artwork capability SHALL be explicitly present or absent and remain server-private.

#### Scenario: Failed rotation
- **WHEN** persistence rejects a rotation
- **THEN** no new token is returned and the previous credential remains valid

#### Scenario: Absent or obsolete artwork
- **WHEN** a source has no artwork capability or ownership is obsolete
- **THEN** resolution returns no artwork without exposing private descriptors

### Requirement: Single ownership of shared implementation
Shared playback identity and ports MUST have neutral ownership. Music SHALL use the production subscription/output pipeline without an alternative unused sink. Duration mapping and template preview SHALL use shared implementations; unused snapping/version wrappers SHALL be removed while retaining actual validation. Editors SHALL declare only their required dependencies and group dialog-owned state.

#### Scenario: Slow Music recipient
- **WHEN** revisions arrive during blocked delivery or source replacement
- **THEN** pending delivery remains bounded and obsolete ownership cannot publish

#### Scenario: Reopened dialog
- **WHEN** a failed create or variation dialog closes and reopens
- **THEN** its draft and error reset while focus and validation semantics remain intact

#### Scenario: Shared transformation
- **WHEN** supported callers project duration candidates or preview templates
- **THEN** they share the exact transformation while retaining caller-specific fallback and display policies
