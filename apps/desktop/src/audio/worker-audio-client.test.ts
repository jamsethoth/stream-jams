import { expect, it, vi } from "vitest";
import { WorkerAudioClient } from "./worker-audio-client.js";

it("correlates audio responses to the owning generation and stops the lease on disposal", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn();
    const client = new WorkerAudioClient(3, send);
    const listed = client.listOutputDevices();
    const request = send.mock.calls.at(-1)![0];
    client.receive({ type: "audio-response", generation: 2, requestId: request.requestId, result: { type: "devices", devices: [] } });
    client.receive({ type: "audio-response", generation: 3, requestId: request.requestId, result: { type: "devices", devices: [{ deviceId: "sink", label: "Output" }] } });
    expect(await listed).toEqual([{ deviceId: "sink", label: "Output" }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenLastCalledWith({ type: "audio-lease", generation: 3, requestId: null });
    client.dispose(); send.mockClear();
    await vi.advanceTimersByTimeAsync(4000);
    expect(send).not.toHaveBeenCalled();
    await expect(client.stop("one")).rejects.toThrow();
  } finally { vi.useRealTimers(); }
});

it("preserves selected route failures across the worker response boundary", async () => {
  vi.useFakeTimers();
  const send = vi.fn(); const client = new WorkerAudioClient(3, send);
  try {
    const pending = client.play({ batch: { playbackId: "one", documentId: "alert", durationMs: 1000, muted: false, layers: [], destinations: [] }, assets: [], startDeadlineMs: 5000, deadlineMs: 10000 });
    const request = send.mock.calls.at(-1)![0];
    const result = { failedRouteIds: ["selected"], failures: [{ routeIds: ["selected"], layerId: "video", assetId: "clip", stage: "seek", exception: { type: "Error", message: "Seek failed", stack: null, code: null, cause: null, thrownValue: null } }] };
    client.receive({ type: "audio-response", generation: 3, requestId: request.requestId, result: { type: "played", ...result } });
    expect(await pending).toEqual(result);
  } finally { client.dispose(); vi.useRealTimers(); }
});

it("uses distinct prepared batch tokens and starts only after the shared epoch is supplied", async () => {
  vi.useFakeTimers();
  const send = vi.fn(); const client = new WorkerAudioClient(3, send);
  try {
    const payload = { batch: { playbackId: "one", documentId: "alert", durationMs: 1000, muted: false, layers: [], destinations: [] }, assets: [], startDeadlineMs: Date.now() + 5000, deadlineMs: Date.now() + 15000 };
    const first = client.prepare(payload);
    const second = client.prepare(payload);
    const requests = send.mock.calls.map(call => call[0]);
    expect(requests[0].command.type).toBe("prepare");
    expect(requests[0].command.token).not.toBe(requests[1].command.token);
    for (const request of requests) client.receive({ type: "audio-response", generation: 3, requestId: request.requestId, result: { type: "prepared", token: request.command.token } });
    const [one, two] = await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(2);
    const epoch = Date.now() + 100;
    const started = one.start(epoch);
    const start = send.mock.calls.at(-1)![0];
    expect(start.command).toEqual({ type: "start", token: requests[0].command.token, startsAtEpochMs: epoch, durationMs: 1000 });
    client.receive({ type: "audio-response", generation: 3, requestId: start.requestId, result: { type: "played", failedRouteIds: ["route"] } });
    expect(await started).toEqual({ failedRouteIds: ["route"] });
    expect(two.start).toBeTypeOf("function");
  } finally { client.dispose(); vi.useRealTimers(); }
});
