# Stream Jams UI Reference Patterns

Research date: 2026-07-07

Use this as the reference brief for Penpot concept boards. These examples are pattern references, not designs to copy.

## Pattern Matrix

| Reference | Relevant Stream Jams area | Borrow | Avoid |
| --- | --- | --- | --- |
| StreamElements Overlay Editor / AlertBox | Alerts module, alert set review, alert editor, starter alerts | Overlay-first setup, per-event alert settings, default AlertBox creation, media/sound/message/duration/TTS controls, event variations for subs/tips/cheers/raids | Hidden override behavior where variations silently replace defaults; scattered advanced settings |
| OBS Studio | Alert editor canvas, browser-source output model | Source list mental model, layer order, visibility toggles, canvas transform handles, exact transform controls, browser source as overlay output | Full broadcast-production complexity; OBS-aware readiness until real OBS integration exists |
| Figma layers sidebar | Alert editor layout and layer navigation | Canvas-centered editing with persistent layer/page structure, selected-object context, and fast switching between objects | Full design-tool complexity beyond alert composition needs |
| Meld Studio / YouTube multistream docs | Landscape/vertical target profiles, output health | Separate landscape and vertical outputs, explicit stream-key handling, auto-start/auto-stop concept, independent output toggles | Treating copied keys/URLs as safe text; conflating output connection with provider readiness |
| Slack Workflow Builder | Event source and TTS setup wizards | Trigger-first language, connector mental model, setup as guided flow, clear condition/step vocabulary | Making MVP alerts look like a general automation builder |
| Datadog Logs Explorer | Diagnostics Events and Raw logs | Side panel detail, structured attributes, context around selected log/event, filterable details, correction context | Dense observability UI as default Home/operator view |
| Carbon Data Table | Alert sets, assets, provider lists, diagnostics tables | Toolbar search/filter/settings, sortable columns, inline row actions when few actions exist, overflow for more actions, skeleton loading, row expansion, batch-action-ready table structure | Hiding key row actions behind hover only; overusing dense tables for form-first flows |

## Source Notes

### StreamElements Overlay Editor / AlertBox

StreamElements documents a flow of `Streaming tools > Overlays`, `New Overlay`, then `Add widget > Alerts > AlertBox`. A basic AlertBox creates default alerts, and each event has advanced settings for image/video, sound, layout, message variables, duration, TTS, and event variations.

Implications for Stream Jams:

- `Modules > Alerts > Sets` should make default alert content visible and reviewable.
- Alert editing should be event-oriented: provider catalog context, event type, default alert, then variations; catalog context does not bind runtime eligibility.
- Variations need explicit override warnings and validation so users understand what will actually fire.
- Starter alerts should be generated disabled and marked `Needs review`.

Source: [Setting Up Twitch Alerts with StreamElements Overlays](https://support.streamelements.com/hc/en-us/articles/16789217829778-Setting-Up-Twitch-Alerts-with-StreamElements-Overlays)

### OBS Studio

OBS source docs describe scenes/sources as the place where stream layout is assembled. Browser Source is used for alert overlays and chat boxes. Sources have explicit add/remove, ordering, show/hide, canvas positioning/resizing, transform controls, and hotkeys.

Implications for Stream Jams:

- Alert editor should borrow source/layer ordering, eye toggles, canvas handles, exact inspector values, and browser-source output framing.
- It should not inherit OBS complexity. Stream Jams edits one alert output, not a whole broadcast scene.
- Browser-source URLs remain module/profile outputs, not a separate primary nav item.

Source: [OBS Sources Guide](https://obsproject.com/kb/sources-guide)

### Figma Layers Sidebar

Figma's editor uses a left sidebar for pages and layers beside the canvas. That model gives users persistent structure while they edit a focused visual surface.

Implications for Stream Jams:

- MVP alert editor should be canvas-first with the selected alert tree/layers visible.
- Selected-layer controls should stay in the right inspector.
- Stream Jams should keep the concept simpler than Figma: one alert/variation at a time, no multi-page design-tool scope.

Source: [Figma layers sidebar help](https://help.figma.com/hc/en-us/articles/360039832014-View-layers-and-pages-in-the-left-sidebar)

### Meld Studio / YouTube Multistream

Meld documents landscape and vertical streams from one project, with a Main canvas and Portrait canvas. The YouTube setup uses separate stream keys and notes that outputs can be started independently. It also describes auto-start/auto-stop on YouTube.

Implications for Stream Jams:

- Target profiles should be first-class: `Landscape 16:9` and `Vertical 9:16`.
- Output status and route-key actions should stay per module and per target profile.
- Future stream-start automation belongs in backlog until actual OBS/platform integration exists.

Source: [Meld Studio YouTube output docs](https://meldstudio.co/docs/outputs/youtube/)

### Slack Workflow Builder

Slack describes workflows as trigger-started flows with steps, connectors to outside tools, and conditionals. It emphasizes nontechnical setup.

Implications for Stream Jams:

- Provider setup wizards should use guided, connector-style language.
- Event sources should feel like registering a source of incoming events, not building arbitrary automation.
- Alert flow UI should avoid becoming a Zapier/Slack-style general workflow builder in MVP.

Source: [Slack Workflow Builder](https://slack.com/features/workflow-automation)

### Datadog Logs Explorer

Datadog's log side panel supports detailed inspection and context around selected logs. Its `View in context` behavior shows nearby log lines and uses attributes/tags to determine context.

Implications for Stream Jams:

- Diagnostics should provide a raw event/log list with filters and a side/detail panel.
- Every error shown in the app should link to a reference ID searchable in Diagnostics.
- Correction links should take users to the relevant provider, alert, asset, or output screen.

Source: [Datadog Log Side Panel](https://docs.datadoghq.com/logs/explorer/side_panel/)

### Carbon Data Table

Carbon's data table guidance covers inline row actions, overflow menus, loading skeletons, and scan-friendly row styling. It recommends inline icon actions when there are fewer than three row actions and overflow menus for larger action sets.

Implications for Stream Jams:

- Alert set, asset, provider, and diagnostics tables should support search/filter/sort from the start.
- Frequently used row actions like `Preview`, `Edit`, `Enable`, and `Activate` can be inline when action count is small.
- Tables should leave structure for future batch operations without implementing bulk behavior now.

Source: [Carbon Data Table usage](https://carbondesignsystem.com/components/data-table/usage/)

## Penpot Reference Board Plan

Create this under `10 Redesign Concepts` as `Reference Patterns`.

Board sections:

1. `Alert Setup And Editor`
   - StreamElements AlertBox
   - OBS source/layer model
   - Figma canvas/layers/sidebar model
2. `Integration Setup`
   - Slack Workflow Builder connectors/triggers
   - Meld Studio output/profile handling
3. `Diagnostics`
   - Datadog log side panel
   - Stream Jams error/reference-ID correction pattern
4. `Tables And Libraries`
   - Carbon Data Table
   - Stream Jams assets and alert set tables

Each tile should include:

- Reference name.
- Source URL.
- `Borrow`.
- `Avoid`.
- `Stream Jams implication`.
- Schematic pattern diagram focused on the reusable UX structure, not a full webpage screenshot.

## First High-Fidelity Flow After Reference Board

Start with one golden path:

1. Home shows setup checklist and active alert set summary.
2. User connects an event source.
3. User lands on selected alert set.
4. User opens one alert in focused editor.
5. User switches landscape/vertical profile.
6. User previews with sample payload.
7. User sends test to connected overlay.
8. Failure path links to Diagnostics detail and then back to the correction screen.
