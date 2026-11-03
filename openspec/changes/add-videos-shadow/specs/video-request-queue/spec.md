## ADDED Requirements

### Requirement: Videos Picture Shadow Is Configurable
The Videos layout SHALL offer an optional picture shadow with the shared box-shadow fields: X and Y offset, blur, spread and RGBA color. The browser source, the desktop overlay and the management preview SHALL draw the same saved shadow on the picture.

When a shadow is saved, the browser content canvas SHALL add the shared shadow margin on each side and place the content box past it. A fully transparent shadow SHALL add no margin, so the content box sits at the source's top-left corner. The desktop scene canvas and desktop placement SHALL NOT change with the shadow. Layouts saved without a shadow SHALL keep the original picture shadow and the existing browser canvas size.

#### Scenario: Shadow is not clipped in OBS
- **WHEN** the operator saves a 640 x 460 box with a shadow whose margin is 16 px on each side
- **THEN** the browser source canvas becomes 672 x 492 and the box starts 16 px from its top-left corner

#### Scenario: Shadow off
- **WHEN** the operator turns the shadow off and saves
- **THEN** the browser canvas matches the content size and the box sits exactly at the source edge

#### Scenario: Older layout
- **WHEN** a saved Videos layout has no shadow
- **THEN** the picture keeps the original shadow and the browser canvas keeps the content size

### Requirement: Videos Caption Shows The Real Title, Channel And A Chosen Font
The stream caption under the video SHALL show the provider title when known, else the submitted title. Its second line SHALL show the provider channel when known, followed by the requester, and SHALL omit unknown parts. The caption SHALL keep its two-line reserve. The Videos layout SHALL offer an optional caption font from the shared font presets; layouts without one SHALL keep the overlay's default font. The browser source, the desktop overlay and the management preview SHALL use the same caption.

#### Scenario: Provider details arrive while playing
- **WHEN** a clip plays and its provider title and channel arrive
- **THEN** the caption changes to the provider title, with "<channel> · Requested by <requester>" below it

#### Scenario: Caption font
- **WHEN** the operator picks Serif as the caption font and saves
- **THEN** every output draws the caption in the Serif preset

## MODIFIED Requirements

### Requirement: Queued Requests Are Described From Their Provider
After a request is queued through any submission path or replayed, the system SHALL look up its title and channel (and, for Twitch, its length) in the background without delaying the submitter's response, and SHALL store them on the queued request beside the submitted title. YouTube details SHALL come from the public oEmbed endpoint without credentials; Twitch clip and video details SHALL come from the Twitch API with the connected Twitch account; direct files SHALL NOT be looked up. Each request SHALL get at most one lookup, bounded by a timeout, with no retries. Lookups SHALL run only in the local service, SHALL contact only `https://www.youtube.com/oembed` and `https://api.twitch.tv/helix`, and SHALL be built from the validated source rather than the submitted link.

#### Scenario: YouTube request
- **WHEN** a YouTube link is queued without a title
- **THEN** the request is accepted immediately, and its provider title and channel are filled in from oEmbed once they arrive, with its length still unknown

#### Scenario: Provider title on stream
- **WHEN** a request is queued with a title and the provider reports a different one
- **THEN** the submitted title stays the request's title in management and Operator queues, the provider title is stored beside it, and the stream caption shows the provider title and channel once they arrive

#### Scenario: Twitch without a connected account
- **WHEN** a Twitch clip or video is queued and no Twitch account is connected
- **THEN** no Twitch request is made, the request stays as queued, and a bounded diagnostic is logged

#### Scenario: Lookup fails
- **WHEN** the provider answers with an error, a malformed or oversized body, a redirect, or does not answer within the timeout
- **THEN** the request stays as queued with its details unknown, nothing is retried, and the log records only the item, provider and reason, never the link, the provider's answer or any token

#### Scenario: Replay
- **WHEN** a Recent video with provider details is replayed
- **THEN** the new request carries the same details without a new lookup
