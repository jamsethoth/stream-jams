import { Breadcrumbs as MantineBreadcrumbs, Text } from "@mantine/core";

export function Breadcrumbs({ items }: { readonly items: readonly string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="management-breadcrumbs">
      <MantineBreadcrumbs role="list" separator={<span aria-hidden="true">/</span>} styles={{ root: { flexWrap: "wrap" } }}>
        {items.map((item, index) => (
          <Text component="span" role="listitem" aria-current={index === items.length - 1 ? "page" : undefined} key={`${item}-${index}`}>{item}</Text>
        ))}
      </MantineBreadcrumbs>
    </nav>
  );
}
