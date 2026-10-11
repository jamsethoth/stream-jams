import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectTimerStack, timersOverlayModuleDefinition, type TimerStackProjection } from "@stream-jams/core";
import { TimerStack } from "./TimerStack.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function stack(overrides: Partial<TimerStackProjection> = {}): TimerStackProjection {
  return {
    targetProfileId: "landscape",
    region: {
      layout: { x: 100, y: 120, width: 600, height: 300, zIndex: 4 },
      orientation: "vertical",
      maxVisible: 3
    },
    cards: [
      { definitionId: "running", generation: "g1", label: "Oven mitt challenge", iconAssetId: "mitts", status: "running", endsAtEpochMs: 62_000,
        slot: { x: 100, y: 120, width: 600, height: 100, zIndex: 4 } },
      { definitionId: "paused", generation: "g2", label: "Paused timer with a very long label that must truncate", iconAssetId: null, status: "paused", remainingMs: 90_000,
        slot: { x: 100, y: 220, width: 600, height: 100, zIndex: 4 } },
      { definitionId: "done", generation: "g3", label: "Complete", iconAssetId: null, status: "completed", remainingMs: 0, expiresAtEpochMs: 5_000,
        slot: { x: 100, y: 320, width: 600, height: 100, zIndex: 4 } }
    ],
    overflowCount: 2,
    ...overrides
  };
}

