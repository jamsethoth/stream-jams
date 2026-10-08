## ADDED Requirements

### Requirement: Data overlay backup and safe restore
Versioned backups SHALL include typed data definitions/current state/reset defaults, goals/baselines, schemas/rules, canvases/templates and asset references. They SHALL exclude grants, tickets, provider secrets, receipts, volatile status and runtime identities. Restore SHALL validate all references, apply atomically under maintenance guards, establish a new data epoch, invalidate external authority and disable external input rules pending review. Imported canvases SHALL start disabled; provider bindings SHALL await reconnection. A failed restore SHALL preserve the prior data and receipts exactly.

#### Scenario: Restore a shared campaign
- **WHEN** a valid backup with a campaign referenced by two canvases is restored
- **THEN** both retain references and saved campaign progress, external intake requires review and new authority, and no historical event is replayed

#### Scenario: Invalid references during restore
- **WHEN** a backup contains a rule or canvas referencing nonexistent/incompatible data
- **THEN** restore fails without replacing the existing profile, receipt history or authority
