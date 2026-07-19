import { useState } from "react";

export interface MaskedValueProps {
  readonly label: string;
  readonly value: string;
}

export function MaskedValue({ label, value }: MaskedValueProps) {
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`Copied ${label}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? `Copy failed: ${error.message}` : "Copy failed. Select and copy the revealed value.");
    }
  }

  return (
    <div className="management-masked-value">
      <code aria-label={label}>{revealed ? value : maskValue(value)}</code>
      <div className="management-masked-value__actions">
        <button
          aria-label={`${revealed ? "Hide" : "Reveal"} ${label}`}
          className="button button--secondary button--compact"
          onClick={() => {
            setRevealed((current) => !current);
            setFeedback(null);
          }}
          type="button"
        >
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button
          aria-label={`Copy ${label}`}
          className="button button--secondary button--compact"
          onClick={() => void copyValue()}
          type="button"
        >
          Copy
        </button>
      </div>
      {feedback === null ? null : <span aria-live="polite" className="management-copy-feedback">{feedback}</span>}
    </div>
  );
}

function maskValue(value: string): string {
  const suffix = value.slice(-4);
  return `${"\u2022".repeat(12)}${suffix}`;
}
