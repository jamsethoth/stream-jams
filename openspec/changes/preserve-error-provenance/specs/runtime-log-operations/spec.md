## ADDED Requirements

### Requirement: Raw Diagnostics Preserve Structured Exception Provenance
The system SHALL record the available redacted type, message, stack, code, causal chain and non-Error thrown value for an operational exception in a dedicated bounded exception field at the boundary that owns the failure. The owner SHALL assign one stable reference and intermediaries SHALL propagate without duplicate logging. Historical log records without this field SHALL remain readable.

#### Scenario: Nested operational exception reaches its owner
- **WHEN** an operation fails with an exception containing a code and nested causes
- **THEN** Raw logs retain the bounded redacted exception structure with the same stable reference
- **AND** intermediate layers do not replace or separately log the failure

#### Scenario: Historical runtime log is read
- **WHEN** a JSONL record predates the structured exception field
- **THEN** diagnostics reads the record with a null exception
- **AND** the historical message and context remain available

#### Scenario: Non-Error value is thrown
- **WHEN** application code receives a thrown primitive or cross-realm error-like value
- **THEN** the serializer produces a bounded safe exception structure without throwing

### Requirement: Diagnostic Failure Does Not Discard The Original Failure
The system SHALL use an independent bounded synchronous fallback when the normal serializer, redactor or JSONL writer cannot record an owned failure. A logging failure SHALL NOT recursively report itself or replace the original failure.

#### Scenario: Normal JSONL append fails
- **WHEN** the normal logger cannot append an exception record
- **THEN** the emergency path records the logger-stage failure and bounded original exception using independent conservative sanitization
- **AND** logging does not create another unhandled rejection

#### Scenario: Cleanup also fails
- **WHEN** cleanup fails while handling a primary exception
- **THEN** diagnostics retains the primary exception as primary evidence
- **AND** the cleanup failure is linked as secondary evidence using the same reference

### Requirement: Production Catch Paths Preserve Or Explicitly Classify Failures
Production code SHALL classify caught failures as propagate, enrich with `cause`, own and log, convert a documented expected outcome, or secondary cleanup. Cleanup failure SHALL NOT replace primary evidence. Static verification SHALL reject catch paths that silently discard operational exceptions and SHALL require reasoned expected or cleanup exemptions.

#### Scenario: Context is added to a failure
- **WHEN** a layer replaces an exception with an operation-level error message
- **THEN** the replacement uses the original exception as its standard cause

#### Scenario: Expected non-error outcome is ignored
- **WHEN** a catch represents documented parsing, availability or cleanup behavior rather than an operational failure
- **THEN** the local exemption names the expected or cleanup classification and a non-empty reason
