export type StatusBadgeTone = "neutral" | "positive" | "warning" | "negative" | "info";

export function StatusBadge({ label, tone = "neutral" }: { readonly label: string; readonly tone?: StatusBadgeTone }) {
  return <span className={`management-status-badge management-status-badge--${tone}`}>{label}</span>;
}
