import { useLayoutEffect, useRef } from "react";

/**
 * When a conditional control unmounts while it held focus (Save, Revert, Clear filters),
 * the browser drops focus to <body>. Move it to a stable nearby target instead.
 */
export function useFocusFallback(visible: boolean, target: () => HTMLElement | null | undefined): void {
  const wasVisible = useRef(visible);
  const targetRef = useRef(target);
  targetRef.current = target;
  useLayoutEffect(() => {
    if (wasVisible.current && !visible) {
      const active = document.activeElement;
      if (active === null || active === document.body) targetRef.current()?.focus({ preventScroll: true });
    }
    wasVisible.current = visible;
  }, [visible]);
}

/** Render-position form of useFocusFallback for controls rendered inside lists. */
export function FocusFallback({ visible, target }: { readonly visible: boolean; readonly target: () => HTMLElement | null | undefined }) {
  useFocusFallback(visible, target);
  return null;
}
