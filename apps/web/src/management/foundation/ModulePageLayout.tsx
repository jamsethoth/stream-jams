import { Group, Stack, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import "./module-page-layout.css";

/** Presentation only: pages retain requests, drafts, feedback and disclosure state. */
export function ModulePageLayout({ feedback, controls, outputs, secondary, children, className = "" }: {
  readonly feedback?: ReactNode; readonly controls?: ReactNode; readonly outputs?: ReactNode;
  readonly secondary?: ReactNode; readonly children: ReactNode; readonly className?: string;
}) {
  return <Stack className={`module-page-layout ${className}`} gap="lg">{feedback}{controls}{outputs}{children}{secondary}</Stack>;
}

export function ModuleControls({ status, description, children }: { readonly status: ReactNode; readonly description?: ReactNode; readonly children: ReactNode }) {
  return <Group aria-label="Module controls" className="module-controls" justify="space-between" wrap="wrap"><div>{status}{description == null ? null : <p className="module-section-description">{description}</p>}</div><Group gap="sm" wrap="wrap">{children}</Group></Group>;
}

export function SectionHeading({ title, description, actions, summary, id, level = 2 }: {
  readonly title: ReactNode; readonly description?: ReactNode; readonly actions?: ReactNode; readonly summary?: ReactNode;
  readonly id?: string; readonly level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return <Group className="module-section-heading" justify="space-between" align="center" wrap="wrap"><div><Heading id={id}>{title}</Heading>{description == null ? null : <p className="module-section-description">{description}</p>}</div>{summary}{actions}</Group>;
}

export function ModuleSection({ title, label, id, description, actions, children, level = 2 }: {
  readonly title: ReactNode; readonly label: string; readonly id?: string; readonly description?: ReactNode;
  readonly actions?: ReactNode; readonly children: ReactNode; readonly level?: 2 | 3;
}) {
  return <section aria-label={label} className="module-section" id={id}><SectionHeading title={title} description={description} actions={actions} level={level} />{children}</section>;
}

/** The one expand/collapse affordance; native details summaries draw the same chevron in CSS. */
export function DisclosureIcon({ expanded }: { readonly expanded: boolean }) {
  return <span aria-hidden="true" className="management-disclosure-icon" data-expanded={expanded || undefined} />;
}

/** Controlled disclosure keeps correction targets and conditional child lifetimes with the page. */
export function DisclosureSection({ title, label = title, detailsId, id, expanded, onToggle, description, summary, children, className = "" }: {
  readonly title: string; readonly label?: string; readonly detailsId: string; readonly id?: string;
  readonly expanded: boolean; readonly onToggle: () => void; readonly description?: ReactNode;
  readonly summary?: ReactNode; readonly children: ReactNode; readonly className?: string;
}) {
  return <section aria-label={label} className={`module-section module-disclosure ${className}`} id={id}>
    <SectionHeading title={<UnstyledButton className="module-disclosure-toggle" aria-controls={detailsId} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${title.toLowerCase()}`} onClick={onToggle}><DisclosureIcon expanded={expanded} /><span>{title}</span></UnstyledButton>} description={description} summary={summary} />
    {expanded ? <div className="module-disclosure-body" id={detailsId}>{children}</div> : null}
  </section>;
}
