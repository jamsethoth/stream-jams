import { describe, expect, it } from "vitest";
import { AnchorSmoother, bigEyesVertex, eyeRadius, faceAnchors, leftEyeContour, rightEyeContour, type Landmark } from "./face-anchors.js";
import { advertisedPresets, exactConstraints } from "./formats.js";
import { containRect, frameLayout, isPackedFrame, opticalCellCentres } from "./frame-layout.js";
import { adaptiveThreshold, decodeOpticalDelayMs, encodeOpticalBits, opticalStepMs } from "./optical-code.js";

describe("matte packing", () => {
  it("puts a half-resolution matte below the picture and the strip beside it", () => {
    const packed = frameLayout(1920, 1080, true);
    expect(packed).toMatchObject({ width: 1920, height: 1620, picture: { x: 0, y: 0, width: 1920, height: 1080 }, matte: { x: 0, y: 1080, width: 960, height: 540 } });
    // The strip sits in the unused right half of the matte row, fully inside the frame.
    expect(packed.stamp.x).toBeGreaterThanOrEqual(960);
    expect(packed.stamp.x + 24 * packed.stamp.cell).toBeLessThanOrEqual(1920);
    expect(packed.stamp.y + packed.stamp.cell).toBeLessThanOrEqual(1620);
  });

  it("fits 4K, odd sizes and the plain frame", () => {
    expect(frameLayout(3840, 2160, true)).toMatchObject({ width: 3840, height: 3240, matte: { width: 1920, height: 1080 } });
    expect(frameLayout(1281, 721, true).matte).toEqual({ x: 0, y: 721, width: 641, height: 361 });
    expect(frameLayout(1280, 720, false)).toMatchObject({ width: 1280, height: 720, matte: null, stamp: { x: 16, y: 16, cell: 16 } });
  });

  it("recognises a packed frame even after the encoder scales it", () => {
    expect(isPackedFrame(1920, 1620, 1920, 1080)).toBe(true);
    expect(isPackedFrame(960, 810, 1920, 1080)).toBe(true);
    expect(isPackedFrame(1920, 1080, 3840, 2160)).toBe(false);
    expect(isPackedFrame(1440, 1620, 1440, 1080)).toBe(true);
    expect(isPackedFrame(0, 0, 1920, 1080)).toBe(false);
  });

  it("places the picture inside the layout box without cropping", () => {
    expect(containRect({ x: 1280, y: 720, width: 640, height: 360 }, 1920, 1080)).toEqual({ x: 1280, y: 720, width: 640, height: 360 });
    expect(containRect({ x: 0, y: 0, width: 1920, height: 1080 }, 1440, 1080)).toEqual({ x: 240, y: 0, width: 1440, height: 1080 });
    expect(containRect({ x: 0, y: 0, width: 100, height: 100 }, 0, 0)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe("optical timing code", () => {
  const read = (bits: readonly boolean[]) => bits.map(bit => bit ? 30 : 220);

  it("round-trips a filmed clock into a delay within half a step", () => {
    const shown = 1_791_420_413_651;
    const delay = decodeOpticalDelayMs(read(encodeOpticalBits(shown)), shown + 120);
    expect(delay).not.toBeNull();
    expect(Math.abs(delay! - 120)).toBeLessThanOrEqual(opticalStepMs / 2);
  });

  it("misreads by one step at most when an exposure straddles a change", () => {
    const step = 44_785_510;
    const before = encodeOpticalBits(step * opticalStepMs);
    const after = encodeOpticalBits((step + 1) * opticalStepMs);
    expect(before.filter((bit, index) => bit !== after[index])).toHaveLength(1);
  });

  it("rejects unreadable or unframed cells", () => {
    expect(decodeOpticalDelayMs([1, 2, 3], 0)).toBeNull();
    expect(decodeOpticalDelayMs(read(encodeOpticalBits(1_000_000)), 1_000_000 + 60_000)).toBeNull();
    expect(adaptiveThreshold([120, 125, 130])).toBeNull();
    expect(adaptiveThreshold([20, 200, 120])).toBe(110);
  });

  it("lays the grid inside the guide box, row by row", () => {
    const centres = opticalCellCentres();
    expect(centres).toHaveLength(24);
    expect(centres[0]).toEqual({ x: 0.25, y: 0.3125 });
    expect(centres[5]!.x).toBeCloseTo(0.75);
    expect(centres[23]!.y).toBeCloseTo(0.6875);
  });
});

describe("face anchors", () => {
  const mesh = (): Landmark[] => {
    const points: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    for (const index of rightEyeContour) points[index] = { x: 0.4, y: 0.4 };
    for (const index of leftEyeContour) points[index] = { x: 0.6, y: 0.4 };
    points[234] = { x: 0.3, y: 0.5 };
    points[454] = { x: 0.7, y: 0.5 };
    return points;
  };

  it("anchors both eyes in picture pixels and scales with the face", () => {
    const anchors = faceAnchors(mesh(), 1920, 1080)!;
    expect(anchors.rightEye.x).toBeCloseTo(768);
    expect(anchors.leftEye.x).toBeCloseTo(1152);
    expect(anchors.leftEye.y).toBeCloseTo(432);
    expect(anchors.faceWidth).toBeCloseTo(768);
    expect(eyeRadius(anchors.faceWidth)).toBeCloseTo(153.6);
    // The same face at 4K anchors at twice the pixels, so effects stay proportional.
    expect(faceAnchors(mesh(), 3840, 2160)!.faceWidth).toBeCloseTo(1536);
    expect(faceAnchors(mesh().slice(0, 300), 1920, 1080)).toBeNull();
  });

  it("magnifies around the eye without folding the mesh", () => {
    const eye = { x: 500, y: 300 };
    expect(bigEyesVertex({ x: 700, y: 300 }, [eye], 100, 1)).toEqual({ x: 700, y: 300 });
    expect(bigEyesVertex(eye, [eye], 100, 1)).toEqual(eye);
    let previous = -Infinity;
    for (let distance = 0; distance <= 100; distance += 1) {
      const moved = bigEyesVertex({ x: eye.x + distance, y: eye.y }, [eye], 100, 5).x;
      expect(moved).toBeGreaterThan(previous);
      previous = moved;
    }
    expect(bigEyesVertex({ x: 550, y: 300 }, [eye], 100, 0.5).x).toBeGreaterThan(550);
  });

  it("smooths jitter but follows real movement", () => {
    const smoother = new AnchorSmoother();
    const at = (x: number) => ({ leftEye: { x, y: 0 }, rightEye: { x, y: 0 }, faceWidth: 300 });
    let last = 0;
    for (let frame = 0; frame < 30; frame += 1) last = smoother.smooth(at(100 + (frame % 2 === 0 ? 3 : -3)), frame / 30).leftEye.x;
    expect(Math.abs(last - 100)).toBeLessThan(2);
    for (let frame = 30; frame < 60; frame += 1) last = smoother.smooth(at(400), frame / 30).leftEye.x;
    expect(last).toBeGreaterThan(390);
  });
});

describe("camera formats", () => {
  it("offers the presets that fit the camera's advertised ranges", () => {
    const fullHd = { width: { min: 160, max: 1920 }, height: { min: 120, max: 1080 }, frameRate: { min: 5, max: 30 } };
    expect(advertisedPresets(fullHd).map(preset => preset.id)).toEqual(["1080p30", "720p30"]);
    const fourK = { width: { min: 1, max: 3840 }, height: { min: 1, max: 2160 }, frameRate: { min: 1, max: 29.97 } };
    expect(advertisedPresets(fourK).map(preset => preset.id)).toEqual(["1080p30", "1440p30", "2160p30", "720p30"]);
    expect(advertisedPresets({ ...fourK, frameRate: { min: 60, max: 60 } })).toEqual([]);
    expect(advertisedPresets({})).toEqual([]);
  });

  it("opens a preset exactly, without Chromium scaling it", () => {
    expect(exactConstraints("camera-1", { width: 2560, height: 1440, frameRate: 30 })).toEqual({
      deviceId: { exact: "camera-1" }, width: { exact: 2560 }, height: { exact: 1440 }, frameRate: { ideal: 30, max: 30 }, resizeMode: { exact: "none" }
    });
  });
});
