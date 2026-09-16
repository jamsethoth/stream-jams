export type SelectedDisplay = { id: string; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number };
export const overlayWindowPolicy = Object.freeze({
  transparent: true, frame: false, focusable: false, skipTaskbar: true, show: false
} as const);
export function selectBoundDisplay(displays: readonly SelectedDisplay[], selectedId: string | null): SelectedDisplay | null {
  return displays.find(display => display.id === selectedId) ?? null;
}
