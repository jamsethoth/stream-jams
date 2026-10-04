import { createDefaultMusicModuleConfig, musicAppearanceSchema } from "@stream-jams/core";
import { expect, it } from "vitest";
import { resizeMusicAppearance } from "./music-widget-size.js";

it("keeps extreme shrink valid without changing typography or automatic layout", () => {
  const appearance = createDefaultMusicModuleConfig().profiles.landscape.views.full;
  appearance.contentInsets = { left: 150, right: 150, top: 60, bottom: 60 };
  const resized = resizeMusicAppearance(appearance, 1, 1);
  expect(resized).toMatchObject({ widthPx: 160, heightPx: 48, componentLayout: null });
  expect(musicAppearanceSchema.safeParse(resized).success).toBe(true);
  expect(resized.titleFont).toEqual(appearance.titleFont);
  expect(appearance.contentInsets.right).toBe(150);
});

it("caps graphical size at the selected output bounds", () => {
  const appearance = createDefaultMusicModuleConfig().profiles.vertical.views.full;
  expect(resizeMusicAppearance(appearance, 9999, 9999, 1080, 1080)).toMatchObject({ widthPx: 1080, heightPx: 1080 });
});
