import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs.js";

export interface PageHeaderProps {
  readonly breadcrumbs: readonly string[];
  readonly description: string;
  readonly status?: ReactNode | undefined;
  readonly title: string;
}

export function PageHeader({ breadcrumbs, description, status, title }: PageHeaderProps) {
  return (
    <header className="management-page-header">
      {breadcrumbs.length > 1 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="management-page-header__row">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {status}
      </div>
    </header>
  );
}
