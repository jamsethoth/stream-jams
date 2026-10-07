import { Button, Checkbox, Textarea } from "@mantine/core";
import type { MusicCssValidationResult } from "@stream-jams/core/music-style-policy";
import type { MusicCssConfig } from "@stream-jams/core";

export function MusicCssEditor({ value, validation, checking, onChange, onDisable, showDisable = true }: {
  readonly value: MusicCssConfig;
  readonly validation: MusicCssValidationResult | null;
  readonly checking: boolean;
  readonly onChange: (value: MusicCssConfig) => void;
  readonly onDisable: () => void;
  readonly showDisable?: boolean;
}) {
  return <section aria-label="Advanced CSS" className="music-editor__section">
    <h3>Advanced CSS</h3>
    <p>Style documented Music parts within this widget. Changes preview after validation and reach live outputs only after Save.</p>
    <Checkbox label="Enable custom CSS" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.currentTarget.checked })} />
    <Textarea className="music-editor__css-label" label="Custom CSS" error={validation?.valid === false} attributes={{ input: { "aria-describedby": "music-css-help music-css-error" } }} onChange={event => onChange({ ...value, source: event.currentTarget.value })} rows={10} spellCheck={false} value={value.source} />
    <p id="music-css-help">Selectors: .sj-content, .sj-artwork, .sj-title, .sj-artists, .sj-album, .sj-progress-track, .sj-progress-fill, .sj-time, .sj-brand-image. No external URLs or host selectors.</p>
    <div id="music-css-error" role={validation?.valid === false ? "alert" : "status"}>{checking ? "Checking CSS…" : validation?.valid === false ? validation.errors.map(error => `Line ${error.line}, column ${error.column}: ${error.message}`).join(" ") : "CSS is valid."}</div>
    <div className="music-editor__actions">{showDisable ? <Button variant="default" onClick={onDisable} type="button">Disable custom CSS</Button> : null}<Button variant="default" onClick={() => onChange({ ...value, source: "", enabled: false })} type="button">Clear CSS</Button></div>
  </section>;
}
