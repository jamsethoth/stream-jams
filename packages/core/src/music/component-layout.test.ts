import { describe, expect, it } from "vitest";
import { createMusicViewAppearance, musicAppearanceSchema } from "./schemas.js";
import { clampMusicComponentRect, fitMusicComponentLayout, moveMusicComponentRect, resizeMusicComponentRect } from "./component-layout.js";

describe("Music component layout", () => {
  const bounds = { width: 640, height: 178 };
  const boxes = {
    artwork: { x: 16, y: 16, width: 144, height: 144 },
    title: { x: 182, y: 24, width: 442, height: 36 },
    details: { x: 182, y: 66, width: 442, height: 44 },
    progress: { x: 182, y: 120, width: 442, height: 5 },
    time: { x: 182, y: 132, width: 442, height: 16 }
  } as const;

  it("preserves automatic legacy views and rejects out-of-bounds saved rectangles", () => {
    const legacy = createMusicViewAppearance("dark", "full");
    expect(legacy.componentLayout).toBeNull();
    const withoutNewField = { ...legacy } as Record<string, unknown>;
    delete withoutNewField.componentLayout;
    expect(musicAppearanceSchema.parse(withoutNewField).componentLayout).toBeNull();
    expect(musicAppearanceSchema.safeParse({ ...legacy, componentLayout: boxes }).success).toBe(true);
    expect(musicAppearanceSchema.safeParse({ ...legacy, componentLayout: { ...boxes, title: { ...boxes.title, x: 300 } } }).success).toBe(false);
    expect(musicAppearanceSchema.safeParse({ ...legacy, componentLayout: { ...boxes, title: { ...boxes.title, width: 0 } } }).success).toBe(false);
  });

  it("clamps movement, resize and reduced widget bounds without mutating the saved source", () => {
    expect(moveMusicComponentRect(boxes.title, 999, -999, bounds)).toEqual({ ...boxes.title, x: 198, y: 0 });
    expect(resizeMusicComponentRect(boxes.title, 999, -999, bounds)).toEqual({ ...boxes.title, width: 458, height: 1 });
    expect(clampMusicComponentRect({ x: -5, y: 170, width: 900, height: 99 }, bounds)).toEqual({ x: 0, y: 79, width: 640, height: 99 });
    const appearance = { ...createMusicViewAppearance("dark", "full"), componentLayout: boxes };
    const fitted = fitMusicComponentLayout({ ...appearance, widthPx: 300, heightPx: 118 });
    expect(fitted.componentLayout?.title).toEqual({ x: 0, y: 24, width: 300, height: 36 });
    expect(appearance.componentLayout.title).toEqual(boxes.title);
    expect(musicAppearanceSchema.safeParse(fitted).success).toBe(true);
  });
});
