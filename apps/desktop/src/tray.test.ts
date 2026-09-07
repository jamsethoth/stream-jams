import { expect, it, vi } from "vitest";
import { trayTemplate } from "./tray.js";

it("builds Open, authoritative Mute/Unmute, and Quit actions", () => {
  const open = vi.fn();
  const mute = vi.fn();
  const quit = vi.fn();
  const actions = { open, mute, quit };

  const unavailable = trayTemplate(actions, null);
  expect(unavailable.map((item) => item.type === "separator" ? "separator" : item.label)).toEqual([
    "Open Stream Jams",
    "Mute alerts",
    "separator",
    "Quit"
  ]);
  expect(unavailable[1]).toMatchObject({ enabled: false });

  const unmuted = trayTemplate(actions, { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  const muted = trayTemplate(actions, { url: "http://127.0.0.1:39187", closeToTray: true, muted: true });
  expect(unmuted[1]).toMatchObject({ label: "Mute alerts", enabled: true });
  expect(muted[1]).toMatchObject({ label: "Unmute alerts", enabled: true });

  (unavailable[0]?.click as (() => void) | undefined)?.();
  (unmuted[1]?.click as (() => void) | undefined)?.();
  (muted[1]?.click as (() => void) | undefined)?.();
  (unavailable[3]?.click as (() => void) | undefined)?.();
  expect(open).toHaveBeenCalledOnce();
  expect(mute.mock.calls).toEqual([[true], [false]]);
  expect(quit).toHaveBeenCalledOnce();
});
