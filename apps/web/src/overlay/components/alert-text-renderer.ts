import { evaluateTextWarp, type AlertTextStyle, type AlertTextBoxStyle } from "@stream-jams/core";
import type { Container, Renderer, Texture } from "pixi.js";

let shared: Promise<{ pixi: typeof import("pixi.js"); renderer: Renderer }> | undefined;
let queue = Promise.resolve();
let idle: ReturnType<typeof setTimeout> | undefined;
export interface AlertTextRasterBounds { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly sampling: number; }
const rasterBounds = new WeakMap<HTMLCanvasElement, AlertTextRasterBounds>();
export function getAlertTextRasterBounds(canvas: HTMLCanvasElement): AlertTextRasterBounds | undefined { return rasterBounds.get(canvas); }

/** One GPU context, serial short renders, per-layer CPU canvases; no ticker. */
export function renderWarpedText(target: HTMLCanvasElement, raster: HTMLCanvasElement | (() => HTMLCanvasElement), style: AlertTextStyle, width: number, height: number, isActive: () => boolean = () => true): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const render = async () => {
    if (!isActive()) return null;
    clearTimeout(idle);
    shared ??= import("pixi.js").then(async pixi => {
      // Pixi's documented CSP adapter uses static shader/uniform functions instead of eval.
      await import("pixi.js/unsafe-eval");
      return { pixi, renderer: await pixi.autoDetectRenderer({ width: 1, height: 1, backgroundAlpha: 0, preference: "webgl", antialias: true }) };
    });
    const pending = shared;
    let resources: Awaited<NonNullable<typeof shared>>;
    try { resources = await pending; } catch (error) { if (shared === pending) shared = undefined; throw error; }
    const { pixi, renderer } = resources;
    if (!isActive()) {
      idle = setTimeout(() => { renderer.destroy(); if (shared === pending) shared = undefined; }, 1000);
      return null;
    }
    let texture: Texture | undefined;
    let stage: Container | undefined;
    try {
      // Defer CPU allocation until this queued request is current; stale drags retain no raster.
      const source = typeof raster === "function" ? raster() : raster;
      const bounds = rasterBounds.get(source) ?? { left: 0, top: 0, width, height, sampling: source.width / width };
      let minX = 0; let minY = 0; let maxX = width * bounds.sampling; let maxY = height * bounds.sampling;
      texture = pixi.Texture.from(source);
      const mesh = new pixi.MeshPlane({ texture, verticesX: 32, verticesY: 32 });
      stage = new pixi.Container();
      stage.addChild(mesh);
      const vertices = mesh.geometry.getBuffer("aPosition");
      const data = vertices.data;
      for (let row = 0; row < 32; row++) for (let column = 0; column < 32; column++) {
        const u = (bounds.left + column / 31 * bounds.width) / width;
        const v = (bounds.top + row / 31 * bounds.height) / height;
        const point = evaluateTextWarp(style.warp!, u, v);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 16 || Math.abs(point.y) > 16) throw new Error("Warp geometry exceeds supported bounds.");
        const offset = (row * 32 + column) * 2;
        minX = Math.min(minX, point.x * width * bounds.sampling); maxX = Math.max(maxX, point.x * width * bounds.sampling);
        minY = Math.min(minY, point.y * height * bounds.sampling); maxY = Math.max(maxY, point.y * height * bounds.sampling);
        data[offset] = point.x * width * bounds.sampling;
        data[offset + 1] = point.y * height * bounds.sampling;
      }
      minX = Math.floor(minX); minY = Math.floor(minY);
      const reduction = Math.min(1, 4096 / (maxX - minX), 4096 / (maxY - minY));
      const outputWidth = Math.min(4096, Math.ceil((maxX - minX) * reduction)); const outputHeight = Math.min(4096, Math.ceil((maxY - minY) * reduction));
      for (let index = 0; index < data.length; index += 2) { data[index] = (data[index]! - minX) * reduction; data[index + 1] = (data[index + 1]! - minY) * reduction; }
      vertices.update();
      renderer.resize(outputWidth, outputHeight);
      renderer.render({ container: stage });
      target.width = outputWidth; target.height = outputHeight;
      target.style.width = `${width}px`; target.style.height = `${height}px`;
      const context = target.getContext("2d");
      if (context === null) throw new Error("Text canvas is unavailable.");
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0);
      return { left: minX / bounds.sampling, top: minY / bounds.sampling, width: outputWidth / bounds.sampling / reduction, height: outputHeight / bounds.sampling / reduction };
    } finally {
      stage?.destroy({ children: true }); texture?.destroy(true);
      const current = shared;
      idle = setTimeout(() => { renderer.destroy(); if (shared === current) shared = undefined; }, 1000);
    }
  };
  const result = queue.then(render);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

