/*
 * Frame geometry shared by the pipeline (which draws it) and the receivers (which read it back).
 * A packed frame carries the processed picture on top and its alpha matte below at half
 * resolution, so a VP8 or H.264 stream can still render transparent in OBS.
 */

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface FrameLayout {
  readonly width: number;
  readonly height: number;
  readonly picture: Rect;
  /** Half-resolution matte below the picture; null when the frame is not packed. */
  readonly matte: Rect | null;
  /** Top-left corner and cell size of the output timestamp strip. */
  readonly stamp: { readonly x: number; readonly y: number; readonly cell: number };
}

/** The scene every receiver composes on, whatever the camera format. */
export const sceneWidth = 1920;
export const sceneHeight = 1080;
/** Matches the strip length in ../video-mirror-check/timestamp-barcode.ts. */
const stampCells = 24;

/** Camera dimensions are even in every format we offer; odd ones round the matte up so it never clips. */
export function frameLayout(cameraWidth: number, cameraHeight: number, packed: boolean): FrameLayout {
  const picture = { x: 0, y: 0, width: cameraWidth, height: cameraHeight };
  const cell = Math.max(8, Math.round(cameraWidth / 80));
  const pad = cell;
  if (!packed) return { width: cameraWidth, height: cameraHeight, picture, matte: null, stamp: { x: pad, y: pad, cell } };
  const matte = { x: 0, y: cameraHeight, width: Math.ceil(cameraWidth / 2), height: Math.ceil(cameraHeight / 2) };
  // The strip goes in the unused right half of the matte row, so recombining hides it.
  const stamp = { x: matte.width + pad, y: cameraHeight + pad, cell: Math.min(cell, Math.floor((cameraWidth - matte.width - 2 * pad) / stampCells)) };
  return { width: cameraWidth, height: cameraHeight + matte.height, picture, matte, stamp };
}

/** True when a received frame has the packed shape for this camera format (the encoder may have scaled it). */
export function isPackedFrame(videoWidth: number, videoHeight: number, cameraWidth: number, cameraHeight: number): boolean {
  if (!(videoWidth > 0 && videoHeight > 0 && cameraWidth > 0 && cameraHeight > 0)) return false;
  const ratio = videoHeight / videoWidth;
  const plain = cameraHeight / cameraWidth;
  const packed = frameLayout(cameraWidth, cameraHeight, true).height / cameraWidth;
  return Math.abs(ratio - packed) < Math.abs(ratio - plain);
}

/** Fits a picture inside a layout box without cropping, centred. */
export function containRect(box: Rect, pictureWidth: number, pictureHeight: number): Rect {
  if (!(pictureWidth > 0 && pictureHeight > 0)) return box;
  const scale = Math.min(box.width / pictureWidth, box.height / pictureHeight);
  const width = pictureWidth * scale;
  const height = pictureHeight * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Cell centres, as fractions of the camera picture, where the receiver reads the optical
 * timestamp the operator films off a screen: a 6 x 4 grid inside the central guide box.
 */
export const opticalGuide: Rect = { x: 0.2, y: 0.25, width: 0.6, height: 0.5 };
export const opticalColumns = 6;
export const opticalRows = 4;

export function opticalCellCentres(): readonly { readonly x: number; readonly y: number }[] {
  const centres: { x: number; y: number }[] = [];
  for (let row = 0; row < opticalRows; row += 1) {
    for (let column = 0; column < opticalColumns; column += 1) {
      centres.push({
        x: opticalGuide.x + (column + 0.5) * opticalGuide.width / opticalColumns,
        y: opticalGuide.y + (row + 0.5) * opticalGuide.height / opticalRows
      });
    }
  }
  return centres;
}
