import { createScreenEffectDocument, screenEffectDocumentSchema } from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScreenEffectPreview } from "./ScreenEffectPreview.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: revoke });
  const draft = createScreenEffectDocument({ id: "effect", name: "Draft", defaultVariantId: "default" });
  const variant = screenEffectDocumentSchema.parse({ ...draft, variants: [{ ...draft.variants[0],
    visual: { mediaType: "video", assetId: "video", playEmbeddedAudio: true, audioVolume: 0.4,
      layout: { x: 480, y: 270, width: 960, height: 540, zIndex: 0 } },
    sound: { assetId: "sound", volume: 0.7 }, durationMs: 1000,
  }] }).variants[0]!;
  const api = { getAssetFile: vi.fn(async () => new Blob()) };
  return { play, pause, revoke, variant, api };
}

it("plays both draft audio sources locally, mutes both, respects layout and duration, and releases media", async () => {
  const { play, pause, revoke, variant, api } = setup();
  const view = render(<ScreenEffectPreview assetApi={api} variant={variant} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play preview" })).toBeEnabled());
  expect(play).not.toHaveBeenCalled();
  const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
  const audio = screen.getByLabelText("Preview sound") as HTMLAudioElement;
  expect(video.parentElement).toHaveStyle({ left: "25%", top: "25%", width: "50%", height: "50%" });
  vi.useFakeTimers();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play preview" })));
  expect(play).toHaveBeenCalledTimes(2);
  expect(video.volume).toBe(0.4);
  expect(audio.volume).toBe(0.7);
  expect(video.parentElement?.style.animationName).toBe("");
  fireEvent.click(screen.getByRole("checkbox", { name: "Mute preview" }));
  expect(video.muted).toBe(true);
  expect(audio.muted).toBe(true);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText(/Preview stopped/)).toHaveTextContent("Preview stopped");
  expect(pause).toHaveBeenCalled();
  view.unmount();
  expect(revoke).toHaveBeenCalledTimes(2);
});

it("keeps a suppressed video soundtrack muted and shows actionable playback failures", async () => {
  const { play, variant, api } = setup();
  const visual = variant.visual!;
  if (visual.mediaType !== "video") throw new Error("Expected video fixture");
  render(<ScreenEffectPreview assetApi={api} variant={{ ...variant, visual: { ...visual, playEmbeddedAudio: false } }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play preview" })).toBeEnabled());
  play.mockRejectedValue(new Error("blocked"));
  fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("browser audio permissions");
  expect((screen.getByLabelText("Preview video") as HTMLVideoElement).muted).toBe(true);
  expect(screen.getByRole("button", { name: "Stop preview" })).toBeDisabled();
});

it("ignores a late asset response after closing", async () => {
  const { variant, revoke } = setup();
  let resolve!: (blob: Blob) => void;
  const pending = new Promise<Blob>((done) => { resolve = done; });
  const view = render(<ScreenEffectPreview assetApi={{ getAssetFile: () => pending }} variant={variant} />);
  view.unmount();
  await act(async () => resolve(new Blob()));
  expect(revoke).not.toHaveBeenCalled();
});
