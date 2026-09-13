import { expect, it } from "vitest";
import { overlayWindowPolicy, selectBoundDisplay } from "./overlay-window-policy.js";

const primary = { id: "1", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
const secondary = { id: "2", bounds: { x: -2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.5 };

it("never substitutes the primary display for a missing binding", () => {
  expect(selectBoundDisplay([primary], "2")).toBeNull();
  expect(overlayWindowPolicy).toMatchObject({ transparent: true, frame: false, focusable: false, skipTaskbar: true, show: false });
});

it("requires an explicit current ID even when another display has matching geometry", () => {
  expect(selectBoundDisplay([primary], null)).toBeNull();
  expect(selectBoundDisplay([], "1")).toBeNull();
  expect(selectBoundDisplay([{ ...primary, id: "changed" }], "1")).toBeNull();
});

it("returns the exact selected display with its current bounds and scale", () => {
  expect(selectBoundDisplay([primary, secondary], "2")).toBe(secondary);
});

it("freezes the native constructor policy", () => {
  expect(Object.isFrozen(overlayWindowPolicy)).toBe(true);
});
