## MODIFIED Requirements

### Requirement: Log Level And Retention Are Configurable
The system SHALL support configurable runtime log level and retention policy with safe defaults of `INFO` level and 48-hour retention, and SHALL apply that retention window to both runtime log files and relational diagnostic history.

#### Scenario: Retention removes old logs
- **WHEN** log retention runs with files older than the configured retention period
- **THEN** old log files are removed while current log files remain available

#### Scenario: Retention removes old relational diagnostics
- **WHEN** maintenance runs with event, alert-match, or playback diagnostic rows older than the configured retention period
- **THEN** expired rows are removed in bounded batches
- **AND** rows at or newer than the cutoff remain available

#### Scenario: Rows share the retention timestamp
- **WHEN** more expired rows share one timestamp than fit in a pruning batch
- **THEN** repeated maintenance batches delete each expired row deterministically by timestamp and ID
- **AND** newly appended rows remain writable between batches
