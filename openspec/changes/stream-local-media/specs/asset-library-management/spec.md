## MODIFIED Requirements

### Requirement: Global Asset Changes Report Usage Impact
The system SHALL keep asset references by stable asset ID and SHALL show affected usages before replacing or deleting an in-use asset. Newly admitted playback and newly acquired previews SHALL resolve replacements, while existing owners SHALL retain their pinned media and duration version until release. Retired storage SHALL be reclaimed only after its final owner and active reader release it.

#### Scenario: In-use asset is replaced
- **WHEN** a user confirms replacement after reviewing affected usages
- **THEN** the system keeps the asset ID, updates derived metadata and preview, and reports compatibility warnings
- **AND** every compatible future reference resolves to the replacement file
- **AND** already admitted playback retains its original version and duration

#### Scenario: In-use asset deletion is guarded
- **WHEN** a user requests deletion of an asset with active references
- **THEN** the system blocks deletion or requires explicit reassignment through the approved destructive-confirmation pattern

#### Scenario: Unused asset is not automatically deleted
- **WHEN** an asset has no current usages
- **THEN** the system retains it until a user confirms deletion

## ADDED Requirements

### Requirement: Registered Media Previews Use Session-Owned Streams
Registered-asset previews across Assets, Alerts, Screen Effects, and Timers SHALL acquire read-only media URLs through the existing authenticated management client rather than fetch complete media Blobs. Grant creation/renewal/release SHALL preserve existing origin, CSRF, and session controls. Grants SHALL authorize one pinned version, expire after five minutes without renewal, and renew every minute while actively owned without changing their media URL. Teardown SHALL release grants; session invalidation and expiry SHALL revoke access. Unimported local File previews SHALL retain their local-only behavior.

#### Scenario: Large registered asset is previewed
- **WHEN** an authorized editor previews a supported registered video
- **THEN** its native element SHALL use a scoped streaming URL and preserve existing preview audio/silence behavior
- **AND** its URL SHALL contain no management bearer token or filesystem path

#### Scenario: Active preview renews access
- **WHEN** an owned preview renews its grant before expiry
- **THEN** the URL and pinned version SHALL remain stable and renewal SHALL NOT restart playback

#### Scenario: Background preview expires
- **WHEN** timer throttling or abandoned ownership allows a preview grant to expire
- **THEN** subsequent reads SHALL fail closed and an active preview can reacquire access through an authenticated request
- **AND** recovery SHALL NOT trigger live output

#### Scenario: Preview closes or session ends
- **WHEN** a preview is disposed or its issuing management session is invalidated
- **THEN** affected open reads SHALL be cancelled and later requests rejected
- **AND** logs and user-visible diagnostics SHALL not reveal grant tokens
