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

## Status Freshness

- Derive saved readiness and enablement from configuration, not transient runtime activity.
- Runtime status indicators must update through push events or polling at least every five seconds while visible.
- Show runtime evidence as secondary telemetry when it is not required to complete setup.
- Retain the last known runtime state when refresh fails, label it stale, and show an actionable error with a reference ID when available.
- Do not present a one-time snapshot as current status.

## Transient Feedback

- Use the shared fixed management toast for transient action success, failure, warning, and state feedback; do not insert these messages into page flow.
- Use green for success, red for failure, and yellow for warning. Treat completed actions requiring review or corrective follow-up as warnings, and state every outcome in text so color is never the only signal.
- Success and warning toasts expire after four seconds. Failure toasts remain dismissible and expire after eight seconds.
- Keep toast content, timestamps, reference IDs, correction links, and dismissal controls inside the viewport and allow long values or localized copy to wrap.
- Keep blocking load failures, stale-runtime refresh failures, field validation, wizard failures, destructive confirmation content, and warnings requiring a decision inline with the affected workflow.

## Dense Hierarchical Management

- Prefer one expandable hierarchy when selecting a parent determines the child inventory; avoid a persistent summary panel that repeats the selected row.
- Keep frequent parent and child actions inline, using compact controls that do not displace the inventory.
- Put module-level operational metadata, such as browser-source URLs, in its own compact sibling section above the hierarchy when it applies to the whole module.
- Let secondary module sections collapse by default, retain actionable status rollups while collapsed, and expand automatically when targeted by a correction or setup deep link.
- Preserve blocker, warning, and review counts on collapsed parents so closing details does not hide actionable state.
- Keep row-level validation concise. Show human-readable causes, correction steps, and reference IDs at the focused correction surface.
- Quick tests must reuse the saved configuration and production test-delivery contract. Require an explicit target choice only when more than one valid target is available.

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
