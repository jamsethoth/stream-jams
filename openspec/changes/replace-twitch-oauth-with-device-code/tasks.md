## 1. Twitch API Client And Public Configuration

- [x] 1.1 Add failing API-client tests for device authorization start, pending/terminal poll responses, successful token grants, malformed responses, and public refresh without client secret
- [x] 1.2 Implement Device Code API contracts and parsers, remove authorization-code exchange, and add the project public Client ID with environment override

## 2. Device OAuth Service

- [x] 2.1 Add failing service tests for opaque authorization IDs, server-only device codes, interval enforcement, expiry cleanup, terminal failures, successful secure storage, token rotation, and EventSub notification
- [x] 2.2 Replace callback state handling with the in-memory Device Code authorization lifecycle while preserving validated token storage and account metadata

## 3. HTTP Routes And Runtime Wiring

- [x] 3.1 Add failing route and runtime smoke tests for management-protected start/poll, controlled errors, rate limits, default/override Client ID, and removed callback behavior
- [x] 3.2 Implement start/poll routes, remove the callback route and client-secret wiring, and map Device Code failures to actionable HTTP responses

## 4. Management API And Provider Wizard

- [x] 4.1 Add failing management API contract tests for Device Code start/poll response unions and untrusted-response rejection
- [x] 4.2 Add failing provider-page tests for automatic activation opening, waiting/code/expiry state, early pending polls, success, denial, expiry, retry, popup fallback, and polling cleanup on close
- [x] 4.3 Implement the Device Code management contracts and Event Source wizard flow without exposing OAuth secrets
- [x] 4.4 Update production-component Storybook stories for waiting, connected, denied, expired, retry, and popup-blocked fallback states

## 5. Integration And Documentation

- [x] 5.1 Replace Playwright Twitch onboarding coverage with Device Code start/poll/success behavior and retain provider validation/registration assertions
- [x] 5.2 Update `.env.example`, the MVP runbook, and OAuth planning documents to remove client-secret and callback instructions

## 6. Verification

- [ ] 6.1 Run focused red/green tests after each implementation task and complete the full unit, lint, typecheck, build, Storybook, and Playwright gates
- [ ] 6.2 Run strict OpenSpec validation, CodeGraph sync, diff checks, and live desktop/mobile browser verification with no console errors or layout overflow
