import { alertStarterThemes, streamEventTypes, type AlertStarterThemeId } from "@stream-jams/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertThemeChooser } from "./AlertThemeChooser.js";
import { AlertThemePreview } from "./AlertThemePreview.js";

const resizeCallbacks = new Map<Element, ResizeObserverCallback>();
const resizeObservers: PreviewResizeObserver[] = [];

class PreviewResizeObserver implements ResizeObserver {
  readonly disconnect = vi.fn(() => {
    for (const [target, callback] of resizeCallbacks) {
      if (callback === this.callback) resizeCallbacks.delete(target);
    }
  });

  constructor(readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }

  observe(target: Element) {
    resizeCallbacks.set(target, this.callback);
  }

  unobserve(target: Element) {
    resizeCallbacks.delete(target);
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", PreviewResizeObserver);
});

afterEach(() => {
  cleanup();
  resizeCallbacks.clear();
  resizeObservers.length = 0;
  vi.unstubAllGlobals();
});

describe("AlertThemeChooser", () => {
  it("renders the exact catalog order as an accessible controlled radio group", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AlertThemeChooser eventType="raid" onChange={onChange} value="clean-signal" />
    );
    const group = screen.getByRole("radiogroup", { name: "Starter theme" });
    const radios = within(group).getAllByRole("radio");

    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Clean Signal",
      "Bold Pop",
      "Neon Terminal"
    ]);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();

    rerender(<AlertThemeChooser eventType="raid" onChange={onChange} value="bold-pop" />);
    expect(within(group).getByRole("radio", { name: "Bold Pop" })).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports native radio changes without changing the controlled value itself", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(themeId: AlertStarterThemeId) => void>();
    render(<AlertThemeChooser eventType="raid" onChange={onChange} value="clean-signal" />);

    await user.click(screen.getByRole("radio", { name: "Neon Terminal" }));

    expect(onChange).toHaveBeenCalledWith("neon-terminal");
    expect(screen.getByRole("radio", { name: "Clean Signal" })).toBeChecked();
  });

  it("disables every native option when the chooser is disabled", () => {
    render(<AlertThemeChooser disabled eventType="raid" onChange={vi.fn()} value="clean-signal" />);

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getAllByRole("radio").every((radio) => radio.hasAttribute("disabled"))).toBe(true);
  });

  it("renders both read-only profiles for every theme from actual resolved materialized output", () => {
    const { container } = render(
      <AlertThemeChooser eventType="raid" onChange={vi.fn()} value="clean-signal" />
    );
    const previews = screen.getAllByRole("img", { name: /preview$/iu });

    expect(previews).toHaveLength(6);
    expect(previews.map((preview) => preview.getAttribute("aria-label"))).toEqual(
      alertStarterThemes.flatMap((theme) => [
        `${theme.label} Landscape 16:9 preview`,
        `${theme.label} Vertical 9:16 preview`
      ])
    );
    expect(screen.getAllByText("Welcome raiders from StreamSpark!")).toHaveLength(6);
    expect(container).not.toHaveTextContent(/\{[^{}]+\}/u);
    expect(container.querySelectorAll(".alert-theme-preview__shape").length).toBeGreaterThanOrEqual(8);
    expect(container.querySelector(".alert-theme-preview__shape")).toHaveStyle({
      backgroundColor: "rgba(7, 17, 29, 0.87)"
    });
    expect(previews.every((preview) => preview.tagName === "SPAN")).toBe(true);
  });

  it("scales materialized text with narrow and wide preview surfaces", () => {
    render(<AlertThemeChooser eventType="raid" onChange={vi.fn()} value="clean-signal" />);
    const preview = screen.getByRole("img", { name: "Clean Signal Landscape 16:9 preview" });
    const message = within(preview).getByText("Welcome raiders from StreamSpark!");

    act(() => resizePreview(preview, 240));
    const narrowFontSize = Number.parseFloat(message.style.fontSize);
    act(() => resizePreview(preview, 480));
    const wideFontSize = Number.parseFloat(message.style.fontSize);

    expect(narrowFontSize).toBeGreaterThan(0);
    expect(wideFontSize).toBeCloseTo(narrowFontSize * 2);
  });

  it("replaces and disconnects the surface observer when the profile changes", () => {
    const props = {
      eventType: "raid" as const,
      templateContext: { userName: "StreamSpark" },
      themeId: "clean-signal" as const,
      themeLabel: "Clean Signal"
    };
    const { rerender, unmount } = render(<AlertThemePreview {...props} profileId="landscape" />);
    const landscapeObserver = resizeObservers.at(-1)!;

    rerender(<AlertThemePreview {...props} profileId="vertical" />);

    expect(landscapeObserver.disconnect).toHaveBeenCalledOnce();
    const verticalObserver = resizeObservers.at(-1)!;
    expect(verticalObserver).not.toBe(landscapeObserver);

    unmount();
    expect(verticalObserver.disconnect).toHaveBeenCalledOnce();
  });

  it("provides resolved deterministic preview text for every canonical event", () => {
    const { container, rerender } = render(
      <AlertThemeChooser eventType="follow" onChange={vi.fn()} value="clean-signal" />
    );

    for (const eventType of streamEventTypes) {
      rerender(<AlertThemeChooser eventType={eventType} onChange={vi.fn()} value="clean-signal" />);
      expect(container).not.toHaveTextContent(/\{[^{}]+\}/u);
    }
  });
});

function resizePreview(target: Element, width: number) {
  const callback = resizeCallbacks.get(target);
  if (callback === undefined) throw new Error("Preview surface is not being observed");
  const observer = resizeObservers.find((candidate) => candidate.callback === callback)!;
  callback([{
    target,
    contentRect: { width }
  } as ResizeObserverEntry], observer);
}
