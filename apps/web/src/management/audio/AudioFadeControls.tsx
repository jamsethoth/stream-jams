export function AudioFadeControls({ fadeInMs = 0, fadeOutMs = 0, onChange }: {
  readonly fadeInMs?: number | undefined;
  readonly fadeOutMs?: number | undefined;
  readonly onChange: (value: { readonly fadeInMs: number; readonly fadeOutMs: number }) => void;
}) {
  const update = (key: "fadeInMs" | "fadeOutMs", value: number) => onChange({ fadeInMs, fadeOutMs, [key]: value });
  return <fieldset>
    <legend>Audio fades</legend>
    <p>Fade volume smoothly at the beginning or end of this source.</p>
    <FadeField label="Fade in" value={fadeInMs} onChange={(value) => update("fadeInMs", value)} />
    <FadeField label="Fade out" value={fadeOutMs} onChange={(value) => update("fadeOutMs", value)} />
  </fieldset>;
}

function FadeField({ label, value, onChange }: { readonly label: string; readonly value: number; readonly onChange: (value: number) => void }) {
  const enabled = value > 0;
  return <div>
    <label><input checked={enabled} onChange={(event) => onChange(event.currentTarget.checked ? 500 : 0)} type="checkbox" />{label}</label>
    {enabled ? <label>{label} duration (milliseconds)<input aria-label={`${label} duration (milliseconds)`} max={120_000} min={1} onChange={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next)) onChange(Math.max(1, Math.min(120_000, Math.round(next))));
    }} type="number" value={value} /></label> : null}
  </div>;
}
