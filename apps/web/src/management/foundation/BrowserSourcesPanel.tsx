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

/**
 * One OBS setup notice per module Browser sources panel. Pages own it so the copy matches
 * whether authoritative sizes are currently shown beside their URLs.
 */
export function BrowserSourceSetupNotice({ sizesShown }: { readonly sizesShown: boolean }) {
  return <p className="browser-sources-panel__setup" role="note">
    {sizesShown
      ? "Add each URL below to OBS as a Browser Source and set its width and height to the size shown beside it. If you change a saved size later, update the OBS source to match."
      : "Add each URL below to OBS as a Browser Source. Its width and height appear beside the URL once the saved size loads; set the OBS source to match."}
    {" "}Delete any old test or unified sources; they no longer display anything.
  </p>;
}

/** True only when every listed source reports its authoritative saved canvas. */
export function browserSourceSizesShown(sources: readonly { readonly canvas?: unknown }[]): boolean {
  return sources.length > 0 && sources.every(source => source.canvas !== undefined);
}
