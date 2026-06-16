## ADDED Requirements

### Requirement: Dependabot Version Updates Are Configured
The repository SHALL configure weekly grouped Dependabot version updates for workspace package dependencies and GitHub Actions.

#### Scenario: Package update PR is eligible
- **WHEN** a compatible pnpm/npm dependency update is available
- **THEN** Dependabot is configured to open a weekly grouped pull request according to the repository grouping rules

#### Scenario: GitHub Actions update PR is eligible
- **WHEN** a GitHub Actions dependency update is available
- **THEN** Dependabot is configured to open a weekly grouped pull request for workflow dependency updates

### Requirement: Dependency Automation Preserves Least Privilege
The repository SHALL keep CI and automation permissions least-privilege while adding dependency update automation.

#### Scenario: CI permissions stay scoped
- **WHEN** dependency update automation is added
- **THEN** normal validation workflows retain read-only default token permissions unless a job explicitly requires more
