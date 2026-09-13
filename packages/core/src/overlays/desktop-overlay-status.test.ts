import { expect, it } from "vitest";
import { desktopOverlayStatusSchema, selectedDesktopDisplaySchema, surfaceSettingsViewSchema } from "./desktop-overlay-status.js";
import { desktopVisualCommandSchema, desktopVisualReplySchema } from "./desktop-visual-transport.js";
const display = { id: "one", label: "Left display", bounds: { x: -1920, y: -100, width: 1920, height: 1080 }, scaleFactor: 1.25 };
const status = { available: true, displays: [display], state: "disabled", message: null };
it("accepts negative desktop coordinates and validated saved surfaces", () => {
  expect(selectedDesktopDisplaySchema.parse(display)).toEqual(display);
  expect(surfaceSettingsViewSchema.parse({ surfaces: [{ id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1, layers: [] }], desktop: status })).toMatchObject({ desktop: status });
});
it("accepts status RPC without authorizing audio commands or unknown fields", () => {
  expect(desktopVisualCommandSchema.safeParse({ type: "status" }).success).toBe(true);
  expect(desktopVisualReplySchema.safeParse({ type: "status", status }).success).toBe(true);
  expect(desktopVisualCommandSchema.safeParse({ type: "status", audio: {} }).success).toBe(false);
  expect(desktopVisualReplySchema.safeParse({ type: "status", status, token: "private" }).success).toBe(false);
});
it.each([
  { ...display, scaleFactor: 0 }, { ...display, scaleFactor: Infinity }, { ...display, bounds: { ...display.bounds, width: -1 } },
  { ...display, bounds: { ...display.bounds, height: 0 } }, { ...display, bounds: { ...display.bounds, x: NaN } },
  { ...display, bounds: { ...display.bounds, url: "private" } }, { ...display, id: " " }, { ...display, url: "private" }
])("rejects malformed display metadata %j", candidate => { expect(selectedDesktopDisplaySchema.safeParse(candidate).success).toBe(false); });
it("rejects unknown authority and malformed status/surface configuration", () => {
  for (const candidate of [{ ...status, token: "private" }, { ...status, available: "yes" }, { ...status, state: "playing" }, { ...status, displays: [{ ...display, scaleFactor: -1 }] }]) {
    expect(desktopOverlayStatusSchema.safeParse(candidate).success).toBe(false);
  }
  expect(surfaceSettingsViewSchema.safeParse({ surfaces: [{ kind: "desktop" }], desktop: status }).success).toBe(false);
  expect(surfaceSettingsViewSchema.safeParse({ surfaces: [], desktop: status, managementToken: "private" }).success).toBe(false);
});
