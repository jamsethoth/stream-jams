## ADDED Requirements

### Requirement: Overlay Navigations Survive A Local Service Outage
After an ordinary browser-source overlay has loaded successfully once, the browser SHALL keep a service worker scoped to `/overlay/`. When a later navigation under `/overlay/modules/` fails at the network level, the worker SHALL answer with a stored, transparent, key-free fallback page. That page SHALL contain no script and no visible content, and SHALL reload itself every 2 seconds until the navigation reaches Stream Jams again.

The worker SHALL forward every navigation to the network first and SHALL pass any HTTP response through unchanged. It SHALL store only the fallback page, never a response for a keyed route. It SHALL NOT handle requests outside `/overlay/modules/` or requests that are not navigations.

#### Scenario: OBS starts before Stream Jams
- **WHEN** a browser source that loaded successfully before navigates while Stream Jams is not listening
- **THEN** the source shows the transparent fallback page instead of a browser error page
- **AND** once Stream Jams is listening, the next automatic reload shows the overlay again without operator action

#### Scenario: Stream Jams answers with an HTTP error
- **WHEN** an overlay navigation receives an HTTP response such as the transparent 401 key rejection
- **THEN** the worker returns that response unchanged and does not substitute the fallback page

#### Scenario: Management pages are unaffected
- **WHEN** a management, operator, API or asset request is made
- **THEN** the overlay worker does not handle it

#### Scenario: Worker is unavailable
- **WHEN** the browser has no service worker support or registration fails
- **THEN** the overlay renders exactly as before and shows no diagnostic content

#### Scenario: Reload bypasses the worker
- **WHEN** OBS reloads a source while ignoring the cache during an outage
- **THEN** the browser error page remains until the source is reloaded again after Stream Jams is listening
