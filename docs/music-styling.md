# Music widget styling contract (version 1)

Music uses native appearance controls for layout, colors, typography and branding. The optional Advanced CSS source is saved with an enabled toggle and `styleContractVersion: 1`. The order inside the widget is built-in styles, then saved control values, then enabled custom CSS. CSS can override a control's visual property. Disabling custom CSS keeps its text and restores the control-based result; a theme reset changes native controls only. Clearing CSS and removing a branding image are separate actions.

The Music page follows the Alerts module: **Browser sources**, **Preview**, **Desktop overlay placement**, **Configuration**, then **Custom CSS**. The control panels expand independently. Configuration includes graphical RGB pickers and opacity sliders alongside validated RGBA hex values; changing either updates the same draft. Invalid hex retains the last valid preview color.

Choose **Edit layout** beside the preview to drag its outer corner or edit width/height. Outer resizing uses the grid preference; keyboard arrows remain exact, and Escape cancels a drag. Font sizes stay unchanged and components remain bounded when the widget shrinks.

Expand **Desktop overlay placement** to position the whole Music widget independently of OBS/browser sources. Its 1920 × 1080 logical canvas scales to the selected display. Drag the corner to scale the whole widget proportionally, or use **Desktop Music scale (%)**. Desktop scale is saved separately for full/compact views and leaves browser-source appearance unchanged. Drag with optional grid and edge/center snapping, or enter exact X/Y coordinates. Full and compact desktop views save independent positions with **Save Music appearance**. **Reset desktop placement to alignment** restores the existing alignment preset. Desktop availability, selected display, enablement and Music visibility are shown here; **Open Overlay settings** manages those shared settings. Placement editing does not enable desktop output automatically.

In the same **Edit layout** mode, move or resize artwork, title, artist/album details, progress and time independently. Drag a component box to move it and its corner to resize; select a component to edit its X, Y, width and height numerically. Arrow keys adjust by one widget pixel, or ten with Shift. Escape cancels an active drag. Geometry is bounded to the widget and saved separately for each profile and full/compact view. Resizing a text box does not change its font size. Changes remain a draft until Save, and editor guides never appear in live outputs. **Reset automatic layout** restores the built-in arrangement. Older saved configurations use automatic layout.

Both Music and Alerts offer **Snap to grid** and **Snap to alignment**, independently enabled by default. Pointer movement and resizing use a 10-pixel canvas grid or nearby visible component/canvas edges and horizontal/vertical centers. Alignment takes priority within five screen pixels at the current zoom, and transient guides show the chosen alignment. Turn off either mode independently or both for free placement. Numeric and keyboard changes remain exact. Resizing keeps the leading position fixed. Snapping preferences are editor controls, not saved appearance settings; changing them does not dirty the document. Alerts' grid visibility remains separate.

Enabled nonempty custom CSS can override native geometry, so visual layout editing is disabled while it is active. **Disable custom CSS** remains visible beside the preview even when the CSS panel is collapsed and preserves the CSS text for later use.

Choose an uploaded PNG, JPEG or WebP in **Music appearance and branding** for each Landscape/Vertical and full/compact view. The editor offers contain (whole image), cover (crop), fill (stretch), position and independent image opacity. The image sits above the native fill and behind artwork, text and progress; choosing an image does not resize the widget. **Use image aspect ratio** explicitly derives a bounded height from the current width. The management preview uses sample music and unsaved edits; Save makes them available to live outputs. A missing selected image falls back to the native background, while an empty or disconnected source hides the whole widget. [The checked-in branded layout](examples/music-branding.css) is a non-secret starting example validated by the same parser as preview, save and restore. Paste its contents into Advanced CSS after choosing a branding image through the asset picker.

Custom CSS runs inside the Music widget's Shadow DOM. The output frame, clipping, visibility, pointer behavior and managed layer order remain outside the editable subtree. The inner content root has `.sj-content` and these attributes: `data-view="full|compact"`, `data-theme="dark|light"`, and `data-playback-state="playing|paused|stopped|unknown"`. The supported inner part selectors are:

