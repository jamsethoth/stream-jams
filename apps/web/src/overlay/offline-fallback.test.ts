import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOverlayOfflineFallback } from "./offline-fallback.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("registerOverlayOfflineFallback", () => {
  it("registers the key-free worker for the overlay scope without the HTTP cache", () => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    registerOverlayOfflineFallback({ register });
    expect(register).toHaveBeenCalledExactlyOnceWith("/overlay/offline-worker.js", { scope: "/overlay/", updateViaCache: "none" });
  });

  it("does nothing when the browser has no service worker support", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: undefined });
    try {
      registerOverlayOfflineFallback();
    } finally { vi.unstubAllGlobals(); }
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a rejected registration off stream instead of failing the overlay", async () => {
    const failure = new DOMException("The script has an unsupported MIME type", "SecurityError");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerOverlayOfflineFallback({ register: () => Promise.reject(failure) });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledExactlyOnceWith("Overlay offline fallback could not be registered.", failure));
  });
});
