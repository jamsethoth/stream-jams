import { Button } from "@mantine/core";
import { useState } from "react";
import { formatCount, formatDateTime } from "../foundation/formatters.js";
import type { RetiredOutputAttempt } from "./overlay-surfaces-api.js";

const moduleSourceLinks = [
  { label: "Alerts sources", href: "/manage/modules/alerts#browser-sources" },
  { label: "Screen Effects source", href: "/manage/modules/screen-effects#browser-sources" },
  { label: "Timers sources", href: "/manage/modules/timers#browser-sources" },
  { label: "Music sources", href: "/manage/modules/music#browser-sources" },
  { label: "Videos source", href: "/manage/modules/videos#browser-sources" }
] as const;
const dismissalKey = "stream-jams-retired-output-banner-dismissed";

/** Latest attempt time; a newer attempt after dismissal shows the banner again. */
export function retiredOutputSignature(attempts: readonly RetiredOutputAttempt[]): string {
  return attempts.reduce((latest, attempt) => latest === "" || Date.parse(attempt.lastSeenAt) > Date.parse(latest) ? attempt.lastSeenAt : latest, "");
}

export function readRetiredOutputDismissal(): string | null {
  try { return window.localStorage.getItem(dismissalKey); }
  // error-provenance: allow expected -- bounded browser-storage fallback; the banner shows again
  catch { return null; }
}

function writeRetiredOutputDismissal(signature: string): void {
  try { window.localStorage.setItem(dismissalKey, signature); }
  // error-provenance: allow expected -- bounded browser-storage fallback; dismissal still applies to this view
  catch { /* Dismissal still applies for this view. */ }
}

/** True when the server reports retired sources that the operator has not dismissed since their latest attempt. */
export function retiredOutputBannerVisible(attempts: readonly RetiredOutputAttempt[] | undefined, dismissed: string | null): attempts is readonly RetiredOutputAttempt[] {
  return attempts !== undefined && attempts.length > 0 && retiredOutputSignature(attempts) !== dismissed;
}

/** Dismissible warning for retired public test or unified Browser Sources that are still connecting. */
export function RetiredOutputsBanner({ attempts, onDismiss }: {
  readonly attempts: readonly RetiredOutputAttempt[];
  readonly onDismiss: (signature: string) => void;
}) {
  return <section aria-labelledby="retired-outputs-banner-title" className="management-error-banner management-error-banner--warning retired-outputs-banner" role="region">
    <div>
      <strong id="retired-outputs-banner-title">An old test or unified OBS source is still connecting.</strong>
      <p>Replace it with the new per-module source URL and size shown below.</p>
      <ul className="retired-outputs-banner__attempts">
        {attempts.map((attempt) => <li key={attempt.kind}>{retiredKindLabel(attempt.kind)} · {formatCount(attempt.count, { one: "attempt", other: "attempts" })} · last seen <time dateTime={attempt.lastSeenAt}>{formatDateTime(attempt.lastSeenAt)}</time></li>)}
      </ul>
      <nav aria-label="Per-module Browser sources" className="retired-outputs-banner__links">
        {moduleSourceLinks.map(({ href, label }) => <a href={href} key={href}>{label}</a>)}
      </nav>
    </div>
    <div className="management-error-banner__meta">
      <Button variant="default" size="xs" onClick={() => onDismiss(retiredOutputSignature(attempts))} type="button">Dismiss</Button>
    </div>
  </section>;
}

/** Owns per-viewer dismissal so the panel only supplies the reported attempts. */
export function useRetiredOutputDismissal(): readonly [string | null, (signature: string) => void] {
  const [dismissed, setDismissed] = useState<string | null>(readRetiredOutputDismissal);
  return [dismissed, (signature: string) => { writeRetiredOutputDismissal(signature); setDismissed(signature); }] as const;
}

function retiredKindLabel(kind: string): string {
  if (kind === "unified") return "Old unified source";
  if (kind === "test") return "Old test source";
  return `Old ${kind} source`;
}
