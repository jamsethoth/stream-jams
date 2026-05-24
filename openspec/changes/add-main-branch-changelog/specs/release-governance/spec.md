# Delta for Release Governance

## ADDED Requirements

### Requirement: Main Branch Changelog

The repository SHALL maintain a source-controlled `CHANGELOG.md` at the repository root that records changes entering the `main` branch.

#### Scenario: Reviewing landed work

- GIVEN a non-merge, non-bot commit has been merged into `main`
- WHEN a maintainer opens `CHANGELOG.md`
- THEN the changelog includes an entry representing that commit
- AND the entry gives enough context to understand the change without reading git history

#### Scenario: Multiple commits merged together

- GIVEN a pull request contains multiple non-merge, non-bot commits
- WHEN the pull request is merged into `main`
- THEN each commit is represented either by its own changelog bullet or by a grouped pull request bullet
- AND grouped bullets identify the included commit short SHA(s)

### Requirement: Changelog Entry Format

The changelog SHALL use a stable, documented format for entries that land on `main`.

#### Scenario: Entry includes traceability

- GIVEN a changelog entry represents work merged through a pull request
- WHEN a maintainer reads the entry
- THEN the entry identifies the pull request number when available
- AND the entry identifies the relevant commit short SHA(s) or explicitly groups the represented commits

#### Scenario: Entry categorizes the change

- GIVEN a changelog entry is added
- WHEN the changelog is reviewed
- THEN the entry is placed under a category such as Added, Changed, Fixed, Security, Docs, Tooling, or Chore

### Requirement: Pull Request Changelog Validation

The repository SHALL validate pull requests targeting `main` so changelog-required changes cannot merge without updating `CHANGELOG.md`.

#### Scenario: Pull request omits required changelog update

- GIVEN a pull request targets `main`
- AND the pull request includes non-exempt changes
- WHEN changelog validation runs
- THEN validation fails if `CHANGELOG.md` was not updated

#### Scenario: Pull request does not represent all commits

- GIVEN a pull request targets `main`
- AND the pull request contains multiple non-merge, non-bot commits
- WHEN changelog validation runs
- THEN validation fails if the added changelog lines do not represent each commit according to the documented entry format

#### Scenario: Exempt-only pull request

- GIVEN a pull request targets `main`
- AND the pull request changes only files or commit types documented as changelog-exempt
- WHEN changelog validation runs
- THEN validation passes without requiring a `CHANGELOG.md` update
- AND the validation output explains that the pull request was exempt

### Requirement: Main Branch Invariant Validation

The repository SHOULD validate the changelog invariant after updates to `main`.

#### Scenario: Main branch receives a merge

- GIVEN `main` receives new commits
- WHEN the main branch validation workflow runs
- THEN it verifies that the changelog still represents the new non-merge, non-bot commits
- AND it reports a failure if the invariant is broken
