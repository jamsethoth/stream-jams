import userEvent from "@testing-library/user-event";
import { renderManagement as render } from "../../test-support/render-management.js";
import { createTestMediaPreviewApi, previewDescriptor } from "../../test-support/media-preview-fixture.js";
import { timersOverlayModuleDefinition, type TimerDefinition } from "@stream-jams/core";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimerStackEditor } from "./TimerStackEditor.js";

let resizeCallback: ResizeObserverCallback | undefined;

class PreviewResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  disconnect() {}
  observe(target: Element) {
    if (target.classList.contains("timer-layout__preview-shell")) resizeCallback = this.callback;
  }
  unobserve() {}
}

afterEach(() => {
  cleanup();
  resizeCallback = undefined;
  vi.unstubAllGlobals();
});

describe("TimerStackEditor", () => {
  it("round-trips every numeric and color appearance field independently", () => {
    let latest = structuredClone(timersOverlayModuleDefinition.defaultConfig);
    function Owner() {
      const [value, setValue] = useState(latest);
      return <TimerStackEditor assetApi={createTestMediaPreviewApi()} value={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    render(<Owner />);
    const entries = [
      ["Card width (px)", "cardWidthPx", 650], ["Card height (px)", "cardHeightPx", 75], ["Maximum shown", "maxVisible", 3],
      ["Stack gap (px)", "stackGapPx", 2], ["Content gap (px)", "gapPx", 9], ["Vertical padding (px)", "blockPaddingPx", 8],
      ["Horizontal padding (px)", "inlinePaddingPx", 11], ["Corner radius (px)", "cornerRadiusPx", 9], ["Border width (px)", "borderWidthPx", 3],
      ["Background opacity", "backgroundOpacity", .4], ["Icon size (px)", "iconSizePx", 35],
      ["Border color", "borderColor", "#123456"], ["Background color", "backgroundColor", "#234567"], ["Running accent", "runningAccent", "#345678"],
      ["Paused accent", "pausedAccent", "#456789"], ["Completed accent", "completedAccent", "#567890"]
    ] as const;
    for (const [label, field, value] of entries) {
      const before = latest.profiles.landscape.appearance;
      fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
      expect(latest.profiles.landscape.appearance).toEqual({ ...before, [field]: value });
    }
  });
  it("edits the card shadow from the original default and turns it off without losing its shape", () => {
    let latest = structuredClone(timersOverlayModuleDefinition.defaultConfig);
    function Owner() {
      const [value, setValue] = useState(latest);
      return <TimerStackEditor assetApi={createTestMediaPreviewApi()} value={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    render(<Owner />);
    expect(screen.getByLabelText("Shadow blur (px)")).toHaveValue(24);
    fireEvent.change(screen.getByLabelText("Shadow X (px)"), { target: { value: "6" } });
    expect(latest.profiles.landscape.appearance.shadow).toEqual({ offsetX: 6, offsetY: 8, blur: 24, spread: 0, color: "#0000006B" });
    fireEvent.change(screen.getByLabelText("Shadow", { selector: "select" }), { target: { value: "off" } });
    expect(latest.profiles.landscape.appearance.shadow).toEqual({ offsetX: 6, offsetY: 8, blur: 24, spread: 0, color: "#00000000" });
    expect(screen.getByLabelText("Shadow", { selector: "select" })).toHaveValue("off");
  });
  it("round-trips fonts and placement, retains drafts and resets only the selected profile", async () => {
    const user = userEvent.setup();
    let latest = structuredClone(timersOverlayModuleDefinition.defaultConfig);
    function Owner() {
      const [value, setValue] = useState(latest);
      return <TimerStackEditor assetApi={createTestMediaPreviewApi()} value={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    render(<Owner />);
    const originalVertical = structuredClone(latest.profiles.vertical);
    for (const [label, field] of [["Label", "labelFont"], ["Countdown", "valueFont"]] as const) {
      await user.selectOptions(screen.getByLabelText(`${label} font`), "serif");
      expect(latest.profiles.landscape.appearance[field].legacyFamily).toBeUndefined();
      fireEvent.change(screen.getByLabelText(`${label} size (px)`), { target: { value: "18" } });
      await user.selectOptions(screen.getByLabelText(`${label} weight`), "500");
      fireEvent.change(screen.getByLabelText(`${label} color`), { target: { value: "#112233" } });
      expect(latest.profiles.landscape.appearance[field]).toEqual({ fontPreset: "serif", fontSizePx: 18, fontWeight: 500, color: "#112233" });
    }
    await user.selectOptions(screen.getByLabelText("Stack direction"), "Right to left");
    expect(latest.profiles.landscape.appearance).toMatchObject({ orientation: "horizontal", reverse: true });
    await user.selectOptions(screen.getByLabelText("Desktop direction"), "Left to right");
    expect(latest.profiles.landscape.desktopPlacement.reverse).toBe(false);
    await user.selectOptions(screen.getByLabelText("Desktop direction"), "Same as browser");
    expect(latest.profiles.landscape.desktopPlacement.reverse).toBeUndefined();
    await user.selectOptions(screen.getByLabelText("Stack direction"), "Left to right");
    expect(latest.profiles.landscape.appearance).toMatchObject({ orientation: "horizontal", reverse: false });
    for (const [label, field, value] of [["X", "x", 65], ["Y", "y", 100], ["Z order", "zIndex", 7], ["Desktop scale", "scale", .4]] as const) {
      const before = latest.profiles.landscape.desktopPlacement;
      fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value: String(value) } });
      expect(latest.profiles.landscape.desktopPlacement).toEqual({ ...before, [field]: value });
    }
    const landscapeDraft = structuredClone(latest.profiles.landscape);
    await user.click(screen.getByRole("radio", { name: "Vertical" }));
    expect(latest.profiles.vertical).toEqual(originalVertical);
    fireEvent.change(screen.getByLabelText("X", { exact: true }), { target: { value: "49" } });
    await user.click(screen.getByRole("radio", { name: "Landscape" }));
    expect(latest.profiles.landscape).toEqual(landscapeDraft);
    await user.click(screen.getByRole("radio", { name: "Vertical" }));
    await user.click(screen.getByRole("button", { name: "Reset selected profile" }));
    expect(latest.profiles.vertical).toEqual(originalVertical); expect(latest.profiles.landscape).toEqual(landscapeDraft);
  });
  it("selects labelled profile values over one keyboard-operable canvas", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = structuredClone(timersOverlayModuleDefinition.defaultConfig);
    render(<TimerStackEditor assetApi={createTestMediaPreviewApi()} value={value} onChange={onChange} />);
    const landscape = screen.getByRole("radio", { name: "Landscape" });
    const vertical = screen.getByRole("radio", { name: "Vertical" });
    expect(screen.getByRole("radiogroup", { name: "Timer profile" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(landscape).toBeChecked();
    landscape.focus();
    await user.keyboard("{ArrowRight}");
    expect(vertical).toBeChecked();
    expect(vertical).toHaveFocus();
    expect(screen.getByLabelText("vertical timer preview")).toBeInTheDocument();
    const move = screen.getByRole("button", { name: "Move timer region" });
    move.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith({ ...value, profiles: { ...value.profiles, vertical: { ...value.profiles.vertical, desktopPlacement: { ...value.profiles.vertical.desktopPlacement, x: value.profiles.vertical.desktopPlacement.x + 1 } } } });
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
  });

  it.each(["pointer cancellation", "Escape"])("restores rescale placement on %s", cancellation => {
    let latest = structuredClone(timersOverlayModuleDefinition.defaultConfig);
    const original = structuredClone(latest.profiles.landscape.desktopPlacement);
    function Owner() {
      const [value, setValue] = useState(latest);
      return <TimerStackEditor assetApi={createTestMediaPreviewApi()} value={value} onChange={next => { latest = next; setValue(next); }} />;
    }
    render(<Owner />);
    const handle = screen.getByRole("button", { name: "Rescale timer region" });
    handle.setPointerCapture = vi.fn();
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, clientX: 110, clientY: 100 }));
    expect(latest.profiles.landscape.desktopPlacement.scale).toBeGreaterThan(original.scale);
    if (cancellation === "Escape") fireEvent.keyDown(handle, { key: "Escape" });
    else fireEvent.pointerCancel(handle);
    expect(latest.profiles.landscape.desktopPlacement).toEqual(original);
  });

  it("fills the available preview width while preserving the output profile scale", () => {
    vi.stubGlobal("ResizeObserver", PreviewResizeObserver);
    render(<TimerStackEditor assetApi={createTestMediaPreviewApi()} value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    const preview = screen.getByLabelText("landscape timer preview");
    act(() => resizeCallback?.([{ contentRect: { width: 900 } } as ResizeObserverEntry], {} as ResizeObserver));

    expect(preview).toHaveStyle({ width: "900px", height: "506.25px" });
    expect(preview.firstElementChild).toHaveStyle({ transform: "scale(0.46875)" });
  });

  it("loads saved timer icons through the authenticated asset API, then uses clocks only for examples", async () => {
    const createPreview = vi.fn(async (id: string) => previewDescriptor(id));
    const api = createTestMediaPreviewApi(createPreview);
    const release = vi.spyOn(api, "releasePreview");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "/storybook-assets/tiny-image.png"), revokeObjectURL });
    const saved: TimerDefinition = {
      id: "saved-mitts",
      label: "Saved oven mitt timer",
      durationMs: 45_000,
      iconAssetId: "saved-icon",
      startAudioAssetId: null,
      endAudioAssetId: null,
      outputs: { browserSource: true, deviceRouteIds: [] },
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z"
    };
    const definitionProps = { definitions: [saved] };
    const view = render(<TimerStackEditor assetApi={api} {...definitionProps} value={structuredClone(timersOverlayModuleDefinition.defaultConfig)} onChange={() => {}} />);

    const canvas = within(screen.getByLabelText("landscape timer preview"));
    const cards = canvas.getAllByRole("listitem");
    expect(cards[0]).toHaveTextContent("Saved oven mitt timer");
    expect(await canvas.findByRole("img", { name: "Saved oven mitt timer icon" })).toHaveAttribute("src", "/storybook-assets/tiny-image.png");
    expect(createPreview).toHaveBeenCalledWith("saved-icon");
    expect(cards.some(card => card.textContent?.includes("Timer 1"))).toBe(true);
    expect(cards.some(card => card.textContent?.includes("deliberately long"))).toBe(true);
    expect(canvas.getAllByRole("img", { name: "Default timer icon" })).toHaveLength(cards.length - 1);
    expect(canvas.getByText("+2 more")).toBeVisible();
    view.unmount();
    expect(release).toHaveBeenCalledWith("preview-saved-icon");
  });
});
