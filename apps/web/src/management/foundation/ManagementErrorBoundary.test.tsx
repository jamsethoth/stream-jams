import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagementErrorBoundary } from "./ManagementErrorBoundary.js";

describe("ManagementErrorBoundary", () => {
  it("reports a render failure once and shows only safe recovery copy and its reference", async () => {
    const report = vi.fn(async () => {});
    const renderError = new Error("private render details");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never { throw renderError; }

    try {
      render(
        <ManagementErrorBoundary reporter={{ report }} generateReferenceId={() => "err_react_1"}>
          <Broken />
        </ManagementErrorBoundary>
      );

      expect(await screen.findByRole("alert")).toHaveTextContent("The management interface stopped unexpectedly");
      expect(screen.getByText("err_react_1")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open diagnostics" })).toHaveAttribute(
        "href",
        "/manage/diagnostics?reference=err_react_1"
      );
      expect(screen.queryByText(/private render details/)).not.toBeInTheDocument();
      await vi.waitFor(() => expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        referenceId: "err_react_1",
        source: "react",
        exception: expect.objectContaining({
          type: "ReactRenderError",
          cause: expect.objectContaining({ message: "private render details" }),
          stack: expect.stringContaining("Broken")
        })
      })));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("recovers when its reset key changes", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function MaybeBroken({ broken }: { readonly broken: boolean }) {
      if (broken) throw new Error("broken");
      return <p>Management recovered.</p>;
    }
    const reporter = { report: vi.fn(async () => {}) };

    try {
      const view = render(
        <ManagementErrorBoundary reporter={reporter} generateReferenceId={() => "err_reset"} resetKey="broken">
          <MaybeBroken broken />
        </ManagementErrorBoundary>
      );
      view.rerender(
        <ManagementErrorBoundary reporter={reporter} generateReferenceId={() => "err_reset"} resetKey="healthy">
          <MaybeBroken broken={false} />
        </ManagementErrorBoundary>
      );
      expect(screen.getByText("Management recovered.")).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
