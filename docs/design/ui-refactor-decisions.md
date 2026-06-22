# UI Refactor Decision Log

This living document records UX and UI decisions for the Stream Jams management UI refactor.
It is not the final implementation spec. Update it as decisions change, then promote the settled version into a formal spec and implementation plan.

## Product Surface Split

- The management UI is an offline setup and configuration console.
- Live monitoring and moderation should be a separate operator UI.
- The operator UI is design-artifact scope only for this refactor; it is not part of the first implementation.
- Implementation should be split into dependency-ordered changes rather than one large PR.
- Likely change sequence:
  - Alert domain model refactor.
  - Alert management API refactor.
  - Management shell information architecture refactor.
  - Alert family management UI.
  - Alert canvas editor.
  - Alert output management UI.
  - Live operator UI design artifacts only.
- Create Penpot concept boards before the formal implementation spec.
- Initial concept boards should be low/mid fidelity, not polished final visuals:
  - App shell and Home.
  - Alerts family overview.
  - Focused alert editor for landscape.
  - Focused alert editor for vertical.
  - Event sources page.
  - Assets table.

## Navigation And Information Architecture

- Use a sidebar-first app shell.
- Top-level navigation:
  - `Home`
  - `Event sources`
  - `TTS providers`
  - `Modules`
    - `Alerts`
  - `Assets`
  - `Diagnostics`
  - `Settings`
- Do not nest `Event sources` or `TTS providers` under a generic `Configuration` item.
- `Modules` is a module catalog/list, not a module instance manager.
- `Alerts` is currently the only module, but the structure should allow future module types.
- `Overlays` should not be a primary nav item. Browser-source URLs and route-key actions belong inside the module that owns the output.
- Browser-source URLs are separate per module and target profile, such as Alerts landscape and Alerts vertical.
- Do not rely on one browser-source URL adapting by viewport for the MVP.

## Visual Foundation

- Use a hybrid visual personality:
  - Management shell is operational: dense, quiet, utility-first, and optimized for repeated setup/configuration work.
  - Alert editor is creator-studio style: visual, preview-heavy, and optimized for alert design.
  - Home, integrations, assets, diagnostics, and settings stay restrained and scannable.
  - Canvas/editor surfaces can use richer visual treatment where it helps creative work.
- Build a custom Stream Jams design system informed by Carbon and Material rather than copying either system literally.
- Use Carbon guidance for information architecture, forms, tables, status, shell behavior, and density.
- Use Material 3 and modern component practice for general interaction polish where appropriate.
- The alert editor can diverge into a more creator-studio visual language while preserving shared tokens and accessibility rules.
- Use local Stream Jams components backed by accessible primitives where helpful.
- Prefer Radix/shadcn-style open components for dialogs, menus, tabs, popovers, selects, sliders, tooltips, sheets, switches, and similar interaction primitives.
- Keep styling and token ownership in the repo.
- Build canvas/editor-specific controls custom where standard primitives do not fit.
- Do not adopt MUI or Carbon React as the primary component library unless a specific component proves worth the visual/API lock-in.
- Do not adopt Tailwind at the start of the refactor.
- Use design tokens and CSS variables as the required styling foundation.
- Reevaluate Tailwind later as a tech-stack consideration if shadcn adoption becomes broad enough to justify the styling-model change.
- Support both dark and light modes in the redesign.
- Theme preference options:
  - System.
  - Dark.
  - Light.
- Default to system preference and allow manual override.
- Use comfortable operational density by default.
- Tables and alert trees can be denser than forms.
- Canvas inspector should be compact enough to avoid excessive scrolling.
- Backlog:
  - Global `Comfortable` / `Compact` density preference.
