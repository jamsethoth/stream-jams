import { describe, expect, it } from "vitest";
import { dataCanvasSchema, dataOverlayStateSchema, dataValueSchema, dataValueUpdateInputSchema, dataCanvasElementSchema, dataGoalInputSchema, dataOverlayProjectionSchema, dataSourceStatusSchema } from "./schemas.js";
import { dataOverlayLimits } from "./limits.js";
import { projectDataGoal, restartDataGoal } from "./goals.js";
import { formatDataContent } from "./formatting.js";
import { projectDataOverlays } from "./projection.js";
import type { DataCanvasElement, DataProjectionOptions } from "./types.js";
import { dataOverlaysModuleDefinition } from "./module-definition.js";

const stamp = "2026-10-08T12:00:00.000Z";
const value = { id: "count", name: "Count", kind: "integer" as const, content: 970, resetDefault: 0, revision: 3, createdAt: stamp, updatedAt: stamp, resetGroupId: null };
const goal = { id: "goal", name: "Goal", valueId: "count", mode: "saved-baseline" as const, baseline: 950, additionalAmount: 50 };
const text = { id: "text", kind: "text" as const, literalText: "", order: 0, x: 0, y: 0, width: 100, height: 40, visible: true, stalePolicy: "retain-last" as const, binding: { kind: "value" as const, valueId: "count" }, format: { thousandsSeparator: true, prefix: "", suffix: "", overflow: "ellipsis" as const }, style: { fontSizePx: 24, color: "#FFFFFFFF", fontWeight: 400, align: "left" as const } };
const canvas = { id: "canvas", name: "Canvas", enabled: true, order: 0, targetProfileId: "landscape" as const, outputs: { browser: true, desktop: true }, elements: [text] };
const state = { revision: 7, values: [value], goals: [goal], resetGroups: [], pinnedValueIds: ["count"], canvases: [canvas] };
const project = (options: Partial<DataProjectionOptions> = {}) => projectDataOverlays(state, { runtimeId: "runtime", output: "browser", targetProfileId: "landscape", nowEpochMs: 600000, moduleEnabled: true, outputPaused: false, resolveAssetId: () => false, ...options });

describe("data contracts", () => {
  it("rejects coercion, unsafe integers, unknown fields and mismatched reset defaults", () => {
    expect(dataValueSchema.safeParse(value).success).toBe(true);
    for (const content of ["1", 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(dataValueSchema.safeParse({ ...value, content }).success).toBe(false);
    expect(dataValueSchema.safeParse({ ...value, resetDefault: "0" }).success).toBe(false);
    expect(dataValueSchema.safeParse({ ...value, token: "secret" }).success).toBe(false);
    expect(dataValueUpdateInputSchema.safeParse({ kind: "text", name: "Changed" }).success).toBe(false);
  });
  it("bounds plain text by UTF-8 bytes", () => {
    const label = { ...value, kind: "text", content: "é".repeat(1024), resetDefault: "<b>hi</b>" };
    expect(dataValueSchema.safeParse(label).success).toBe(true);
    expect(dataValueSchema.safeParse({ ...label, content: "é".repeat(1025) }).success).toBe(false);
    expect(dataValueSchema.safeParse({ ...label, content: "😀".repeat(513) }).success).toBe(false);
  });
  it("enforces shared catalog limits, unique IDs and valid references", () => {
    expect(dataOverlayLimits).toMatchObject({ values: 1000, goals: 250, canvases: 50, elementsPerCanvas: 100, textBytes: 2048 });
    expect(dataOverlayStateSchema.safeParse(state).success).toBe(true);
    expect(dataOverlayStateSchema.safeParse({ ...state, values: Array.from({ length: 1001 }, (_, i) => ({ ...value, id: `v${i}` })) }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, values: [value, value] }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, goals: [{ ...goal, valueId: "gone" }] }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, pinnedValueIds: ["gone"] }).success).toBe(false);
  });
  it("rejects incompatible progress bindings and geometry outside the target profile", () => {
    expect(dataCanvasElementSchema.safeParse({ ...text, kind: "progress" }).success).toBe(false);
    expect(dataCanvasSchema.safeParse({ ...canvas, elements: [{ ...text, width: 0 }] }).success).toBe(false);
    expect(dataCanvasSchema.safeParse({ ...canvas, elements: [{ ...text, x: 1900 }] }).success).toBe(false);
    expect(dataCanvasSchema.safeParse({ ...canvas, elements: Array.from({ length: 101 }, (_, i) => ({ ...text, id: `e${i}` })) }).success).toBe(false);
  });
  it("keeps the module disabled and unregistered", () => expect(dataOverlaysModuleDefinition.defaultEnabled).toBe(false));
});

