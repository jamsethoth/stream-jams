import type { ReactNode } from "react";
import { DisclosureSection } from "./ModulePageLayout.js";
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
  return <DisclosureSection className="browser-sources-panel" title="Browser sources" label={label} detailsId={detailsId} expanded={expanded} onToggle={onToggle} description={description} {...(id === undefined ? {} : { id })} summary={<div role="group" aria-label="Browser source summary" className="browser-sources-panel__summary">
    {readyCount > 0 ? <span className="browser-sources-panel__count browser-sources-panel__count--ready">{readyCount} ready</span> : null}
    {needsSetupCount > 0 ? <span className="browser-sources-panel__count browser-sources-panel__count--warning">{needsSetupCount} needs setup</span> : null}
    {refreshFailed ? <span className="browser-sources-panel__count browser-sources-panel__count--error">Status refresh failed</span> : null}
    {context === undefined ? null : <span className="browser-sources-panel__context">{context}</span>}
  </div>}>{children}</DisclosureSection>;
}
