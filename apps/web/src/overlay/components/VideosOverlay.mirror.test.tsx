import type { VideosProjection } from "@stream-jams/core";
import { videoMirrorUpgradeDelayMs, type VideoMirrorConnector, type VideoMirrorPublisherSignal, type VideoMirrorReceiverSignal } from "@stream-jams/core/videos";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideosOverlay } from "./VideosOverlay.js";

class FakePeer {
  connectionState: RTCPeerConnectionState = "new";
  closed = false;
  localDescription = { sdp: "answer-sdp" };
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  async setRemoteDescription() {}
  async createAnswer() { return { type: "answer", sdp: "answer-sdp" }; }
  async setLocalDescription() {}
  async addIceCandidate() {}
  close() { this.closed = true; }
}

function connector() {
  const sent: VideoMirrorReceiverSignal[] = [];
  const listeners = new Set<(signal: VideoMirrorPublisherSignal) => void>();
  const value: VideoMirrorConnector = { send: signal => { sent.push(signal); }, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  return { value, sent, listeners, deliver: (signal: VideoMirrorPublisherSignal) => { for (const listener of listeners) listener(signal); } };
}

const mirrored = (paused = false, obsAudio = true, layout = { x: 269, y: 140, width: 1382, height: 876 }): VideosProjection => ({ status: "active", itemId: "item-1", title: "The big play", requester: "Viewer", layout, delivery: { mode: "mirror", paused, obsAudio } });

let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function connect(peers: FakePeer[], deliver: (signal: VideoMirrorPublisherSignal) => void) {
  await act(async () => { deliver({ type: "offer", connection: 1, sdp: "offer-sdp" }); await Promise.resolve(); });
  await act(async () => { peers[0]!.ontrack?.({ streams: [{ id: "stream" }] }); peers[0]!.connectionState = "connected"; peers[0]!.onconnectionstatechange?.(); });
}

describe("VideosOverlay mirror mode", () => {
  it("stays transparent while connecting, then shows the mirror with sound for browser sources", async () => {
    const { value, sent, deliver } = connector();
    const peers: FakePeer[] = [];
    render(<VideosOverlay createMirrorPeerConnection={() => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; }} mirror={value} projection={mirrored()} />);
    const overlay = screen.getByTestId("video-overlay");
    expect(overlay).toHaveAttribute("data-state", "connecting");
    expect(overlay).toHaveAttribute("data-delivery", "mirror");
    expect(screen.queryByText("The big play")).toBeNull();
    // Sound and the picture at the box's frame size (default box, 1:1 canvas in the test DOM).
    expect(sent).toEqual([{ type: "hello", connection: 1, media: "both", maxWidth: 1382, maxHeight: 777 }]);
    await connect(peers, deliver);
    expect(overlay).toHaveAttribute("data-state", "playing");
    expect(screen.getByText("The big play")).toBeVisible();
    const video = screen.getByTestId<HTMLVideoElement>("video-overlay-mirror");
    expect(video.muted).toBe(false);
    expect(play).toHaveBeenCalled();
    expect(sent).toContainEqual({ type: "answer", connection: 1, sdp: "answer-sdp" });
  });

  it("shows the mirrored picture in the saved box", async () => {
    const { value, deliver } = connector();
    const peers: FakePeer[] = [];
    const layout = { x: 40, y: 600, width: 640, height: 460 };
    render(<VideosOverlay createMirrorPeerConnection={() => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; }} mirror={value} projection={mirrored(false, true, layout)} />);
    await connect(peers, deliver);
    const overlay = screen.getByTestId("video-overlay");
    expect(overlay).toHaveStyle({ left: "40px", top: "600px", width: "640px", height: "460px" });
    expect(overlay.querySelector(".video-overlay__frame")).toHaveStyle({ width: "640px", height: "360px" });
  });

  it("shows paused state and keeps the desktop overlay receiver muted", async () => {
    const { value, deliver } = connector();
    const peers: FakePeer[] = [];
    render(<VideosOverlay createMirrorPeerConnection={() => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; }} mirror={value} mirrorAudio={false} projection={mirrored(true)} />);
    await connect(peers, deliver);
    expect(screen.getByTestId("video-overlay")).toHaveAttribute("data-state", "paused");
    expect(screen.getByTestId<HTMLVideoElement>("video-overlay-mirror").muted).toBe(true);
  });

  it("follows mute and the OBS audio setting", async () => {
    const { value, deliver } = connector();
    const peers: FakePeer[] = [];
    const create = () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; };
    const { rerender } = render(<VideosOverlay createMirrorPeerConnection={create} mirror={value} muted projection={mirrored()} />);
    await connect(peers, deliver);
    const video = screen.getByTestId<HTMLVideoElement>("video-overlay-mirror");
    expect(video.muted).toBe(true);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored()} />);
    expect(video.muted).toBe(false);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored(false, false)} />);
    expect(video.muted).toBe(true);
    expect(peers).toHaveLength(1);
  });

  it("asks the desktop overlay and muted outputs for the picture only, sized to the frame in device pixels", () => {
    const first = connector();
    render(<VideosOverlay mirror={first.value} mirrorAudio={false} projection={mirrored()} />);
    expect(first.sent).toEqual([{ type: "hello", connection: 1, media: "video", maxWidth: 1382, maxHeight: 777 }]);
    cleanup();
    const second = connector();
    render(<VideosOverlay mirror={second.value} muted projection={mirrored()} />);
    expect(second.sent[0]).toMatchObject({ media: "video" });
    cleanup();
    const third = connector();
    render(<VideosOverlay mirror={third.value} projection={mirrored(false, false)} />);
    expect(third.sent[0]).toMatchObject({ media: "video" });
    cleanup();
    // A canvas scaled to a 1280 x 720 browser source on a 2x display: 2/3 of the canvas, twice the pixels.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 640 * 2 / 3, height: 460 * 2 / 3 } as DOMRect);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const scaled = connector();
    render(<VideosOverlay mirror={scaled.value} projection={mirrored(false, true, { x: 40, y: 600, width: 640, height: 460 })} />);
    expect(scaled.sent).toEqual([{ type: "hello", connection: 1, media: "both", maxWidth: 853, maxHeight: 480 }]);
  });

  it("reconnects with sound once when it is unmuted mid-item, and keeps the connection when muted", async () => {
    vi.useFakeTimers();
    const { value, sent, deliver } = connector();
    const peers: FakePeer[] = [];
    const create = () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; };
    const { rerender } = render(<VideosOverlay createMirrorPeerConnection={create} mirror={value} muted projection={mirrored()} />);
    await connect(peers, deliver);
    expect(sent[0]).toMatchObject({ type: "hello", connection: 1, media: "video" });
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored()} />);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} muted projection={mirrored()} />);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored()} />);
    act(() => { vi.advanceTimersByTime(videoMirrorUpgradeDelayMs); });
    const hellos = () => sent.filter(signal => signal.type === "hello");
    expect(hellos()).toEqual([expect.objectContaining({ media: "video" }), { type: "hello", connection: 2, media: "both", maxWidth: 1382, maxHeight: 777 }]);
    expect(peers[0]!.closed).toBe(true);
    // Muting again, or turning OBS audio off, only mutes the element.
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} muted projection={mirrored()} />);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored(false, false)} />);
    act(() => { vi.advanceTimersByTime(videoMirrorUpgradeDelayMs * 4); });
    expect(hellos()).toHaveLength(2);
    expect(screen.getByTestId<HTMLVideoElement>("video-overlay-mirror").muted).toBe(true);
  });

  it("reconnects for a bigger box but not a smaller one", () => {
    vi.useFakeTimers();
    const { value, sent } = connector();
    const small = { x: 40, y: 600, width: 640, height: 460 };
    const { rerender } = render(<VideosOverlay mirror={value} projection={mirrored(false, true, small)} />);
    rerender(<VideosOverlay mirror={value} projection={mirrored(false, true, { ...small, width: 600, height: 400 })} />);
    act(() => { vi.advanceTimersByTime(videoMirrorUpgradeDelayMs); });
    expect(sent.filter(signal => signal.type === "hello")).toHaveLength(1);
    rerender(<VideosOverlay mirror={value} projection={mirrored()} />);
    act(() => { vi.advanceTimersByTime(videoMirrorUpgradeDelayMs); });
    expect(sent.filter(signal => signal.type === "hello").map(signal => signal.type === "hello" ? signal.maxWidth : null)).toEqual([640, 1382]);
  });

  it("reports unavailable and stays hidden when the desktop player is not ready", () => {
    vi.useFakeTimers();
    const { value, deliver } = connector();
    render(<VideosOverlay mirror={value} projection={mirrored()} />);
    act(() => { deliver({ type: "not-ready", connection: 1 }); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { deliver({ type: "not-ready", connection: 2 }); });
    expect(screen.getByTestId("video-overlay")).toHaveAttribute("data-state", "unavailable");
    expect(screen.queryByText("The big play")).toBeNull();
  });

  it("falls back to a muted picture when autoplay with sound is refused", async () => {
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const { value, deliver } = connector();
    const peers: FakePeer[] = [];
    render(<VideosOverlay createMirrorPeerConnection={() => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; }} mirror={value} projection={mirrored()} />);
    await connect(peers, deliver);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId<HTMLVideoElement>("video-overlay-mirror").muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("says bye and closes the connection when the item ends", async () => {
    const { value, sent, listeners, deliver } = connector();
    const peers: FakePeer[] = [];
    const create = () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as RTCPeerConnection; };
    const { rerender, container } = render(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={mirrored()} />);
    await connect(peers, deliver);
    rerender(<VideosOverlay createMirrorPeerConnection={create} mirror={value} projection={{ status: "idle" }} />);
    expect(container).toBeEmptyDOMElement();
    expect(sent.at(-1)).toEqual({ type: "bye", connection: 1 });
    expect(peers[0]!.closed).toBe(true);
    expect(listeners.size).toBe(0);
  });
});
