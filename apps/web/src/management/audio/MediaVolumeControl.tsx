export function MediaVolumeControl({ label, value, onChange, disabled = false }: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
}) {
  return <label><span>{label} (%)</span>
    <input
      aria-label={label}
      disabled={disabled}
      max={200}
      min={0}
      onChange={(event) => {
        const percentage = event.currentTarget.valueAsNumber;
        if (Number.isFinite(percentage) && percentage >= 0 && percentage <= 200) onChange(percentage / 100);
      }}
      step={1}
      type="number"
      value={value * 100}
    />
  </label>;
}
