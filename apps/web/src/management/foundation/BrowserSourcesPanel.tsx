import type { ReactNode } from "react";
import "./browser-sources-panel.css";

/** Shared presentation for module Browser Sources; callers own output actions and state. */
export function BrowserSourcesPanel({ children, detailsId, expanded, onToggle, readyCount, needsSetupCount, label = "Browser sources", id, description = "One live URL per target profile.", refreshFailed = false, context }: {
  readonly children: ReactNode;
  readonly detailsId: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly readyCount: number;
  readonly needsSetupCount: number;
  readonly label?: string;
  readonly id?: string;
  readonly description?: string;
  readonly refreshFailed?: boolean;
  readonly context?: string;
}) {
  return <section aria-label={label} className="browser-sources-panel" id={id}>
    <div className="browser-sources-panel__row">
      <div className="browser-sources-panel__heading">
        <h2><button aria-controls={detailsId} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} browser sources`} className="browser-sources-panel__toggle" onClick={onToggle} type="button"><span aria-hidden="true">{expanded ? "−" : "+"}</span><span>Browser sources</span></button></h2>
        <p>{description}</p>
      </div>
      <div role="group" aria-label="Browser source summary" className="browser-sources-panel__summary">
        {readyCount > 0 ? <span className="browser-sources-panel__count browser-sources-panel__count--ready">{readyCount} ready</span> : null}
        {needsSetupCount > 0 ? <span className="browser-sources-panel__count browser-sources-panel__count--warning">{needsSetupCount} needs setup</span> : null}
        {refreshFailed ? <span className="browser-sources-panel__count browser-sources-panel__count--error">Status refresh failed</span> : null}
        {context === undefined ? null : <span className="browser-sources-panel__context">{context}</span>}
      </div>
    </div>
    {expanded ? <div className="browser-sources-panel__details" id={detailsId}>{children}</div> : null}
  </section>;
}
