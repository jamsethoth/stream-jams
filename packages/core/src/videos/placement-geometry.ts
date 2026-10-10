import type { VideosLayout } from "./types.js";

/*
 * How a Videos box lays out its picture and caption. Kept apart from the layout rules so only the
 * overlays and the placement editor carry it, not the management startup graph.
 */

// Caption metrics at full size; the overlay CSS scales the same numbers with --video-scale.
const captionPaddingPx = 12;
const titleLinePx = 34;
const requesterLinePx = 24;
const captionLineGapPx = 4;
const frameCaptionGapPx = 12;
/** Width of the default box: captions keep their full size at or above it. */
const fullSizeWidthPx = 1382;

export interface VideosPlacementGeometry {
  /** Caption and spacing scale, 0.5 to 1, so a small box keeps readable proportions. */
  readonly scale: number;
  /** The 16:9 picture, in canvas pixels relative to the box. */
  readonly frame: { readonly width: number; readonly height: number };
  /** Space between the picture and the caption. */
  readonly gap: number;
}

/**
 * Fits the largest 16:9 picture that leaves room for a two-line caption inside the box.
 * The picture size does not depend on whether an item has a title, so it stays steady
 * from one video to the next; the overlay anchors picture and caption to the box's bottom center.
 */
export function videosPlacementGeometry(layout: VideosLayout): VideosPlacementGeometry {
  const scale = Math.min(1, Math.max(0.5, layout.width / fullSizeWidthPx));
  const reserve = (captionPaddingPx * 2 + titleLinePx + captionLineGapPx + requesterLinePx + frameCaptionGapPx) * scale;
  const width = Math.max(0, Math.min(layout.width, (layout.height - reserve) * 16 / 9));
  return { scale, frame: { width, height: width * 9 / 16 }, gap: frameCaptionGapPx * scale };
}
