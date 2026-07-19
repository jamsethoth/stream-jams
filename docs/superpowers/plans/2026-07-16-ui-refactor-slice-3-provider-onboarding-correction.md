# UI Refactor Slice 3 Provider Onboarding Correction

## Goal

Complete the MVP Event Sources setup flow that Slice 3 marked finished but Slice 9 left without a usable Twitch authorization path.

## Root Cause

The provider setup dialog presents validation as a synthetic two-step flow. Streamer.bot can be configured in that form, but Twitch validation requires an existing OAuth connection and the management UI no longer exposes the OAuth action. The server OAuth routes and provider validation adapter still exist.

## Scope

- Replace the synthetic step label with real provider selection, connection setup, and review stages.
- Keep Streamer.bot WebSocket configuration and validation in its provider-specific setup stage.
- Restore the existing Twitch status and authorization-start methods to the typed management API.
- Let Twitch setup start authorization, expose the returned Twitch URL, recheck connection status, and validate before review.
- Keep failed validation in the wizard with an actionable error and reference ID when supplied by the backend.
- Report whether registration made the provider active or left it inactive.
- Add unit, Storybook, and Playwright coverage for the browser-visible workflow.

## Non-Goals

- No new OAuth service, provider adapter, or dependency.
- No multiple-active-provider support.
- No Twitch refresh or disconnect management in this setup correction.
- No changes to provider persistence or activation rules.

## Acceptance

1. Provider choice changes the setup content and advances through real stages.
2. Streamer.bot cannot reach review until its configured WebSocket connection validates.
3. Twitch setup shows current connection state, can start OAuth, and cannot reach review until OAuth and provider validation pass.
4. Registration remains separate from activation; completion feedback states active or inactive outcome.
5. Focused tests fail before implementation and pass after it; all frontend and repo gates remain green.