- Palette should use neutral operational surfaces and reserve saturated color for status, active module, canvas selection, and creator accents.
- Avoid a one-note palette dominated by a single hue family.
- Use a clean UI sans font stack for the management shell.
- Use tabular/numeric styling for status counts, timings, dimensions, and other scan-heavy values.
- Do not use a decorative brand font for management UI chrome.
- Alert preview content can use user-selected alert fonts separately from the app UI font.
- Accessibility baseline:
  - Meet WCAG 2.2 AA contrast for app UI.
  - All management and editor controls must be keyboard usable.
  - Canvas positioning and sizing must have inspector/form alternatives for exact edits.
  - Status cannot rely on color alone; include label and/or icon.
  - Reduced-motion mode disables nonessential UI animation and editor preview autoplay unless manually triggered.
- Responsive scope:
  - Management configuration UI supports desktop and tablet widths.
  - Mobile management UI should remain readable for status and simple edits.
  - Canvas editor is desktop-required for MVP.
  - Narrow mobile should show a clear state explaining that the editor requires a larger screen.
  - Live operator UI may consider mobile later, but is not implemented in this refactor.

## Home

- `Home` replaces `Dashboard`.
- Home should show service/app integration readiness and next setup actions.
- Home can show compact diagnostics/errors only when user attention is needed.
- Home must not become a live stream dashboard or moderation queue.

## Integrations And Readiness

- Readiness is tracked only for service/app integrations, not general app completion.
- Readiness applies to external boundaries such as Twitch, Streamer.bot, and Speaker.bot.
- OBS/browser-source verification is not readiness in the MVP because current product scope uses manually copied browser-source URLs.
- If OBS WebSocket support is added later, OBS can become an integration with readiness states.
- Provider setup uses one wizard per setup flow, not one wizard per page.
- Providers are grouped by capability:
  - `Event sources`: Twitch, Streamer.bot events, future event providers.
  - `TTS providers`: Speaker.bot and future TTS providers.
- Any number of providers can be registered per capability.
- Exactly one provider per capability can be active in the MVP.
- `Save provider` stores settings; `Set active` changes runtime behavior.
- `Test connection` validates a provider without activating it.
- Active providers receive alerts automatically on app start for now.
- Backlog:
  - Manual live-intake toggle.
  - Auto-enable intake on stream start and auto-disable on stream end.
  - Multiple active providers per capability, lowest priority and unlikely.
  - Provider-specific routing for alert rules if multi-provider support ever becomes needed.

## Provider Activation Impact Checks

- Alert rules target provider kind plus event type, not a specific registered provider.
- Example: `Twitch > Follow`, not `Twitch account: jamsethoth > Follow`.
- When setting a provider active, check the active alert family:
  - If no rules match that provider kind, warn that live alerts may stop.
  - If some rules match and some do not, show counts.
  - If all relevant rules match, use normal activation confirmation.
- TTS provider activation should similarly check active alerts that use TTS.

## Assets

- `Assets` is a global asset library, not a required detour during alert creation.
- The primary assets view should be a table/list with thumbnails.
- Module workflows, such as alert creation, should allow inline asset upload/select.
- The `Assets` page should allow users to review all assets in use, update an asset, and have that update apply everywhere the asset is referenced.
- Modules should reference assets by asset ID rather than copied file paths.
- Deleting an in-use asset should be blocked or require explicit reassignment.

## Alerts Module

- `Modules > Alerts` defaults to the active family overview.
- A family list/switcher should be available near the overview.
- `Modules > Alerts` uses tabs for related views inside the module:
  - `Families`
  - `Editor`
  - `Output`
  - `Settings`
- `Families` contains active family overview, family switch/activation, alert inventory table, and validation.
- `Editor` is a full workspace with persistent alert tree/list, canvas, inspector, and preview/test/save controls.
- Family overview and alert inventory rows should deep-link into `Editor` with the selected family/provider/event/variation.
- `Editor` saves one selected alert/variation at a time in the MVP.
- Show dirty state for the current selection and warn before navigation would discard unsaved changes.
- `Editor` opens in focused editor mode that hides or collapses the main app sidebar while keeping breadcrumb/header context.
- Focused editor mode keeps its own alert tree/list visible so users can switch between alerts quickly.
- Switching alerts with unsaved changes prompts: save and switch, discard and switch, or cancel.
- Focused editor uses a distinct route, such as `/modules/alerts/editor/:alertId`.
- Deep links from family tables and browser back/forward behavior should work predictably.
- Editor and management routes should use stable IDs internally, with human-readable names shown in breadcrumbs and page text.
- Avoid routing by editable family/event/variation names.
- Backlog:
  - Save-all or multi-alert draft editing.
