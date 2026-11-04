import { expect, it, vi } from "vitest";
import { paintDevBadge, trayTemplate } from "./tray.js";

it("paints the dev badge over only the bottom-right quarter", () => {
  const source = Buffer.alloc(4 * 4 * 4, 0x11);
  const painted = paintDevBadge(source, 4, 4);
  const pixel = (x: number, y: number) => [...painted.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  expect(pixel(3, 3)).toEqual([0x00, 0x8c, 0xff, 0xff]);
  expect(pixel(2, 2)).toEqual([0x00, 0x8c, 0xff, 0xff]);
  expect(pixel(1, 3)).toEqual([0x11, 0x11, 0x11, 0x11]);
  expect(pixel(3, 1)).toEqual([0x11, 0x11, 0x11, 0x11]);
  expect(source[(3 * 4 + 3) * 4]).toBe(0x11);
});

it("builds Open, authoritative Mute/Unmute, and Quit actions", () => {
  const open = vi.fn();
  const mute = vi.fn();
  const quit = vi.fn();
  const actions = { open, mute, quit };

  const unavailable = trayTemplate(actions, null);
  expect(unavailable.map((item) => item.type === "separator" ? "separator" : item.label)).toEqual([
    "Open Stream Jams",
    "Mute Alerts and Effects",
    "separator",
    "Quit"
  ]);
  expect(unavailable[1]).toMatchObject({ enabled: false });

  const unmuted = trayTemplate(actions, { url: "http://127.0.0.1:39187", closeToTray: true, gpuAcceleration: true, muted: false });
  const muted = trayTemplate(actions, { url: "http://127.0.0.1:39187", closeToTray: true, gpuAcceleration: true, muted: true });
  expect(unmuted[1]).toMatchObject({ label: "Mute Alerts and Effects", enabled: true });
  expect(muted[1]).toMatchObject({ label: "Unmute Alerts and Effects", enabled: true });

  (unavailable[0]?.click as (() => void) | undefined)?.();
  (unmuted[1]?.click as (() => void) | undefined)?.();
  (muted[1]?.click as (() => void) | undefined)?.();
  (unavailable[3]?.click as (() => void) | undefined)?.();
  expect(open).toHaveBeenCalledOnce();
  expect(mute.mock.calls).toEqual([[true], [false]]);
  expect(quit).toHaveBeenCalledOnce();
});
