## MODIFIED Requirements

### Requirement: External Payloads Are Kept Only For Declaring Consumers
The bus SHALL journal an external event's payload only when a registered consumer declared that event's exact identity, and only when the payload is a JSON object within 16 KiB. Declaring an identity SHALL subscribe the Streamer.bot source to it while Streamer.bot advertises it. The declaring consumer SHALL validate the payload with its own schema, and payloads SHALL NOT appear in diagnostics or logs.

#### Scenario: Video request broadcast
- **WHEN** a Streamer.bot General/Custom broadcast carries the `VideoRequest` marker or the retired `VideoShoutout` marker
- **THEN** it is published as an external bus event with its payload
- **AND** the Videos consumer validates it and submits it to the video queue intake
- **AND** Screen Effects and alerts that select General/Custom also receive it

#### Scenario: Undeclared identity
- **WHEN** an external event arrives whose identity no consumer declared
- **THEN** it is published without its payload