describe("goal arithmetic", () => {
  it("projects saved baseline and preserves decreases and over-target raw values", () => {
    expect(projectDataGoal(goal, value)).toEqual({ current: 970, baseline: 950, target: 1000, achieved: 20, remaining: 30, percentage: 40, completed: false, fill: 0.4 });
    expect(projectDataGoal(goal, { ...value, content: 900 })).toMatchObject({ current: 900, achieved: -50, remaining: 50, fill: 0, percentage: -100 });
    expect(projectDataGoal(goal, { ...value, content: 1003 })).toMatchObject({ current: 1003, remaining: 0, completed: true, fill: 1 });
    expect(projectDataGoal({ id: "fixed", name: "Fixed", valueId: "count", mode: "fixed-target", target: 1000 }, value)).toMatchObject({ baseline: 0, achieved: 970, fill: 0.97 });
  });
  it("restarts without changing the value, rejects target overflow and preserves extreme derived progress", () => {
    const current = { ...value, content: 1003 };
    expect(restartDataGoal(goal, current)).toEqual({ ...goal, baseline: 1003 });
    expect(current.content).toBe(1003);
    expect(() => restartDataGoal(goal, { ...value, content: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(projectDataGoal({ ...goal, baseline: -Number.MAX_SAFE_INTEGER }, { ...value, content: Number.MAX_SAFE_INTEGER })).toMatchObject({ current: Number.MAX_SAFE_INTEGER, achieved: Number.MAX_SAFE_INTEGER * 2, fill: 1, remaining: 0 });
    expect(() => projectDataGoal({ ...goal, baseline: Number.MAX_SAFE_INTEGER }, value)).toThrow();
    expect(() => projectDataGoal(goal, { ...value, id: "other" })).toThrow();
  });
});

describe("deterministic output projection", () => {
  it("formats numbers and literal text identically without markup interpretation", () => {
    expect(formatDataContent(1234567, { ...text.format, prefix: "$", suffix: "!" })).toBe("$1,234,567!");
    expect(formatDataContent(-1234, text.format)).toBe("-1,234");
    expect(formatDataContent("<b>hi</b>", text.format)).toBe("<b>hi</b>");
  });
  it("preserves decimal, scientific notation and literal grouping semantics", () => {
    for (const [content, expected] of [[1234567.89, "1,234,567.89"], [-1234567.89, "-1,234,567.89"], [1e21, "1e+21"], [1e-7, "1e-7"], [Number.MAX_SAFE_INTEGER, "9,007,199,254,740,991"], [0, "0"], [true, "true"], ["1234567", "1234567"]] as const) expect(formatDataContent(content, text.format)).toBe(expected);
    expect(formatDataContent(12345, { ...text.format, thousandsSeparator: false })).toBe("12345");
  });
  it("includes only rendered content, runtime and revision, never catalog definitions", () => {
    const result = project();
    expect(result).toMatchObject({ runtimeId: "runtime", revision: 7, canvases: [{ id: "canvas", elements: [{ id: "text", text: "970" }] }] });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("resetDefault");
    expect(serialized).not.toContain("pinnedValueIds");
    expect(project({ output: "desktop" }).canvases).toHaveLength(1);
    expect(project({ targetProfileId: "vertical" }).canvases).toEqual([]);
    expect(project({ moduleEnabled: false }).canvases).toEqual([]);
    expect(project({ outputPaused: true }).canvases).toEqual([]);
  });
  it("retains stale data through exactly ten minutes, hides expired/ended/invalid data, and ignores source status for manual values", () => {
    expect(project({ sourceStatuses: { count: { state: "stale", staleSinceEpochMs: 0 } } }).canvases[0]?.elements).toHaveLength(1);
    expect(project({ nowEpochMs: 600001, sourceStatuses: { count: { state: "stale", staleSinceEpochMs: 0 } } }).canvases[0]?.elements).toHaveLength(0);
    for (const sourceState of ["ended", "invalid"] as const) expect(project({ sourceStatuses: { count: { state: sourceState } } }).canvases[0]?.elements).toHaveLength(0);
    expect(project().canvases[0]?.elements).toHaveLength(1);
  });
  it("fails closed for missing assets, incompatible and missing bindings", () => {
    for (const binding of [{ kind: "value", valueId: "gone" }, { kind: "goal", goalId: "gone", field: "remaining" }]) {
      const result = projectDataOverlays({ ...state, canvases: [{ ...canvas, elements: [{ ...text, binding } as DataCanvasElement] }] }, { runtimeId: "r", output: "browser", targetProfileId: "landscape", nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: () => false });
      expect(result.canvases[0]?.elements).toEqual([]);
    }
  });
});


const projectionOptions: DataProjectionOptions = { runtimeId: "r", output: "browser", targetProfileId: "landscape", nowEpochMs: 0, moduleEnabled: true, outputPaused: false, resolveAssetId: () => false };
const geometry = { id: "shape", order: 0, x: 0, y: 0, width: 100, height: 40, visible: true, stalePolicy: "retain-last" as const };
const bar: DataCanvasElement = { ...geometry, kind: "progress", goalId: "goal", orientation: "vertical", direction: "reverse", fillColor: "#FFFFFFFF", backgroundColor: "#000000FF", borderColor: "#000000FF", borderWidthPx: 2 };
const image: DataCanvasElement = { ...geometry, kind: "image", assetId: "asset", fit: "contain" };
const renderElements = (elements: DataCanvasElement[], overrides: Partial<DataProjectionOptions> = {}) => projectDataOverlays({ ...state, canvases: [{ ...canvas, elements }] }, { ...projectionOptions, ...overrides });

describe("projection edge cases", () => {
  it("uses the same goal calculation for text fields and bars", () => {
    const result = renderElements([{ ...text, binding: { kind: "goal", goalId: "goal", field: "remaining" } }, bar]);
    expect(result.canvases[0]?.elements).toMatchObject([{ kind: "progress", fill: 0.4, orientation: "vertical", direction: "reverse" }, { kind: "text", text: "30" }]);
    const invalid = projectDataOverlays({ ...state, values: [{ ...value, kind: "text", content: "970", resetDefault: "0" }] }, projectionOptions);
    expect(invalid.canvases[0]?.elements).toHaveLength(1); // text value remains compatible with text
    const invalidGoal = projectDataOverlays({ ...state, values: [{ ...value, kind: "text", content: "970", resetDefault: "0" }], canvases: [{ ...canvas, elements: [bar] }] }, projectionOptions);
    expect(invalidGoal.canvases[0]?.elements).toEqual([]);
  });
  it("resolves only registered asset IDs and emits no paths or callback metadata", () => {
    expect(renderElements([image]).canvases[0]?.elements).toEqual([]);
    const result = renderElements([image], { resolveAssetId: id => id === "asset" });
    expect(result.canvases[0]?.elements).toMatchObject([{ kind: "image", assetId: "asset" }]);
    expect(JSON.stringify(result)).not.toMatch(/path|http|token/i);
    expect(dataCanvasElementSchema.safeParse({ ...image, assetId: "C:/secret.png" }).success).toBe(false);
  });
  it("hides immediately when selected and rejects invalid stale timestamps", () => {
    const immediate: DataCanvasElement = { ...text, stalePolicy: "hide-immediately" };
    expect(renderElements([immediate], { sourceStatuses: { count: { state: "stale", staleSinceEpochMs: 0 } } }).canvases[0]?.elements).toEqual([]);
    for (const since of [-1, NaN, Infinity, 1]) expect(renderElements([text], { sourceStatuses: { count: { state: "stale", staleSinceEpochMs: since } } }).canvases[0]?.elements).toEqual([]);
  });
  it("filters hidden elements, canvases, and output assignments without mutating state", () => {
    const before = JSON.stringify(state);
    expect(renderElements([{ ...text, visible: false }]).canvases[0]?.elements).toEqual([]);
    for (const suppressed of [{ ...canvas, enabled: false }, { ...canvas, outputs: { browser: false, desktop: true } }]) expect(projectDataOverlays({ ...state, canvases: [suppressed] }, projectionOptions).canvases).toEqual([]);
    project();
    expect(JSON.stringify(state)).toBe(before);
  });
  it("fails closed when a canvas is outside its target geometry", () => {
    expect(renderElements([{ ...text, x: 1920 }]).canvases).toEqual([]);
  });
  it("renders literals, shapes and deterministic ordering without value references", () => {
    const rectangle: DataCanvasElement = { ...geometry, id: "b", kind: "rectangle", color: "#FF0000FF" };
    const ellipse: DataCanvasElement = { ...geometry, id: "a", kind: "ellipse", color: "#FF0000FF" };
    const result = renderElements([rectangle, { ...text, binding: null, literalText: "<script>literal</script>" }, ellipse]);
    expect(result.canvases[0]?.elements.map(element => element.id)).toEqual(["a", "b", "text"]);
    expect(result.canvases[0]?.elements[2]).toMatchObject({ text: "<script>literal</script>" });
  });
});


describe("transport and extreme contracts", () => {
  it("validates a strict projection and rejects provider secrets and paths", () => {
    const result = project();
    expect(dataOverlayProjectionSchema.safeParse(result).success).toBe(true);
    expect(dataOverlayProjectionSchema.safeParse({ ...result, token: "secret" }).success).toBe(false);
    expect(dataOverlayProjectionSchema.safeParse({ ...result, canvases: [{ ...result.canvases[0], values: [value] }] }).success).toBe(false);
    expect(dataSourceStatusSchema.safeParse({ state: "stale", staleSinceEpochMs: -1 }).success).toBe(false);
    expect(dataSourceStatusSchema.safeParse({ state: "ended", token: "secret" }).success).toBe(false);
  });
  it("rejects nonpositive goals and unsafe targets while allowing extreme valid decreases", () => {
    for (const additionalAmount of [0, -1, 0.5]) expect(dataGoalInputSchema.safeParse({ name: "Goal", valueId: "count", mode: "saved-baseline", baseline: 0, additionalAmount }).success).toBe(false);
    expect(dataGoalInputSchema.safeParse({ name: "Goal", valueId: "count", mode: "saved-baseline", baseline: Number.MAX_SAFE_INTEGER, additionalAmount: 1 }).success).toBe(false);
    const extreme = { ...state, values: [{ ...value, content: Number.MIN_SAFE_INTEGER }], goals: [{ ...goal, baseline: Number.MAX_SAFE_INTEGER - 50 }], canvases: [{ ...canvas, elements: [bar] }] };
    expect(projectDataOverlays(extreme, projectionOptions).canvases[0]?.elements).toMatchObject([{ fill: 0 }]);
    expect(projectDataGoal(extreme.goals[0]!, extreme.values[0]!)).toMatchObject({ current: Number.MIN_SAFE_INTEGER, remaining: 50, completed: false });
  });
  it("enforces goal and canvas limits independently and rejects noninteger goal references", () => {
    expect(dataOverlayStateSchema.safeParse({ ...state, goals: Array.from({ length: 251 }, (_, i) => ({ ...goal, id: `g${i}` })) }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, canvases: Array.from({ length: 51 }, (_, i) => ({ ...canvas, id: `c${i}` })) }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, values: [{ ...value, kind: "text", content: "x", resetDefault: "" }] }).success).toBe(false);
    expect(dataOverlayStateSchema.safeParse({ ...state, values: [{ ...value, resetGroupId: "gone" }] }).success).toBe(false);
  });
});
