## ADDED Requirements

### Requirement: Asset Event Labels Are Readable
The asset library SHALL display readable event labels while retaining original event values for filtering and API requests.

#### Scenario: Event label contains delimiters
- **WHEN** an asset event value is `channel_point_redemption` or another delimited value
- **THEN** the UI shows a sentence-cased readable label and submits the original value unchanged
