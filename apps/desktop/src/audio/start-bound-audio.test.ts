import { expect, it, vi } from "vitest";
import { startBoundAudio } from "./start-bound-audio.js";

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("never plays on the default device after sink selection fails", async () => {
  const element = {
    volume: 1,
    muted: false,
    setSinkId: vi.fn(async () => {
      throw new Error("missing device");
    }),
    play: vi.fn(async () => {}),
    pause: vi.fn()
  };

  await expect(startBoundAudio(element, "headphones", 0.4, false, () => true)).rejects.toThrow("missing device");
  expect(element.play).not.toHaveBeenCalled();
});

it("does not play when the occurrence is cancelled while sink selection is pending", async () => {
  const sink = deferred();
  let current = true;
  const element = {
    volume: 1,
    muted: false,
    setSinkId: vi.fn(() => sink.promise),
    play: vi.fn(async () => {}),
    pause: vi.fn()
  };

  const started = startBoundAudio(element, "headphones", 0.4, false, () => current);
  current = false;
  sink.resolve();
  await started;

  expect(element.play).not.toHaveBeenCalled();
});

it("applies the requested mute and volume before selecting the sink", async () => {
  const stateWhenSelecting: Array<{ muted: boolean; volume: number }> = [];
  const element = {
    volume: 1,
    muted: false,
    setSinkId: vi.fn(async () => {
      stateWhenSelecting.push({ muted: element.muted, volume: element.volume });
    }),
    play: vi.fn(async () => {}),
    pause: vi.fn()
  };

  await startBoundAudio(element, "headphones", 0.4, true, () => true);

  expect(stateWhenSelecting).toEqual([{ muted: true, volume: 0.4 }]);
  expect(element.play).toHaveBeenCalledOnce();
});
