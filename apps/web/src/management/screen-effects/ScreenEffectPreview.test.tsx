import { createTestMediaPreviewApi, previewDescriptor } from "../../test-support/media-preview-fixture.js";
import type { MediaPreviewDescriptor } from "@stream-jams/core";
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
  const api = createTestMediaPreviewApi();
  const release = vi.spyOn(api, "releasePreview");
  return { play, pause, revoke, release, variant, api };
}

it("plays both draft audio sources locally, mutes both, respects layout and duration, and releases media", async () => {
  const { play, pause, release, variant, api } = setup();
  const view = render(<ScreenEffectPreview assetApi={api} assetDurations={new Map()} variant={variant} />);
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
  expect(release).toHaveBeenCalledTimes(2);
});

it("fades each draft audio source against its own media duration", async () => {
  const { variant, api } = setup();
  const sound = variant.sound!;
  render(<ScreenEffectPreview
    assetApi={api}
    assetDurations={new Map([["video", 5_000], ["sound", 1_000]])}
    variant={{ ...variant, durationMs: 5_000, sound: { ...sound, fadeOutMs: 500 } }}
  />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play preview" })).toBeEnabled());
  const audio = screen.getByLabelText("Preview sound") as HTMLAudioElement;
  vi.useFakeTimers();

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play preview" })));
  act(() => vi.advanceTimersByTime(750));

  expect(audio.volume).toBeCloseTo(0.35, 2);
});

it("keeps a suppressed video soundtrack muted and shows actionable playback failures", async () => {
  const { play, variant, api } = setup();
  const visual = variant.visual!;
  if (visual.mediaType !== "video") throw new Error("Expected video fixture");
  render(<ScreenEffectPreview assetApi={api} assetDurations={new Map()} variant={{ ...variant, visual: { ...visual, playEmbeddedAudio: false } }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play preview" })).toBeEnabled());
  play.mockRejectedValue(new Error("blocked"));
  fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("browser audio permissions");
  expect((screen.getByLabelText("Preview video") as HTMLVideoElement).muted).toBe(true);
  expect(screen.getByRole("button", { name: "Stop preview" })).toBeDisabled();
});

it("ignores a late asset response after closing", async () => {
  const { variant, revoke } = setup();
  let resolve!: (value: MediaPreviewDescriptor) => void;
  const pending = new Promise<MediaPreviewDescriptor>((done) => { resolve = done; });
  const view = render(<ScreenEffectPreview assetApi={createTestMediaPreviewApi(() => pending)} assetDurations={new Map()} variant={variant} />);
  view.unmount();
  await act(async () => resolve(previewDescriptor()));
  expect(revoke).not.toHaveBeenCalled();
});


it("unregisters each GIF image when replay remounts it and when playback stops", async () => {
  const { variant, api, release } = setup();
  const visual = variant.visual!;
  const gif = { ...variant, visual: { mediaType: "gif" as const, assetId: "gif", layout: visual.layout }, sound: null };
  const view = render(<ScreenEffectPreview assetApi={api} assetDurations={new Map()} variant={gif} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play preview" })).toBeEnabled());
  for (let run = 0; run < 3; run += 1) {
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play preview" })));
    const previous = screen.getByRole("img") as HTMLImageElement;
    expect(previous.getAttribute("src")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Play preview" })));
    expect(screen.getByRole("img")).not.toBe(previous);
    expect(previous.hasAttribute("src")).toBe(false);
    const current = screen.getByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Stop preview" }));
    expect(current.hasAttribute("src")).toBe(false);
    expect(screen.queryByRole("img")).toBeNull();
    expect(release).not.toHaveBeenCalled();
  }
  view.unmount();
  expect(release).toHaveBeenCalledOnce();
});
