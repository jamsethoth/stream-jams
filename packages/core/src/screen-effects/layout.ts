export const screenEffectCanvas = { width: 1920, height: 1080 } as const;

export interface ScreenEffectOutputBounds {
  readonly width: number;
  readonly height: number;
}

export interface ScreenEffectCanvasFit extends ScreenEffectOutputBounds {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export function fitScreenEffectCanvas(output: ScreenEffectOutputBounds): ScreenEffectCanvasFit {
  if (!Number.isFinite(output.width) || output.width <= 0 || !Number.isFinite(output.height) || output.height <= 0) {
    throw new RangeError("Screen Effect output bounds must be finite positive numbers");
  }
  const scale = Math.min(
    output.width / screenEffectCanvas.width,
    output.height / screenEffectCanvas.height
  );
  const width = screenEffectCanvas.width * scale;
  const height = screenEffectCanvas.height * scale;
  return {
    x: (output.width - width) / 2,
    y: (output.height - height) / 2,
    width,
    height,
    scale
  };
}
