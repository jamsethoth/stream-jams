import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioApi } from "./audio-api.js";
import { useAudioStatus } from "./use-audio-status.js";

describe("useAudioStatus", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("polls while visible without overlap and retains the last status after refresh failure", async () => {
    vi.useFakeTimers();
    let finishSecond: ((value: ReturnType<typeof status>) => void) | undefined;
    const getStatus = vi.fn()
      .mockResolvedValueOnce(status("ready"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }))
      .mockRejectedValueOnce(new Error("Device scan failed"));
    const api = createApi(getStatus);
    const { result } = renderHook(() => useAudioStatus(api));

    await act(async () => { await Promise.resolve(); });
    expect(result.current.status?.routes[0]?.state).toBe("ready");

    act(() => { vi.advanceTimersByTime(4_000); });
    expect(getStatus).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(getStatus).toHaveBeenCalledTimes(2);

    await act(async () => { finishSecond?.(status("missing-device")); });
    act(() => { vi.advanceTimersByTime(4_000); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.status?.routes[0]?.state).toBe("missing-device");
    expect(result.current.error).toBe("Device scan failed");
    expect(result.current.loading).toBe(false);
  });

  it("waits for an older poll and then performs an explicit fresh refresh", async () => {
    vi.useFakeTimers();
    let finishPoll: ((value: ReturnType<typeof status>) => void) | undefined;
    const getStatus = vi.fn()
      .mockResolvedValueOnce(status("ready"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishPoll = resolve; }))
      .mockResolvedValueOnce(status("missing-device"));
    const api = createApi(getStatus);
    const { result } = renderHook(() => useAudioStatus(api));
    await act(async () => { await Promise.resolve(); });

    act(() => { vi.advanceTimersByTime(4_000); });
    let refreshed: Promise<void> | undefined;
    act(() => { refreshed = result.current.refresh(); });
    expect(getStatus).toHaveBeenCalledTimes(2);

    await act(async () => { finishPoll?.(status("ready")); await refreshed; });
    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(result.current.status?.routes[0]?.state).toBe("missing-device");
  });
});

function createApi(getStatus: AudioApi["getStatus"]): AudioApi {
  return {
    getStatus,
    createRoute: vi.fn(), updateRoute: vi.fn(), deleteRoute: vi.fn(), testRoute: vi.fn(), retry: vi.fn()
  };
}

function status(state: "ready" | "missing-device") {
  return {
    capability: { available: true as const, devices: [{ deviceId: "endpoint-a", label: "USB headphones" }], reason: null, nextStep: null },
    muted: false,
    routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headphones" }, state }]
  };
}
