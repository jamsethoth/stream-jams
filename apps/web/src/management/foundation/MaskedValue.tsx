import { useState } from "react";
import { ManagementToast, type ManagementToastNotice } from "./ManagementToast.js";

export interface MaskedValueProps {
  readonly label: string;
  readonly value: string;
}

export function MaskedValue({ label, value }: MaskedValueProps) {
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<ManagementToastNotice | null>(null);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ tone: "success", message: `Copied ${label}.` });
    } catch (error) {
      setFeedback({
        tone: "failure",
        message: "Copy failed.",
        detail: error instanceof Error ? error.message : "Select and copy the revealed value."
      });
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
      {feedback === null ? null : <ManagementToast notice={feedback} onDismiss={() => setFeedback(null)} />}
    </div>
  );
}

function maskValue(value: string): string {
  const suffix = value.slice(-4);
  return `${"\u2022".repeat(12)}${suffix}`;
}
