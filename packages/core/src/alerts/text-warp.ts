import { z } from "zod";

const axisSchema = z.array(z.number().finite().min(0).max(1)).min(3).max(7)
  .refine((axis) => axis[0] === 0 && axis.at(-1) === 1 && axis.every((value, index) =>
    index === 0 || value - axis[index - 1]! >= 0.06 - Number.EPSILON), "Axes need endpoints 0/1 and gaps of at least 0.06");

export const alertTextWarpSchema = z.object({
  columns: axisSchema,
  rows: axisSchema,
  points: z.array(z.object({
    x: z.number().finite().min(-0.5).max(1.5),
    y: z.number().finite().min(-1).max(2)
  }).strict()).min(9).max(49)
}).strict().refine((warp) => warp.points.length === warp.columns.length * warp.rows.length,
  "Point count must match rows and columns");

export type AlertTextWarp = z.infer<typeof alertTextWarpSchema>;

export function createDefaultTextWarp(): AlertTextWarp {
  const columns = [0, 0.5, 1];
  const rows = [0, 0.5, 1];
  return { columns, rows, points: rows.flatMap((y) => columns.map((x) => ({ x, y }))) };
}

function weights(axis: number[], position: number): number[] {
  return axis.map((value, index) => axis.reduce((weight, other, otherIndex) =>
    otherIndex === index ? weight : weight * (position - other) / (value - other), 1));
}

/** Bounded grid dimensions keep the approved tensor-product Lagrange surface small. */
export function evaluateTextWarp(warp: AlertTextWarp, u: number, v: number): { x: number; y: number } {
  const horizontal = weights(warp.columns, u);
  const vertical = weights(warp.rows, v);
  let x = 0;
  let y = 0;
  warp.points.forEach((point, index) => {
    const weight = horizontal[index % warp.columns.length]! * vertical[Math.floor(index / warp.columns.length)]!;
    x += point.x * weight;
    y += point.y * weight;
  });
  return { x, y };
}

export function insertTextWarpSplit(warp: AlertTextWarp, axis: "horizontal" | "vertical", position: number): AlertTextWarp {
  // Horizontal splits add rows; vertical splits add columns.
  const source = axis === "horizontal" ? warp.rows : warp.columns;
  if (!Number.isFinite(position) || source.length >= 7 || position <= 0 || position >= 1 ||
    source.some((value) => Math.abs(value - position) < 0.06 - Number.EPSILON)) return warp;
  const expanded = [...source, position].sort((a, b) => a - b);
  const columns = axis === "vertical" ? expanded : [...warp.columns];
  const rows = axis === "horizontal" ? expanded : [...warp.rows];
  const points = rows.flatMap((v) => columns.map((u) => evaluateTextWarp(warp, u, v)));
  const result = alertTextWarpSchema.safeParse({ columns, rows, points });
  // Polynomial overshoot can put newly sampled handles outside the storage bounds.
  return result.success ? result.data : warp;
}

export function removeTextWarpSplit(warp: AlertTextWarp, axis: "horizontal" | "vertical", index: number): AlertTextWarp {
  const source = axis === "horizontal" ? warp.rows : warp.columns;
  if (!Number.isInteger(index) || source.length <= 3 || index <= 0 || index >= source.length - 1) return warp;
  const columns = axis === "vertical" ? warp.columns.filter((_, i) => i !== index) : [...warp.columns];
  const rows = axis === "horizontal" ? warp.rows.filter((_, i) => i !== index) : [...warp.rows];
  const points = warp.points.filter((_, i) => axis === "horizontal"
    ? Math.floor(i / warp.columns.length) !== index : i % warp.columns.length !== index).map((point) => ({ ...point }));
  return { columns, rows, points };
}
