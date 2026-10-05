import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge.js";
import "./browser-source-row.css";

export function BrowserSourceRow({ label, ready, width, height, telemetry, url, revealed, actions }: {
  readonly label: string; readonly ready: boolean; readonly width: number; readonly height: number;
  readonly telemetry: string; readonly url: string | null; readonly revealed: boolean; readonly actions: ReactNode;
}) {
  return <article aria-label={`${label} browser source`} className="browser-source-row">
    <div className="browser-source-row__heading"><strong>{label}</strong><StatusBadge label={ready ? "Ready" : "Needs setup"} tone={ready ? "positive" : "warning"} /></div>
    <p className="browser-source-row__telemetry">{telemetry}</p>
    <p className="browser-source-row__dimensions"><strong>{width} x {height}</strong></p>
    <p className="browser-source-row__guidance">Add a Browser Source in OBS at {width} x {height}, then paste this URL.</p>
    {url === null ? <p className="browser-source-row__missing">Create a URL before adding this profile to OBS.</p> : revealed ? <input aria-label={`${label} browser source URL`} readOnly value={url} /> : <code>{url.replace(/(\/(?:live|test)\/)[^?]+/u, "$1********")}</code>}
    <div className="browser-source-row__actions">{actions}</div>
  </article>;
}
