export type ExactLabelMatch<T> =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly value: T }
  | { readonly kind: "ambiguous"; readonly count: number };

export type AutomaticBindingState = "not-needed" | "disabled" | "no-match" | "ambiguous" | "rebound";

export function findExactUniqueLabelMatch<T extends { readonly label: string }>(
  candidates: readonly T[],
  savedLabel: string
): ExactLabelMatch<T> {
  const matches = candidates.filter(candidate => candidate.label === savedLabel);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", value: matches[0]! };
  return { kind: "ambiguous", count: matches.length };
}
