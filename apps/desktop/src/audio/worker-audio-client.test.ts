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
