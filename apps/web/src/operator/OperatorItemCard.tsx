import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeTone } from "../management/foundation/StatusBadge.js";

export interface OperatorItemDetail {
  readonly label: string;
  readonly value: string;
  readonly tone?: StatusBadgeTone;
}

/**
 * One row of an Operator list (Now playing, Pending, Recent): a title, a one-line summary, an optional
 * action and labelled details. Alerts, Screen Effects and Videos share it so their lists read the same.
 */
export interface OperatorItemCardProps {
  readonly action: ReactNode;
  readonly details: readonly OperatorItemDetail[];
  readonly summary: string;
  readonly title: ReactNode;
  /** Accessible name for the card when the title alone is not plain text. */
  readonly label?: string;
}

export function OperatorItemCard({ action, details, label, summary, title }: OperatorItemCardProps) {
  return (
    <article aria-label={label} className="operator-item">
      <div className="operator-item__summary"><div><strong>{title}</strong><span>{summary}</span></div>{action}</div>
      <dl>
        {details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.tone === undefined ? detail.value : <StatusBadge label={detail.value} tone={detail.tone} />}</dd></div>)}
      </dl>
    </article>
  );
}
