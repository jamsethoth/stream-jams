import { Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs.js";

export interface PageHeaderProps {
  readonly action?: ReactNode | undefined;
  readonly breadcrumbs: readonly string[];
  readonly description: string;
  readonly status?: ReactNode | undefined;
  readonly title: string;
}

export function PageHeader({ action, breadcrumbs, description, status, title }: PageHeaderProps) {
  return (
    <header className="management-page-header">
      {breadcrumbs.length > 1 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <Group className="management-page-header__row" align="flex-start" justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>{title}</Title>
          <Text component="p">{description}</Text>
        </div>
        {status === undefined && action === undefined ? null : (
          <Group className="management-page-header__actions" gap="sm" wrap="wrap">{status}{action}</Group>
        )}
      </Group>
    </header>
  );
}
