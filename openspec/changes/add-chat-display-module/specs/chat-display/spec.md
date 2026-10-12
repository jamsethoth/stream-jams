## ADDED Requirements

### Requirement: Chat Is Read From Streamer.bot Only While Chat Is Enabled
While the Chat module is enabled and a platform is turned on in Chat settings, the active Streamer.bot source SHALL subscribe to that platform's chat and removal events that Streamer.bot advertises. Disabling Chat or a platform SHALL remove only those subscriptions.

#### Scenario: Enabling Chat with Twitch and YouTube on
- **WHEN** the user enables the Chat module with Twitch and YouTube turned on and Streamer.bot advertises their chat events
- **THEN** Stream Jams subscribes to `Twitch.ChatMessage`, `YouTube.Message` and their removal events
- **AND** existing Twitch event forwarding and configured custom subscriptions are unchanged

#### Scenario: A platform is not advertised
- **WHEN** Kick is turned on but Streamer.bot does not advertise `Kick.ChatMessage`
- **THEN** Chat settings show Kick as unavailable from Streamer.bot and nothing is subscribed for it

#### Scenario: No Streamer.bot source is active
- **WHEN** Chat is enabled without an active Streamer.bot source
- **THEN** management explains that chat needs an active Streamer.bot source and outputs show no messages

### Requirement: Chat Stays Off The Event Bus
Chat messages, chat removals and TikTok chat markers SHALL be delivered to the Chat service and SHALL NOT be published to the central event bus, unless the user configured an external subscription for that exact event, in which case the bus receives it as before.

#### Scenario: Busy chat during alerts
- **WHEN** hundreds of chat messages arrive while alerts are queued
- **THEN** no chat message is written to the event journal and alert intake and replay are unaffected

#### Scenario: Existing alert rule on Twitch ChatMessage
- **WHEN** the user has an external subscription to `Twitch` / `ChatMessage` used by an alert rule
- **THEN** the alert rule keeps firing and the message is also shown in chat

#### Scenario: TikTok marker with an unnamed custom rule
- **WHEN** a TikTok `ChatMessage` marker arrives and an unnamed `General` / `Custom` rule exists
- **THEN** the message is shown in chat and the rule does not fire for it

### Requirement: Chat Messages Are Normalized And Validated
Every chat message SHALL be validated at intake and converted to one shape with platform, IDs, author name, color, roles, badges, optional avatar and text and emote parts. Text SHALL be bounded and rendered as text only, never as HTML. Emotes from images outside the chat image allowlist SHALL be shown as their text.

#### Scenario: Twitch message with a 7TV emote
- **WHEN** a `Twitch.ChatMessage` contains a part with source `7TVChannel` and an allowlisted image URL
- **THEN** the message shows the emote image in place

#### Scenario: Message text contains markup
- **WHEN** a message's text contains `<img src=x onerror=alert(1)>`
- **THEN** outputs show those characters as text and no element is created from them

#### Scenario: Malformed payload
- **WHEN** a chat event is missing its text and parts, or a field has the wrong type
- **THEN** the message is ignored and a diagnostic records the platform, event type and a reference ID without the payload

### Requirement: Removals Hide Matching Messages Everywhere
Deleted messages, Twitch chat clears, bans and timeouts SHALL hide the matching messages on every output and in history.

#### Scenario: A moderator deletes a Twitch message
- **WHEN** `Twitch.ChatMessageDeleted` arrives for a shown message
- **THEN** that message disappears from the browser source and the desktop overlay

#### Scenario: A YouTube user is banned
- **WHEN** `YouTube.UserBanned` arrives
- **THEN** every stored YouTube message from that user is hidden and other platforms' messages stay

#### Scenario: Twitch chat is cleared
- **WHEN** `Twitch.ChatCleared` arrives
- **THEN** Twitch messages are hidden and YouTube, Kick and TikTok messages stay