- `Modules > Alerts` should include an `Output` or `Browser sources` section for generated browser-source URLs and connected-client diagnostics.
- The output section should show landscape and vertical URLs, copy actions, route-key regeneration, last connected client, and test send controls.
- One active alert family is allowed in the MVP.
- Alert family activation is separate from saving:
  - `Save` persists family and alert edits.
  - `Activate family` changes live behavior.
- Editing the active family and saving affects live alerts, with clear warning.
- Editing inactive families is safe preparation work.
- UI implementation should be backed by the refactored backend model and APIs, not front-end-only mock state.
- Implementation should be sliced backend model/API first, then management UI shell, then focused editor.
- Backlog:
  - Draft/publish model for active family edits.
  - Multiple active families with warnings for conflicting or duplicate source events.

## Alert Families, Event Types, And Variations

- Alert family represents a seasonal/campaign/default set.
- Canvas editor structure:
  - `Family`
    - `Provider kind`
      - `Event type`
        - `Variations`
- Event type has a default design.
- Variation is a conditional alert under an event type.
- Variation starts from the event default, then can diverge.
- Event type has default target-profile enablement.
- Variation can either use event default profile enablement or override it.
- MVP variation conditions use simple event-specific fields, not a generic condition builder.
- Example conditions:
  - Raid viewer count greater than or equal to a threshold.
  - Subscription tier or month threshold.
  - Cheer bits greater than or equal to a threshold.
  - Follow usually has no condition beyond the default alert.
- MVP actions:
  - `Create variation from default`
  - `Duplicate variation`
  - `Duplicate alert within the same event type and family`
  - `Reset to event default`
  - `Copy design from...`
- Avoid a deep inheritance engine in the MVP.
- Backlog, high priority:
  - Bulk operations such as apply design to selected, enable/disable selected, move/copy to family, and copy settings across events.
- Backlog:
  - Generic AND/OR condition builder.
  - Priority rules.
  - Conflict simulation.
  - Provider-specific advanced payload fields.
- UX must leave room for bulk operations now:
  - Lists/tables should allow future multi-select.
  - Rows should show enabled state, trigger, condition, design source, and last modified.
  - Contextual overflow menus should have a place for future bulk and copy actions.

## Alert Canvas Editor

- MVP alert editor is canvas-first.
- The canvas is not a blank design-tool clone; templates/presets should prevent blank-canvas burden.
- Center: alert preview canvas.
- Left: family/provider/event/variation navigation.
- Right: inspector for selected layer or alert settings.
- Top or bottom: preview/test controls.
- Support free positioning and resizing of text and media layers.
- Include snap/grid and reset-to-template.
- Inspector handles exact values, asset selection, typography, animation, duration, and conditions.
- Undo/redo is supported in the MVP for the current alert editor session:
  - Move or resize layer.
  - Add or delete layer.
  - Inspector field changes.
  - Target-profile enable toggles.
- Undo/redo does not span saved states or different alerts in the MVP.
- MVP keyboard shortcuts:
  - Delete selected layer.
  - Arrow moves selected layer by 1px.
  - Shift+arrow moves selected layer by 10px.
  - Ctrl/Cmd+Z undo.
  - Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo.
  - Esc deselect.
  - Ctrl/Cmd+D duplicate layer.
- MVP animation is preset-based:
  - Entrance animation.
  - Exit animation.
  - Duration.
  - Delay.
  - Easing preset.
