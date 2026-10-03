import { act, render, screen, waitFor } from "@testing-library/react";
import { compatibilityAlertTextStyle } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertTextContent } from "./AlertTextContent.js";

afterEach(() => vi.unstubAllGlobals());
describe("AlertTextContent lifecycle", () => {
  it("updates dynamic strings and reports readiness", async () => {
    const ready = vi.fn();
    const { rerender } = render(<AlertTextContent text="First username" textStyle={compatibilityAlertTextStyle} width={400} height={100} onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenCalledOnce());
    rerender(<AlertTextContent text="Second username" textStyle={compatibilityAlertTextStyle} width={400} height={100} onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Second username")).toHaveStyle({ visibility: "visible" });
  });
  it("hides failed custom fonts and rejects stale failure callbacks", async () => {
    let reject: (error: Error) => void = () => undefined;
    const loader = vi.fn(() => new Promise<Blob>((_resolve, fail) => { reject = fail; }));
    const error = vi.fn();
    const ready = vi.fn();
    const { rerender } = render(<AlertTextContent text="Old" textStyle={{ ...compatibilityAlertTextStyle, fontAssetId: "asset-font" }} width={400} height={100} loadFont={loader} onError={error} />);
    expect(screen.getByText("Old")).toHaveStyle({ visibility: "hidden" });
    rerender(<AlertTextContent text="New" textStyle={compatibilityAlertTextStyle} width={400} height={100} onError={error} onReady={ready} />);
    await act(async () => reject(new Error("old request failed")));
    expect(error).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledOnce();
    expect(screen.getByText("New")).toHaveStyle({ visibility: "visible" });
  });
  it("reports font delivery failure once and stays hidden", async () => {
    const error = vi.fn();
    render(<AlertTextContent text="Hidden" textStyle={{ ...compatibilityAlertTextStyle, fontAssetId: "asset-font" }} width={400} height={100} loadFont={() => Promise.reject(new Error("missing"))} onError={error} />);
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(screen.getByText("Hidden")).toHaveStyle({ visibility: "hidden" });
  });
});
