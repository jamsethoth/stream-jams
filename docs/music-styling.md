# Music widget styling contract (version 1)

Music uses native appearance controls for layout, colors, typography and branding. The optional Advanced CSS source is saved with an enabled toggle and `styleContractVersion: 1`. The order inside the widget is built-in styles, then saved control values, then enabled custom CSS. CSS can override a control's visual property. Disabling custom CSS keeps its text and restores the control-based result; a theme reset changes native controls only. Clearing CSS and removing a branding image are separate actions.

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
