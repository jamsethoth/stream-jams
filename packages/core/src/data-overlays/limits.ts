export const dataOverlayLimits = {
  values: 1000, goals: 250, canvases: 50, elementsPerCanvas: 100, textBytes: 2048,
  staleGraceMs: 10 * 60 * 1000, nameCharacters: 120, borderWidthPx: 32,
  fontSizePx: { min: 8, max: 256 }
} as const;
