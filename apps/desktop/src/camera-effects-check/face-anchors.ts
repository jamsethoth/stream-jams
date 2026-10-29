import { OneEuroFilter } from "1eurofilter";

/*
 * Face regions for the check's effects, from MediaPipe Face Landmarker's 478-point mesh
 * (canonical face model indices). Positions are normalised to the tracked image; the
 * tracked image is the picture as shown, after any mirror flip.
 */

export interface Landmark { readonly x: number; readonly y: number }
export interface Point { readonly x: number; readonly y: number }

/** Contour points around each eye; "left" and "right" are the subject's. */
export const rightEyeContour = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
export const leftEyeContour = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
/** Cheek points at the widest part of the face oval. */
export const faceWidthPoints = [234, 454] as const;

export interface FaceAnchors {
  /** Eye centres in picture pixels. */
  readonly leftEye: Point;
  readonly rightEye: Point;
  /** Cheek-to-cheek width in picture pixels; effects scale with it so they stay proportional. */
  readonly faceWidth: number;
}

/** Anchors in picture pixels, or null when the mesh is incomplete. */
export function faceAnchors(landmarks: readonly Landmark[], pictureWidth: number, pictureHeight: number): FaceAnchors | null {
  const at = (index: number): Point | null => {
    const point = landmarks[index];
    return point === undefined ? null : { x: point.x * pictureWidth, y: point.y * pictureHeight };
  };
  const centre = (indices: readonly number[]): Point | null => {
    let x = 0;
    let y = 0;
    for (const index of indices) {
      const point = at(index);
      if (point === null) return null;
      x += point.x;
      y += point.y;
    }
    return { x: x / indices.length, y: y / indices.length };
  };
  const leftEye = centre(leftEyeContour);
  const rightEye = centre(rightEyeContour);
  const cheekA = at(faceWidthPoints[0]);
  const cheekB = at(faceWidthPoints[1]);
  if (leftEye === null || rightEye === null || cheekA === null || cheekB === null) return null;
  return { leftEye, rightEye, faceWidth: Math.hypot(cheekA.x - cheekB.x, cheekA.y - cheekB.y) };
}

/** Effect radius for an eye: about the eye opening plus its surround. */
export function eyeRadius(faceWidth: number): number {
  return Math.max(4, faceWidth * 0.2);
}

/**
 * Big-eyes mesh warp: moves one vertex outward from each eye centre it lies within, so the
 * texture under the eye is stretched (magnified). The magnification is 1 + strength at the
 * centre and fades to none at the radius. Strength is clamped to 1, where the mapping is
 * still monotonic, so triangles never fold over.
 */
export function bigEyesVertex(vertex: Point, eyes: readonly Point[], radius: number, strength: number): Point {
  const amount = Math.min(1, Math.max(0, strength));
  let { x, y } = vertex;
  if (!(radius > 0) || amount === 0) return { x, y };
  for (const eye of eyes) {
    const dx = x - eye.x;
    const dy = y - eye.y;
    const t2 = (dx * dx + dy * dy) / (radius * radius);
    if (t2 >= 1) continue;
    const factor = 1 + amount * (1 - t2) * (1 - t2);
    x = eye.x + dx * factor;
    y = eye.y + dy * factor;
  }
  return { x, y };
}

/**
 * One Euro smoothing for the anchors: steady when the head is still, quick when it moves.
 * Parameters follow the filter authors' guidance for 30 Hz pointing data.
 */
export class AnchorSmoother {
  readonly #filters = Array.from({ length: 5 }, () => new OneEuroFilter(30, 1.0, 0.02, 1.0));

  smooth(anchors: FaceAnchors, timestampSeconds: number): FaceAnchors {
    const [lx, ly, rx, ry, width] = this.#filters.map((filter, index) => filter.filter(
      [anchors.leftEye.x, anchors.leftEye.y, anchors.rightEye.x, anchors.rightEye.y, anchors.faceWidth][index]!, timestampSeconds));
    return { leftEye: { x: lx!, y: ly! }, rightEye: { x: rx!, y: ry! }, faceWidth: width! };
  }

  reset(): void {
    for (const filter of this.#filters) filter.reset();
  }
}