- Alert testing model:
  - `Preview` plays the current design with sample data inside the editor.
  - `Send test to overlay` sends through the actual playback/overlay path.
  - Sample data selector is scoped to event type, such as small raid, large raid, or long username.
  - Test UI must make the active target profile clear.
- MVP layer types:
  - Text.
  - Image.
  - Video/GIF.
  - Audio as a non-visual layer.
  - TTS as a non-visual layer.
  - Shape only if needed for simple backgrounds or badges.
- No arbitrary custom HTML/CSS/JS in the MVP.
- The data model and editor structure must remain flexible enough for future layer/composition features without committing to implementing them now.
- Backlog:
  - Groups.
  - Masks.
  - Custom HTML/CSS/JS.
  - Particle effects.
  - Nested compositions.
  - Arbitrary CSS.
  - Timeline/keyframe animation, to be explored for feasibility before committing.

## Target Profiles

- MVP supports two fixed target profiles:
  - `Landscape 16:9` at `1920x1080`
  - `Vertical 9:16` at `1080x1920`
- Alert rules and content are shared across target profiles.
- Layout positions and sizes are stored per target profile.
- Layout geometry is independent per profile.
- Users can explicitly copy layout from landscape to vertical or from vertical to landscape.
- No automatic cross-profile geometry sync in the MVP.
- Each alert can be enabled or disabled per target profile.
- Users can copy/duplicate an alert.
- Templates should generate both target profiles.
- Missing profile layout should be explicit in the UI.
- `Activate family` requires at least one valid target profile, not all profiles.
- Activation should warn clearly when any target profile is incomplete.
- Target profile validation should prove the alert can run without broken output, not judge whether it looks like a typical alert.
- Blocking validation:
  - Required asset reference is missing or unreadable.
  - Text template uses variables unavailable for that event type.
  - Visual layer duration is missing or invalid.
  - Layer geometry is invalid, such as negative size, NaN, or impossible transform.
  - Alert has no output action at all: no visual, no sound, no TTS, and no queue action.
- Warning-only validation:
  - No visible visual layer.
  - Layer extends outside canvas bounds.
  - Profile has not been reviewed since creation from template.
  - Text may overflow.
  - Sound is missing.
  - TTS provider is inactive.
- Backlog, low priority:
  - Custom canvas profiles.

## Diagnostics

- Use one `Diagnostics` page with tabs or sections.
- Likely sections:
  - `Health`
  - `Events`
  - `Playback`
  - `Logs`
- Do not split diagnostics into multiple sidebar destinations unless it grows too large.

## Design Source References

- Carbon UI shell left panel: https://carbondesignsystem.com/components/UI-shell-left-panel/usage/
- Carbon Forms: https://carbondesignsystem.com/patterns/forms-pattern/
- Carbon Progress Indicator: https://carbondesignsystem.com/components/progress-indicator/usage/
- Carbon Status Indicators: https://carbondesignsystem.com/patterns/status-indicator-pattern/
- Radix Primitives: https://www.radix-ui.com/primitives
- shadcn/ui introduction: https://ui.shadcn.com/docs
- Material UI overview: https://mui.com/material-ui/getting-started/
- Carbon React tutorial overview: https://carbondesignsystem.com/developing/react-tutorial/overview/
- PatternFly Wizard guidelines: https://www.patternfly.org/components/wizard/design-guidelines/
- Shopify Polaris Resource index layout: https://polaris-react.shopify.com/patterns/resource-index-layout
- StreamElements overlay getting started: https://docs.streamelements.com/overlays/getting-started
- StreamElements overlay editor shortcuts: https://docs.streamelements.com/overlays/overlay-editor-shortcuts
- StreamElements widget structure: https://docs.streamelements.com/overlays/widget-structure
- Streamlabs alert setup: https://streamlabs.com/content-hub/post/setting-up-your-streamlabs-alerts
- OBS browser source: https://obsproject.com/kb/browser-source

## Open Questions

- None recorded at this checkpoint.
