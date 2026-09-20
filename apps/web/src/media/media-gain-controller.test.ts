import { expect, it, vi } from "vitest";
import { createMediaGainController } from "./media-gain-controller.js";

it("uses native media volume through 100 percent and an audio gain stage above it", () => {
  const element = { volume: 1 } as HTMLMediaElement;
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = { createGain: vi.fn(() => gain), createMediaElementSource: vi.fn(() => source), destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const controller = createMediaGainController(element, () => context as unknown as AudioContext);

  controller.setGain(0.4);
  expect(element.volume).toBe(0.4);
  expect(context.createGain).not.toHaveBeenCalled();
  controller.setGain(1.75);
  expect(element.volume).toBe(1);
  expect(gain.gain.value).toBe(1.75);
  controller.setGain(0.5);
  expect(gain.gain.value).toBe(0.5);
  controller.dispose();
  expect(source.disconnect).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  expect(context.close).toHaveBeenCalledOnce();
});

it("caps the native fallback when Web Audio is unavailable", () => {
  const element = { volume: 0 } as HTMLMediaElement;
  const controller = createMediaGainController(element, null);
  controller.setGain(2);
  expect(element.volume).toBe(1);
});

it("keeps playback usable when Web Audio amplification cannot initialize", () => {
  const element = { volume: 0 } as HTMLMediaElement;
  const controller = createMediaGainController(element, () => { throw new Error("Audio graph unavailable"); });

  expect(() => controller.setGain(2)).not.toThrow();
  expect(element.volume).toBe(1);
});
