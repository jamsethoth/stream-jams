import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useMediaVolumeEnvelope } from "./use-media-volume-envelope.js";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Subject({ startsAtEpochMs = 1_000, volume = 0.8 }: { startsAtEpochMs?: number; volume?: number }) {
  const ref = createRef<HTMLAudioElement>();
  useMediaVolumeEnvelope(ref, {
    volume, fadeInMs: 1_000, fadeOutMs: 1_000,
    playbackDurationMs: 4_000, startsAtEpochMs, muted: false
  }, true);
  return <audio ref={ref} data-testid="media" />;
}

it("applies a linear envelope from the absolute playback epoch", () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  const view = render(<Subject />);
  const media = view.getByTestId("media") as HTMLAudioElement;
  expect(media.volume).toBe(0);
  act(() => vi.advanceTimersByTime(500));
  expect(media.volume).toBeCloseTo(0.4);
  act(() => vi.advanceTimersByTime(3_000));
  expect(media.volume).toBeCloseTo(0.4);
  view.unmount();
  act(() => vi.advanceTimersByTime(100));
  expect(vi.getTimerCount()).toBe(0);
});

it("starts late joins at their current envelope gain", () => {
  vi.useFakeTimers(); vi.setSystemTime(4_500);
  const view = render(<Subject />);
  expect((view.getByTestId("media") as HTMLAudioElement).volume).toBeCloseTo(0.4);
});

it("applies gain above 100 percent through Web Audio", () => {
  vi.useFakeTimers(); vi.setSystemTime(2_000);
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const close = vi.fn(async () => {});
  vi.stubGlobal("AudioContext", class {
    destination = {};
    createGain = () => gain;
    createMediaElementSource = () => source;
    resume = async () => {};
    close = close;
  });
  const view = render(<Subject volume={2} />);
  expect(gain.gain.value).toBe(2);
  expect((view.getByTestId("media") as HTMLAudioElement).volume).toBe(1);
  view.unmount();
  expect(close).toHaveBeenCalledOnce();
});
