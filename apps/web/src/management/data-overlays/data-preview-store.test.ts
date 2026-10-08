import { describe, expect, it } from "vitest";
import type { DataProjectionOptions } from "@stream-jams/core";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { createDataPreviewStore } from "./data-preview-store.js";

const options: DataProjectionOptions = { runtimeId: "preview", output: "browser", targetProfileId: "landscape", nowEpochMs: 1000,
  moduleEnabled: true, outputPaused: false, resolveAssetId: () => true };
describe("isolated data preview", () => {
  it.each([["zero", 0], ["decrease", 39], ["completion", 100], ["over-target", 101]] as const)("simulates %s without touching live state", (scenario, expected) => {
    const live = dataPreviewFixture();
    const store = createDataPreviewStore(live);
    store.simulate(scenario, "counter", "goal");
    expect(store.snapshot().values[0]!.content).toBe(expected);
    expect(live.values[0]!.content).toBe(40);
    const bar = store.project(options).canvases[0]!.elements.find(element => element.kind === "progress");
    expect(bar?.kind === "progress" && bar.fill).toBe(Math.min(1, expected / 100));
  });
  it("owns independent input and output copies and resets all simulation state", () => {
    const live = dataPreviewFixture();
    const store = createDataPreviewStore(live);
    const snapshot = store.snapshot();
    snapshot.values[0]!.content = 99;
    live.values[0]!.content = 70;
    expect(store.snapshot().values[0]!.content).toBe(40);
    store.simulate("missing-source", "counter");
    expect(store.project(options).canvases[0]!.elements.some(item => item.id === "bar")).toBe(false);
    store.reset();
    expect(store.snapshot().values[0]!.content).toBe(40);
    expect(store.project(options).canvases[0]!.elements.some(item => item.id === "bar")).toBe(true);
  });
  it("produces long literal text and rejects incompatible samples without mutation", () => {
    const store = createDataPreviewStore(dataPreviewFixture());
    store.simulate("long-text", "label");
    expect(store.snapshot().values[1]!.content).toContain("<b>with literal markup</b>");
    const before = store.snapshot();
    expect(() => store.simulate("completion", "label", "goal")).toThrow("integer");
    expect(() => store.simulate("completion", "counter", "missing")).toThrow("goal");
    expect(() => store.simulate("zero", "missing")).toThrow("available");
    expect(store.snapshot()).toEqual(before);
  });
  it("shares output and stale policy projection with production", () => {
    const store = createDataPreviewStore(dataPreviewFixture());
    expect(store.project(options).canvases).toEqual(store.project({ ...options, output: "desktop" }).canvases);
    expect(store.project({ ...options, outputPaused: true }).canvases).toEqual([]);
    expect(store.project({ ...options, nowEpochMs: 600001, sourceStatuses: { counter: { state: "stale", staleSinceEpochMs: 0 } } })
      .canvases[0]!.elements.map(item => item.id)).toEqual(["image", "label-text"]);
  });
});
