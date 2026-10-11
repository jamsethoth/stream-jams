import { describe, expect, it } from "vitest";
import { boxShadowCss, boxShadowInsets } from "./box-shadow.js";
import { defaultTimerShadow, resolveTimerOutputGeometry } from "../timers/output-geometry.js";
import { timersOverlayModuleDefinition } from "../timers/module-definition.js";

describe("box shadow", () => {
  it("reserves blur on every side, shifted by the offset, and nothing when transparent", () => {
    expect(boxShadowInsets(defaultTimerShadow)).toEqual({ top: 40, right: 48, bottom: 56, left: 48 });
    expect(boxShadowInsets({ offsetX: 10, offsetY: 0, blur: 5, spread: 2, color: "#000000FF" })).toEqual({ top: 12, right: 22, bottom: 12, left: 2 });
    expect(boxShadowInsets({ offsetX: 60, offsetY: 0, blur: 5, spread: 0, color: "#000000FF" }).left).toBe(0);
    expect(boxShadowInsets({ ...defaultTimerShadow, color: "#00000000" })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(boxShadowCss(defaultTimerShadow)).toBe("0px 8px 24px 0px #0000006B");
  });

  it("starts a shadowless Timer stack at the browser source corner", () => {
    const profile = timersOverlayModuleDefinition.defaultConfig.profiles.landscape;
    const geometry = resolveTimerOutputGeometry({ ...profile, appearance: { ...profile.appearance, shadow: { ...defaultTimerShadow, color: "#00000000" } } });
    expect(geometry.slots[0]).toMatchObject({ x: 0, y: 0 });
    expect(geometry.width).toBe(Math.ceil(geometry.footprint.width));
  });
});
