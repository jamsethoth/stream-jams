# UI Guidelines

## Product Shape

Stream Jams is a local-first streaming operations tool. The UI should feel like a focused control surface for setup, monitoring, and recovery.

Do not build landing-page or marketing layouts for product work.

## Management UI

- Favor dense, scannable layouts over decorative cards or hero sections.
- Keep the current max-width shell and tabbed management workspace unless a change explicitly redesigns navigation.
- Use clear labels and status copy that helps a streamer operate quickly during setup or live troubleshooting.
- Keep page sections unframed. Use cards only for repeated items, modals, or truly framed tools.
- Avoid nested cards.
- Match control type to intent:
  - toggles or checkboxes for binary settings
  - selects or segmented controls for constrained modes
  - number inputs for precise numeric configuration
  - buttons only for explicit commands
- Buttons should be short, action-oriented, and fit on mobile.
- Preserve loading, empty, error, success, disabled, and destructive states when a workflow has them.
- Keep Twitch, overlay, playback, diagnostics, assets, alerts, and settings states operationally distinct.

## Overlay UI

- The overlay surface is fullscreen and transparent by default.
- Live overlays must not show debug frames, route keys, stack traces, secret refs, raw provider payloads, or internal error text.
- Design for common 16:9 broadcast canvases first, with explicit layout dimensions and safe areas.
- Text overlays need high contrast, shadow, and wrapping that works over arbitrary stream content.
- Media-backed overlay stories must use tiny local assets.
- Overlay failures should fail closed on live output and report diagnostics through operator surfaces.

## Accessibility

- Every management control needs an accessible name.
- Use semantic headings, forms, tables, buttons, and status text before adding custom roles.
- Preserve keyboard navigation in tab lists, forms, tables, and modal-like flows.
- Do not rely on color alone for status.
- Check contrast for text, diagnostic messages, disabled controls, focus states, and overlay text.

## Agent-Facing Story States

For changed production UI, add stories that expose the state shape an agent or reviewer needs to inspect:

- Full shell with representative data.
- Form-heavy panel with populated values and save feedback.
- List/table panel with populated and empty states.
- Async loading state when visible.
- Error state with operator-safe copy.
- Overlay idle, text-only, media, and fail-closed/error-safe states when overlay rendering changes.
