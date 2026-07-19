export function Breadcrumbs({ items }: { readonly items: readonly string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="management-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li aria-current={index === items.length - 1 ? "page" : undefined} key={`${item}-${index}`}>{item}</li>
        ))}
      </ol>
    </nav>
  );
}
