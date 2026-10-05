## ADDED Requirements

### Requirement: Management HTML restricts framing and content
Management HTML SHALL deny framing by other pages and enforce a Content Security Policy restricting executable content and resource destinations to the local app's required resources.

#### Scenario: Management page is requested
- **WHEN** a client loads management or operator HTML
- **THEN** response headers include frame-ancestors none, X-Frame-Options DENY, a restrictive CSP, and no-referrer

#### Scenario: Supported app workflows remain functional
- **WHEN** the operator uses management media, fonts, editing, provider setup, and supported browser-source output
- **THEN** required resources work under the policy without weakening authorization or displaying live overlay errors

#### Scenario: Production browser acceptance uses real APIs
- **WHEN** acceptance uploads media and a custom font, saves and reloads a nonidentity text warp, and sends scoped browser-source playback through a built disposable runtime
- **THEN** persisted content renders nontransparent pixels with the font loaded, no unexpected CSP violations occur, and management framing is denied