| Part | Purpose |
| --- | --- |
| `.sj-content` | Inner layout root |
| `.sj-artwork` | Album artwork |
| `.sj-title` | Track title |
| `.sj-artists` | Artist details |
| `.sj-album` | Album details |
| `.sj-progress-track` | Progress track |
| `.sj-progress-fill` | Progress fill |
| `.sj-time` | Time display |
| `.sj-brand-image` | Uploaded branding image |

Use these classes alone or in descendant/sibling selectors, and `::before`/`::after` on an inner part. The three documented data attributes can be selected only on `.sj-content` with an explicit supported value. For example:

```css
.sj-content[data-view="compact"] { display: grid; grid-template-columns: 1fr auto; }
.sj-content[data-view="compact"] .sj-artwork { display: none; }
.sj-progress-track { grid-row: 1; }
@container (max-width: 400px) { .sj-title { font-size: 18px; } }
@keyframes title-enter { from { opacity: 0; } to { opacity: 1; } }
.sj-title { animation: title-enter 250ms ease-out; }
```

The renderer provides six color-only native variables on `.sj-content`: `--sj-title-color`, `--sj-details-color`, `--sj-progress-fill-color`, `--sj-progress-track-color`, `--sj-artwork-placeholder-color`, and `--sj-border-color`. They may be read with `var()` but cannot be redefined in custom CSS. Other custom properties must be declared in the same rule that uses them. Inherited or cross-rule custom properties and `var()` fallbacks are unsupported because their eventual value cannot be verified locally. Animation names must be declared by a local `@keyframes` rule; compilation prefixes definitions and references with the widget instance ID.

Qualified style rules and validated `@media`, `@supports`, `@container`, and `@keyframes` rules are supported. Grid, flex, positioning, visibility, gradients, safe transforms and local animation are available through recognized CSS properties and value functions. Nested style rules, unknown selectors/properties/functions, host/global/slot selectors, imports, font-face rules, HTML/JavaScript text, executable syntax and resource-loading values such as `url()` and `image-set()` are rejected. Images and fonts are selected through Stream Jams asset controls. Source is limited to 32 KiB UTF-8, 512 rules, 4,096 declarations and eight levels of at-rule nesting. Validation returns a line and column and rejects the entire stylesheet; it never strips offending text silently.

Preview, save and restore use the same validator. An invalid draft leaves the last valid preview and saved live style in place. If persisted CSS unexpectedly fails validation at runtime, the renderer falls back to native styling; the operator can disable custom CSS from outside the styled widget.

Code that validates or compiles Music CSS imports `validateMusicCss` or `compileMusicCss` from `@stream-jams/core/music-style-policy`. The renderer loads that same shared policy only when enabled CSS has nonempty source, keeping the ordinary overlay and management route bundles within their budgets. A changed or disabled style discards an obsolete compile result.

To adapt a standalone widget stylesheet, replace document-wide `:root`, `body` and `#app` rules with `.sj-content`; move relevant values to native controls where possible. Replace old internal selectors with the documented `.sj-*` parts. There is no automatic stylesheet import or byte-for-byte compatibility promise. Contract changes require a style version and migration path.

Configuration is always visible. Appearance starts collapsed and shows only the selected Widget, Artwork, Title, Details or Progress controls. Selecting a component in Edit layout opens its appearance controls; Time shares Details typography. Advanced spacing, More text options and Custom shadow retain precise controls. Shadow presets are Off, Subtle and Strong. Swatch/hex/opacity remain synchronized, with invalid hex rejected. Reset appearance to theme affects the current profile/view and preserves branding.

Enable/Disable Music module appears directly below Browser sources with saved module status and the same confirmation pattern as other modules. It immediately changes module enablement without saving or discarding appearance drafts.

Paused-to-playing resume starts a new shared idle period, revealing hidden Music again. Pausing, repeated playing updates and routine progress observations do not restart it.
