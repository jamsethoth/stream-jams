# Desktop Shutdown Diagnostics Specification

## Purpose

Define opt-in bounded shutdown evidence and staged silent reproduction that distinguish application cleanup from native process exit without changing runtime policy or claiming the intermittent shutdown issue is resolved.

## Requirements

### Requirement: Shutdown Phase Logging Is Opt In And Bounded
The desktop SHALL support an optional absolute path for a new exclusively created JSONL file. Logging SHALL accept only fixed phases and generated version, launch, PID, attempt, sequence and time fields. It SHALL NOT await disk work during Quit, exceed 256 records or 64 KiB of accepted data, overwrite evidence, delete files automatically or expose secrets.

#### Scenario: Logging is disabled or path is invalid
- **WHEN** no path is configured or the path is relative
- **THEN** no file is opened and normal shutdown is unchanged

#### Scenario: Writing fails or reaches its bound
- **WHEN** the file exists, cannot be opened, a write fails or a bound is reached
- **THEN** logging stops without throwing into or delaying application cleanup
- **AND** existing evidence is not overwritten

#### Scenario: Sensitive fields are supplied
- **WHEN** a call includes an invalid phase or extra payload fields
- **THEN** those values are not persisted

### Requirement: Evidence Distinguishes Cleanup From Native Exit
The desktop SHALL record pending/accepted/cancelled decisions, service-stop requested/completed/failed, audio/window teardown and Electron quit events with monotonic timing. Quit events and incomplete records SHALL NOT be classified as confirmed native exit or a known crash cause.

#### Scenario: User cancels or does not answer
- **WHEN** a quit decision is pending or cancelled
- **THEN** evidence distinguishes that state from teardown
- **AND** no diagnostic timeout grants consent

#### Scenario: Native shutdown is delayed
- **WHEN** Electron quit events occur but captured native processes remain alive
- **THEN** the external reproduction records native observation failure separately
- **AND** it retains evidence and does not force cleanup

### Requirement: Reproduction Is Staged And Silent
Developer diagnostics SHALL compare persistent windows, those windows with explicit-output silent playback, then the same fixture with the owned service. They SHALL use the same Electron runtime, unchanged sandbox settings, isolated data and zero-signal/zero-volume fixtures. Native observation SHALL retain the fifteen-second deadline and stop the batch on failure.

#### Scenario: A stage completes normally
- **WHEN** captured processes exit and any owned service listener stops
- **THEN** the runner records the outcome without asserting the intermittent issue is fixed

#### Scenario: A requested output is absent
- **WHEN** System or SFX cannot resolve to distinct explicit devices
- **THEN** the stage fails without default-device fallback
