import { rgbaColorSchema } from "@stream-jams/core";

export interface RgbaColorControlProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function RgbaColorControl({ label, value, onChange }: RgbaColorControlProps) {
  const parsed = rgbaColorSchema.safeParse(value);
  const canonical = parsed.success ? parsed.data : "#000000FF";
  const rgb = canonical.slice(0, 7);
  const alpha = canonical.slice(7);
  const opacity = Math.round(Number.parseInt(alpha, 16) * 100 / 255);

  function emit(candidate: string) {
    const result = rgbaColorSchema.safeParse(candidate);
    if (result.success) onChange(result.data);
  }

  return (
    <div className="alert-editor-inspector__rgba">
      <label>
        <span>{label} color</span>
        <input
          aria-label={`${label} color`}
          onChange={(event) => emit(`${event.currentTarget.value}${alpha}`)}
          type="color"
          value={rgb}
        />
      </label>
      <label>
        <span>{label} opacity</span>
        <input
          aria-label={`${label} opacity`}
          max="100"
          min="0"
          onChange={(event) => {
            const percent = Math.max(0, Math.min(100, Number(event.currentTarget.value)));
            const nextAlpha = Math.round(percent * 255 / 100).toString(16).padStart(2, "0").toUpperCase();
            emit(`${rgb}${nextAlpha}`);
          }}
          step="1"
          type="range"
          value={opacity}
        />
      </label>
    </div>
  );
}
