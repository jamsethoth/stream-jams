# Tasks

## 1. Server

- [x] 1.1 Expose the live snapshot only while the selected source is connected and fresh.
- [x] 1.2 Add an authorized `GET /management/music/now-playing` route validated with the core schemas.

## 2. Management

- [x] 2.1 Poll now-playing while the Music page is visible and fall back to the sample track.
- [x] 2.2 Load artwork through the management client and revoke object URLs.
- [x] 2.3 Show which track the preview is using.

## 3. Verification

- [x] 3.1 Server unit and route tests, including unauthorized access.
- [x] 3.2 Music API and page tests for live track, artwork and fallback.
- [x] 3.3 Playwright test: preview follows a fixture Pear track and returns to the sample when playback stops.
- [ ] 3.4 Maintainer plays music in Pear Desktop on Windows and sees the preview follow it.
