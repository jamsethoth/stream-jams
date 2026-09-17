import type { ScreenEffectDocument } from "@stream-jams/core";
import type { ReactNode } from "react";

export function ScreenEffectTree({ documents, selectedEffectId, selectedVariantId, onSelect, actions }: {
  readonly documents: readonly ScreenEffectDocument[];
  readonly selectedEffectId?: string | undefined;
  readonly selectedVariantId?: string | undefined;
  readonly onSelect: (effectId: string, variantId: string) => void;
  readonly actions?: ((document: ScreenEffectDocument) => ReactNode) | undefined;
}) {
  return <div className="screen-effect-tree">{documents.map((document) => {
    const enabledWeight = document.variants.reduce(
      (total, variant) => variant.enabled ? total + variant.weight : total,
      0
    );
    return (
    <details className="screen-effect-tree__effect" key={document.id} open={document.id === selectedEffectId ? true : undefined}>
      <summary><strong>{document.name}</strong><span>{document.enabled ? "Enabled" : "Disabled"} · {document.variants.length} variants</span></summary>
      {actions?.(document)}
      <ul>{document.variants.map((variant) => <li key={variant.id}>
        <button aria-label={`${variant.name} variant`} aria-current={document.id === selectedEffectId && variant.id === selectedVariantId ? "true" : undefined} onClick={() => onSelect(document.id, variant.id)} type="button">
          <strong>{variant.name}</strong><small>Weight {variant.weight} · {formatPercent(variant.enabled && enabledWeight > 0 ? variant.weight / enabledWeight * 100 : 0)} expected · {variant.enabled ? "Enabled" : "Disabled"}</small>
        </button>
      </li>)}</ul>
    </details>
  );})}</div>;
}

function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}