describe("TimerStack", () => {
  it("consumes cached intrinsic legacy countdown width without recognizing configuration in React", () => {
    const profile = timersOverlayModuleDefinition.defaultConfig.profiles.landscape;
    const projected = projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile, runs: [{ status: "paused", definitionId: "saved", generation: "same", remainingMs: 600000,
      snapshot: { id: "saved", label: "Saved", durationMs: 600000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } }] });
    const { rerender } = render(<TimerStack stack={projected} resolveAssetUrl={() => null} />);
    expect(screen.getByRole("listitem").style.getPropertyValue("--timer-value-max-width")).toBe("8ch");
    expect(screen.getByText("10:00")).toHaveStyle({ overflow: "visible" });
    rerender(<TimerStack stack={{ ...projected, cards: [{ ...projected.cards[0]!, status: "paused", remainingMs: Number.MAX_SAFE_INTEGER }] }} resolveAssetUrl={() => null} />);
    expect(screen.getByTestId("timer-value-saved").style.overflow).toBe("");
  });
  it("renders saved profile typography, background opacity, state accents and a fixed bounded badge", () => {
    const profile = timersOverlayModuleDefinition.defaultConfig.profiles.landscape;
    const appearance = { ...profile.appearance, backgroundColor: "#112233", backgroundOpacity: .4, labelFont: { ...profile.appearance.labelFont, color: "#AABBCC", fontWeight: 500 as const }, pausedAccent: "#123456" };
    const projected = projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile: { ...profile, appearance }, runs: [{ status: "paused", definitionId: "saved", generation: "same", remainingMs: 30000,
      snapshot: { id: "saved", label: "Saved", durationMs: 30000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } }], recipientKind: "browser" });
    render(<TimerStack stack={{ ...projected, overflowCount: 9_999_999 }} resolveAssetUrl={() => null} />);
    const card = screen.getByRole("listitem");
    expect(card.style.background).toBe("color-mix(in srgb, rgb(17, 34, 51) 40%, transparent)");
    expect(card.style.borderColor).toBe("rgb(18, 52, 86)");
    expect(card.style.opacity).toBe("");
    expect(card.style.getPropertyValue("--timer-label-family")).toBe("Inter, ui-sans-serif, system-ui, sans-serif");
    expect(card.style.getPropertyValue("--timer-label-weight")).toBe("500");
    expect(screen.getByLabelText("9999999 more active timers")).toHaveTextContent("+9m more");
    expect(screen.getByText("+9m more")).toHaveStyle({ width: "152px" });
  });
  it("keeps concurrent runs of the same timer icon pinned independently", () => {
    const base = stack().cards[0]!;
    const value = stack({ cards: [{ ...base, generation: "old", iconVersion: "a".repeat(64) },
      { ...base, generation: "new", iconVersion: "b".repeat(64) }] });
    const { container } = render(<TimerStack stack={value} resolveAssetUrl={(id, version) => `/assets/${id}?version=${version}`} />);
    expect([...container.querySelectorAll("img")].map(element => element.getAttribute("src")))
      .toEqual([`/assets/mitts?version=${"a".repeat(64)}`, `/assets/mitts?version=${"b".repeat(64)}`]);
  });
  it.each(["vertical", "horizontal"] as const)("reserves stable %s overflow clearance at the profile edge", orientation => {
    const region = { layout: { x: 1320, y: 780, width: 600, height: 300, zIndex: 4 }, orientation, maxVisible: 3 };
    const edge = stack({ region, cards: stack().cards.map((card, index) => ({ ...card, slot: {
      x: 1320 + (orientation === "horizontal" ? index * 200 : 0),
      y: 780 + (orientation === "vertical" ? index * 100 : 0),
      width: orientation === "vertical" ? 600 : 200,
      height: orientation === "vertical" ? 100 : 300, zIndex: 4
    } })) });
    const { container, rerender } = render(<TimerStack stack={edge} resolveAssetUrl={() => null} />);
    const wrapper = container.querySelector<HTMLElement>(".timer-stack")!;
    const scale = Number(wrapper.style.transform.slice(6, -1));
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
    const transform = wrapper.style.transform;
    const firstSlotStyle = screen.getAllByRole("listitem")[0]!.getAttribute("style");
    rerender(<TimerStack stack={{ ...edge, cards: edge.cards.slice(0, 1), overflowCount: 0 }} resolveAssetUrl={() => null} />);
    expect(wrapper.style.transform).toBe(transform);
    expect(screen.getByRole("listitem").getAttribute("style")).toBe(firstSlotStyle);
  });
  it("derives running countdowns locally while paused and completed values stay frozen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    render(<TimerStack stack={stack()} resolveAssetUrl={id => `/assets/${id}`} />);
    expect(screen.getByTestId("timer-value-running")).toHaveTextContent("1:00");
    expect(screen.getByTestId("timer-value-paused")).toHaveTextContent("1:30");
    expect(screen.getByTestId("timer-value-done")).toHaveTextContent("0:00");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(screen.getByTestId("timer-value-running")).toHaveTextContent("0:59");
    expect(screen.getByTestId("timer-value-paused")).toHaveTextContent("1:30");
  });

  it("renders the received order, exact slots, long-label accessibility, and non-slot overflow badge", () => {
    render(<TimerStack stack={stack()} resolveAssetUrl={id => `/assets/${id}`} />);
    const cards = screen.getAllByRole("listitem");
    expect(cards.map(card => card.getAttribute("data-timer-id"))).toEqual(["running", "paused", "done"]);
    expect(cards[0]).toHaveStyle({ left: "100px", top: "120px", width: "600px", height: "100px" });
    expect(cards[1]).toHaveStyle({ left: "100px", top: "220px", width: "600px", height: "100px" });
    expect(screen.getByText("Paused timer with a very long label that must truncate")).toHaveAttribute(
      "title", "Paused timer with a very long label that must truncate"
    );
    expect(screen.getByText("+2 more")).toHaveClass("timer-stack__overflow");
    expect(screen.getByText("+2 more")).toHaveStyle({ left: "100px", top: "420px" });
    expect(cards).toHaveLength(3);
  });

  it("derives responsive card measurements from both slot width and height", () => {
    const responsive = stack({
      cards: [{
        definitionId: "responsive",
        generation: "g-responsive",
        label: "Responsive timer",
        iconAssetId: null,
        status: "paused",
        remainingMs: 30_000,
        slot: { x: 0, y: 0, width: 240, height: 60, zIndex: 1 }
      }],
      overflowCount: 0
    });
    const { rerender } = render(<TimerStack stack={responsive} resolveAssetUrl={() => ""} />);
    const card = screen.getByRole("listitem");
    expect(card.style.getPropertyValue("--timer-label-size")).toBe("14px");
    expect(card.style.getPropertyValue("--timer-value-size")).toBe("17px");

    rerender(<TimerStack stack={{ ...responsive, cards: [{ ...responsive.cards[0]!, slot: { x: 0, y: 0, width: 800, height: 160, zIndex: 1 } }] }} resolveAssetUrl={() => ""} />);
    expect(screen.getByRole("listitem").style.getPropertyValue("--timer-label-size")).toBe("38px");
    expect(screen.getByRole("listitem").style.getPropertyValue("--timer-value-size")).toBe("46px");
  });

  it("supports horizontal equal slots and hour formatting", () => {
    const horizontal = stack({
      region: { layout: { x: 0, y: 0, width: 600, height: 120, zIndex: 2 }, orientation: "horizontal", maxVisible: 2 },
      cards: [{
        definitionId: "hours", generation: "g", label: "Long timer", iconAssetId: null, status: "paused", remainingMs: 3_661_000,
        slot: { x: 0, y: 0, width: 300, height: 120, zIndex: 2 }
      }, {
        definitionId: "second", generation: "g2", label: "Second", iconAssetId: null, status: "paused", remainingMs: 30_000,
        slot: { x: 300, y: 0, width: 300, height: 120, zIndex: 2 }
      }],
      overflowCount: 0
    });
    render(<TimerStack stack={horizontal} resolveAssetUrl={() => ""} />);
    expect(screen.getByTestId("timer-value-hours")).toHaveTextContent("1:01:01");
    expect(screen.getByRole("list")).toHaveAttribute("data-orientation", "horizontal");
    expect(screen.queryByText(/more$/u)).toBeNull();
  });

  it("hides only an icon that fails to load", () => {
    render(<TimerStack stack={stack()} resolveAssetUrl={id => `/assets/${id}`} />);
    const image = screen.getByRole("img", { name: "Oven mitt challenge icon" });
    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "Oven mitt challenge icon" })).toBeNull();
    expect(screen.getByText("Oven mitt challenge")).toBeVisible();
  });

  it("uses a clock icon when a timer has no configured icon", () => {
    render(<TimerStack stack={stack()} resolveAssetUrl={id => `/assets/${id}`} />);
    expect(screen.getAllByRole("img", { name: "Default timer icon" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Oven mitt challenge icon" })).toHaveAttribute("src", "/assets/mitts");
  });

  it("clears its shared ticker when running cards disappear", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { rerender } = render(<TimerStack stack={stack()} resolveAssetUrl={() => "/asset"} />);
    rerender(<TimerStack stack={{ ...stack(), cards: stack().cards.filter(card => card.status !== "running") }} resolveAssetUrl={() => "/asset"} />);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