### Requirement: Chat Filters Apply Before Display
The Chat service SHALL drop messages from hidden accounts, commands starting with `!` while Hide commands is on (default off), and Twitch Shared Chat messages from other channels while Show Shared Chat guests is off (default on, with the origin channel's name shown), and SHALL apply the active moderation blocked-term and link rules to message text while moderation is on (default on). Streamer.bot test messages SHALL appear only in the management preview.

#### Scenario: Bot account is hidden
- **WHEN** the Streamer.bot bot account is in the hidden-accounts list and posts a message
- **THEN** no output shows it

#### Scenario: Command message
- **WHEN** a viewer sends `!discord`
- **THEN** outputs show it by default, and hide it once Hide commands is turned on

#### Scenario: Shared Chat guest message
- **WHEN** a viewer in a Twitch Shared Chat partner's channel sends a message
- **THEN** outputs show it marked with that channel's name, unless Show Shared Chat guests is off

#### Scenario: Blocked term
- **WHEN** a message contains a moderation blocked term with moderation on
- **THEN** the term is replaced exactly as in alert text

### Requirement: Recent Chat Survives Restarts
The newest 50 accepted messages, with their hidden state, SHALL be stored in SQLite and restored after an app restart or browser source reload. Chat history SHALL NOT be included in configuration backups. Message text, author names and image URLs SHALL NOT be written to logs.

#### Scenario: Browser source reloads mid-stream
- **WHEN** OBS reloads the Chat browser source
- **THEN** it shows the current visible messages immediately

#### Scenario: App restarts
- **WHEN** the app restarts
- **THEN** the stored messages are restored, hidden messages stay hidden and only the newest 50 are kept

#### Scenario: Clear display
- **WHEN** the operator confirms Clear display
- **THEN** every output shows no messages and the stored history is empty

### Requirement: Chat Images Are Served By Stream Jams From An Allowlist
Emote, badge and avatar images SHALL be fetched by the server only from the chat image allowlist over HTTPS to a public address, validated as GIF, PNG, JPEG or WebP within size, pixel and frame limits, cached in memory, and served to overlays by opaque references authorized by the overlay key. Outputs SHALL never load a remote image URL directly.

#### Scenario: Animated BetterTTV emote
- **WHEN** a message contains an animated GIF emote from `cdn.betterttv.net`
- **THEN** outputs show it animated from a Stream Jams URL

#### Scenario: Image host not allowlisted
- **WHEN** a part's image URL is on a host outside the allowlist, or resolves to a private address
- **THEN** no request is made to it and the emote shows as text

#### Scenario: Oversized or invalid image
- **WHEN** a fetched image is SVG, larger than the limits or fails decoding
- **THEN** it is not served and is not fetched again for 10 minutes

#### Scenario: Twitch avatars
- **WHEN** avatars are on and a Twitch account is connected
- **THEN** Twitch messages show the author's avatar looked up through the Twitch API
- **AND** without a connected account Twitch messages show no avatar

### Requirement: TikTok Comments Arrive Through A Streamer.bot Marker
A `General` / `Custom` broadcast with `source` `StreamJams`, `type` `ChatMessage` and `platform` `tiktok` SHALL be accepted as a TikTok chat message after validation. Management SHALL show a copyable Streamer.bot action body for TikFinity.

#### Scenario: TikFinity forwards a comment
- **WHEN** TikFinity runs the documented action for a TikTok comment
- **THEN** the comment appears in chat with the TikTok platform icon, the nickname and an allowlisted avatar when present

#### Scenario: Marker with an unsupported platform
- **WHEN** a `ChatMessage` marker names any platform other than `tiktok`
- **THEN** it is ignored with a diagnostic

### Requirement: Chat Renders On Browser Source And Desktop Overlay
Chat SHALL render the same snapshot on its landscape and vertical browser outputs and on the desktop overlay, with separate browser geometry and desktop placement. Production outputs SHALL fail closed and transparent.

#### Scenario: Message appears on both outputs
- **WHEN** a message is accepted while Chat is visible on a browser source and the desktop overlay
- **THEN** both show it with the same content and order

#### Scenario: Chat is hidden on one surface
- **WHEN** the Chat layer is hidden on the desktop surface
- **THEN** the desktop shows no chat and the browser source is unchanged

#### Scenario: Output disconnects
- **WHEN** a chat output loses its connection
- **THEN** it shows nothing until it reconnects and then shows the current messages

### Requirement: Chat Layout Is Editable Like Other Boxed Modules
Management SHALL provide a Chat layout editor with size and position, stack direction, maximum visible messages, message lifetime, font size, avatar, badge and platform icon toggles, message background, and the shared shadow setting, on the consistent editor grid with rarely used settings in a collapsed section. The browser-source margin SHALL be derived from the shadow.

#### Scenario: Message lifetime
- **WHEN** message lifetime is 30 seconds
- **THEN** each message leaves the outputs 30 seconds after it arrived, and stays in the Operator panel

#### Scenario: No shadow
- **WHEN** the shadow is turned off
- **THEN** message boxes sit exactly at the edge of the browser source

### Requirement: Operator Can Hide Messages And Clear Chat
The Operator UI SHALL show recent chat with Hide and Unhide on each message, Clear display, and module enable.

#### Scenario: Operator hides a message
- **WHEN** the operator hides a shown message
- **THEN** it disappears from every output, stays hidden after restart, and can be unhidden from the Operator panel
