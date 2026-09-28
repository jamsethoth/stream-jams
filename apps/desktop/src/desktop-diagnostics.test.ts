import { describe, expect, it, vi } from "vitest";
import { DesktopDiagnostics, desktopDiagnosticReportSchema } from "./desktop-diagnostics.js";

describe("DesktopDiagnostics", () => {
  it("serializes a native exception and sends one strict bounded report", () => {
    const send = vi.fn(() => true);
    const diagnostics = new DesktopDiagnostics({ send, generateReferenceId: () => "err_desktop_1" });
    const cause = new Error("renderer failed", { cause: new Error("gpu process unavailable") });

    const report = diagnostics.record({
      component: "management-renderer",
      source: "desktop.renderer.gone",
      message: "The management renderer exited unexpectedly.",
      exception: cause,
      reason: "crashed",
      exitCode: -1073741819
    });

    expect(desktopDiagnosticReportSchema.parse(report)).toEqual(report);
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      referenceId: "err_desktop_1",
      exception: expect.objectContaining({
        message: "renderer failed",
        cause: expect.objectContaining({ message: "gpu process unavailable" })
      })
    }));
  });

  it("uses a redacted bounded local fallback once when worker delivery fails", () => {
    const fallback = vi.fn();
    const diagnostics = new DesktopDiagnostics({
      send: () => { throw new Error("worker transport failed"); },
      writeFallback: fallback,
      generateReferenceId: () => "err_desktop_fallback"
    });

    expect(() => diagnostics.record({
      component: "service-worker",
      source: "desktop.worker.send-failed",
      message: "Worker failed with token=private-token at https://private.example/path?q=secret",
      exception: new Error("authorization: Bearer private-token"),
      reason: null,
      exitCode: null
    })).not.toThrow();

    expect(fallback).toHaveBeenCalledOnce();
    const written = JSON.stringify(fallback.mock.calls[0]?.[0]);
    expect(written).toContain("[REDACTED]");
    expect(written).not.toMatch(/private-token|private\.example|q=secret/u);
  });

  it("records only bounded crash-dump metadata from a prior launch", () => {
    const send = vi.fn(() => true);
    const diagnostics = new DesktopDiagnostics({ send, generateReferenceId: () => "err_prior_dump" });

    diagnostics.recordPriorCrashDumps([
      { name: "renderer-private-name.dmp", modifiedAt: "2026-09-27T23:00:00.000Z" },
      { name: "ignore.txt", modifiedAt: "2026-09-27T23:00:00.000Z" }
    ]);

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      component: "crashpad",
      source: "desktop.crashpad.prior-dump",
      reason: "renderer-private-name.dmp modified 2026-09-27T23:00:00.000Z",
      exception: null
    }));
  });
});
