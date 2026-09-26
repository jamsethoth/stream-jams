# Tasks

## 1. Contracts and persistence

- [ ] 1.1 Add exact unique-label matching and typed binding-state contracts.
- [ ] 1.2 Add audio consent migration and repository mapping with opt-out defaults.
- [ ] 1.3 Add compatible desktop label and consent fields plus a browser update schema that omits trusted labels.

## 2. Runtime reconciliation

- [ ] 2.1 Reconcile opted-in missing audio IDs with compare-before-write and future-occurrence-only behavior.
- [ ] 2.2 Reconcile opted-in missing desktop IDs with durable-before-configure behavior.
- [ ] 2.3 Invoke both reconciliation paths during desktop-host startup and preserve fail-closed behavior on failure.

## 3. Portable backup safety

- [ ] 3.1 Clear audio and desktop IDs, labels, and consent in portable snapshots.
- [ ] 3.2 Preserve compatible legacy restore while preventing restored automatic binding.

## 4. Management UI

- [ ] 4.1 Add per-route exact-name consent, status guidance, tests, and Storybook states.
- [ ] 4.2 Add desktop exact-name consent, trusted-label round trip, tests, and Storybook states.
- [ ] 4.3 Apply the existing compact inspector checkbox presentation to Live TTS.

## 5. Verification

- [ ] 5.1 Cover unique, absent, case-mismatched, duplicated, concurrent, and persistence-failure paths.
- [ ] 5.2 Cover browser and desktop transport acceptance without requiring physical ID churn.
- [ ] 5.3 Run affected lint, typecheck, unit, Storybook, Playwright, desktop, OpenSpec, and diff gates.
- [ ] 5.4 Rebuild and verify the packaged Windows workflow and record evidence.