export function rasterizeAlertText(text: string, style: AlertTextStyle, box: AlertTextBoxStyle, family: string, width: number, height: number, scale: number): HTMLCanvasElement {
  if (![width, height, scale].every(value => Number.isFinite(value) && value > 0)) throw new Error("Text dimensions are invalid.");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Text canvas is unavailable.");
  const size = style.fontSizePx * scale;
  const padding = box.paddingPx * scale;
  const configure = () => {
    context.font = `${style.italic === true ? "italic " : ""}${style.fontWeight} ${size}px ${family}`;
    context.letterSpacing = `${(style.letterSpacingPx ?? 0) * scale}px`;
    context.direction = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text) ? "rtl" : "ltr";
    context.textBaseline = "alphabetic";
    context.textAlign = style.horizontalAlign;
    context.fillStyle = style.color;
  };
  configure();
  const available = Math.max(1, width - 2 * padding);
  // CSS normal white-space collapses whitespace. Shape complete candidate lines, never individual glyphs.
  const words = text.trim().split(/\s+/u);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (context.measureText(candidate).width <= available) { line = candidate; continue; }
    if (line !== "") lines.push(line);
    line = "";
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word);
    for (const { segment } of segments) {
      if (line !== "" && context.measureText(line + segment).width > available) { lines.push(line); line = ""; }
      line += segment;
    }
  }
  lines.push(line);
  const lineHeight = size * style.lineHeight;
  const blockHeight = lines.length * lineHeight;
  const top = style.verticalAlign === "top" ? padding : style.verticalAlign === "bottom" ? height - padding - blockHeight : (height - blockHeight) / 2;
  const x = style.horizontalAlign === "left" ? padding : style.horizontalAlign === "right" ? width - padding : width / 2;
  const metrics = context.measureText("Mg");
  const ascent = metrics.fontBoundingBoxAscent || size * .8;
  const descent = metrics.fontBoundingBoxDescent || size * .2;
  const baseline = (index: number) => top + index * lineHeight + (lineHeight - ascent - descent) / 2 + ascent;
  let left = 0; let right = width; let upper = 0; let bottom = height;
  const outline = (style.outline?.widthPx ?? 0) * scale / 2;
  const blur = (style.shadow?.blur ?? 0) * scale * 3;
  const offsetX = (style.shadow?.offsetX ?? 0) * scale;
  const offsetY = (style.shadow?.offsetY ?? 0) * scale;
  lines.forEach((value, index) => {
    const ink = context.measureText(value);
    const lineStart = style.horizontalAlign === "left" ? x : style.horizontalAlign === "right" ? x - ink.width : x - ink.width / 2;
    const inkLeft = Number.isFinite(ink.actualBoundingBoxLeft) ? x - ink.actualBoundingBoxLeft : lineStart - size * .2;
    const inkRight = Number.isFinite(ink.actualBoundingBoxRight) ? x + ink.actualBoundingBoxRight : lineStart + ink.width + size * .2;
    const inkTop = baseline(index) - (ink.actualBoundingBoxAscent || ascent);
    const inkBottom = Math.max(baseline(index) + (ink.actualBoundingBoxDescent || descent), style.underline === true ? baseline(index) + size * .1 + Math.max(1, size / 16) : 0);
    left = Math.min(left, inkLeft - outline - blur + Math.min(0, offsetX));
    right = Math.max(right, inkRight + outline + blur + Math.max(0, offsetX));
    upper = Math.min(upper, inkTop - outline - blur + Math.min(0, offsetY));
    bottom = Math.max(bottom, inkBottom + outline + blur + Math.max(0, offsetY));
  });
  left = Math.floor(left); upper = Math.floor(upper);
  const rasterWidth = Math.ceil(right - left); const rasterHeight = Math.ceil(bottom - upper);
  const sampling = Math.min(2, 4096 / rasterWidth, 4096 / rasterHeight);
  canvas.width = Math.max(1, Math.ceil(rasterWidth * sampling)); canvas.height = Math.max(1, Math.ceil(rasterHeight * sampling));
  rasterBounds.set(canvas, { left, top: upper, width: rasterWidth, height: rasterHeight, sampling });
  context.scale(sampling, sampling); context.translate(-left, -upper); configure();
  if (style.shadow !== null) { context.shadowColor = style.shadow.color; context.shadowBlur = style.shadow.blur * scale * sampling; context.shadowOffsetX = style.shadow.offsetX * scale * sampling; context.shadowOffsetY = style.shadow.offsetY * scale * sampling; }
  lines.forEach((value, index) => {
    const y = baseline(index);
    if (style.outline != null && style.outline.widthPx > 0) { context.lineWidth = style.outline.widthPx * scale; context.strokeStyle = style.outline.color; context.lineJoin = "round"; context.strokeText(value, x, y); }
    context.fillText(value, x, y);
    if (style.underline === true) {
      const length = context.measureText(value).width;
      const start = style.horizontalAlign === "left" ? x : style.horizontalAlign === "right" ? x - length : x - length / 2;
      context.fillRect(start, y + size * .1, length, Math.max(1, size / 16));
    }
  });
  return canvas;
}
