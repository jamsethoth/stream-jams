import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge.js";
import "./browser-source-row.css";

export function BrowserSourceRow({ label, ready, metadata, canvas, telemetry, guidance, url, actions }: {
  readonly canvas?: { readonly width: number; readonly height: number } | undefined;
  readonly label: string; readonly ready: boolean; readonly metadata?: ReactNode;
  readonly telemetry: ReactNode; readonly guidance?: ReactNode; readonly url: ReactNode; readonly actions: ReactNode;
}) {
  return <article aria-label={`${label} browser source`} className="browser-source-row">
    <div className="browser-source-row__heading"><strong>{label}</strong><StatusBadge label={ready ? "Ready" : "Needs setup"} tone={ready ? "positive" : "warning"} /></div>
    <p className="browser-source-row__telemetry">{telemetry}</p>
    {canvas === undefined ? null : <div className="browser-source-row__dimensions"><strong><bdi dir="ltr">{canvas.width} x {canvas.height}</bdi></strong></div>}
    {metadata == null ? null : <div className="browser-source-row__dimensions">{metadata}</div>}
    {guidance == null ? null : <p className="browser-source-row__guidance">{guidance}</p>}
    <div className="browser-source-row__url">{url}</div>
    <div className="browser-source-row__actions">{actions}</div>
  </article>;
}
