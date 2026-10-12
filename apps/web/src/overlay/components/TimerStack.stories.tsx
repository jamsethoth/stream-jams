import type { Meta, StoryObj } from "@storybook/react-vite";
import { projectTimerStack, timersOverlayModuleDefinition, upgradeTimersConfig, type TimerStackProjection } from "@stream-jams/core";
import { expect, within } from "storybook/test";
import { TimerStack } from "./TimerStack.js";

const landscapeRegion = {
  layout: { x: 1060, y: 80, width: 760, height: 520, zIndex: 4 },
  orientation: "vertical" as const,
  maxVisible: 4
};

const meta = {
  title: "Overlay/TimerStack",
  component: TimerStack,
  tags: ["timer-stack", "timer-appearance"],
  args: { resolveAssetUrl: () => "/storybook-assets/tiny-alert.svg" },
  decorators: [(Story) => <div style={{ background: "#243140", height: 1080, position: "relative", width: 1920 }}><Story /></div>],
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof TimerStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CrampedLegacyCountdowns: Story = {
  args: { stack: projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", recipientKind: "browser",
    profile: upgradeTimersConfig({ profiles: {
      landscape: { layout: { x: 1319, y: 779, width: 601, height: 301, zIndex: 0 }, orientation: "horizontal", maxVisible: 12 },
      vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 12 }
    } }).profiles.landscape,
    runs: [10000, 600000, 45296000, Number.MAX_SAFE_INTEGER].map((remainingMs, index) => ({ status: "paused" as const, definitionId: `cramped-${index}`, generation: `same-${index}`, remainingMs,
      snapshot: { id: `cramped-${index}`, label: "Cramped saved timer", durationMs: remainingMs, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } })) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("0:10")).toBeVisible();
    await expect(canvas.getByText("10:00")).toBeVisible();
    await expect(canvas.getByText("12:34:56")).toBeVisible();
    const extreme = canvas.getByTestId("timer-value-cramped-3");
    await expect(getComputedStyle(extreme).textOverflow).toBe("ellipsis");
    await expect(extreme.scrollWidth).toBeGreaterThan(extreme.clientWidth);
  }
};

export const SavedContentAppearance: Story = {
  args: { stack: projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", recipientKind: "browser", profile: timersOverlayModuleDefinition.defaultConfig.profiles.landscape,
    runs: Array.from({ length: 6 }, (_, index) => ({ status: "paused" as const, definitionId: `saved-${index}`, generation: `saved-${index}`, remainingMs: index === 5 ? Number.MAX_SAFE_INTEGER : (index + 1) * 15000,
      snapshot: { id: `saved-${index}`, label: index === 0 ? "A saved Timer with a long label bounded by its single-line card" : `Saved timer ${index + 1}`, durationMs: 60000,
        iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } })) }) },
  decorators: [(Story) => <div style={{ width: 736, height: 409, overflow: "hidden", position: "relative", background: "#243140" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(4);
    await expect(getComputedStyle(canvas.getByText("+2 more")).fontVariantNumeric).toBe("tabular-nums");
    await expect(canvas.getAllByRole("listitem")[0]).toHaveStyle({ left: "48px", top: "40px", width: "640px", height: "70px" });
  }
};

const reversedRuns = Array.from({ length: 6 }, (_, index) => ({ status: "paused" as const, definitionId: `reversed-${index}`, generation: `reversed-${index}`, remainingMs: (index + 1) * 15000,
  snapshot: { id: `reversed-${index}`, label: `Timer ${index + 1}`, durationMs: 60000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } }));
const reversedProfile = (orientation: "vertical" | "horizontal") => {
  const base = timersOverlayModuleDefinition.defaultConfig.profiles.landscape;
  return { ...base, appearance: { ...base.appearance, orientation, reverse: true, ...(orientation === "horizontal" ? { cardWidthPx: 300, maxVisible: 3 } : {}) } };
};

export const BottomToTop: Story = {
  args: { stack: projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", recipientKind: "browser", profile: reversedProfile("vertical"), runs: reversedRuns }) },
  decorators: [(Story) => <div style={{ width: 736, height: 409, overflow: "hidden", position: "relative", background: "#243140" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = canvas.getAllByRole("listitem");
    await expect(cards[0]).toHaveAccessibleName(/^Timer 1,/u);
    await expect(cards[0]).toHaveStyle({ top: "283px" });
    await expect(canvas.getByText("+2 more")).toHaveStyle({ top: "40px" });
  }
};

export const WithoutShadow: Story = {
  args: { stack: projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", recipientKind: "browser", runs: reversedRuns, profile: {
    ...timersOverlayModuleDefinition.defaultConfig.profiles.landscape,
    appearance: { ...timersOverlayModuleDefinition.defaultConfig.profiles.landscape.appearance, shadow: { offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: "#00000000" } } } }) },
  decorators: [(Story) => <div style={{ width: 640, height: 313, overflow: "hidden", position: "relative", background: "#243140" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getAllByRole("listitem")[0]!;
    await expect(card).toHaveStyle({ left: "0px", top: "0px" });
    await expect(getComputedStyle(card).boxShadow).toMatch(/^rgba\(0, 0, 0, 0\)/u);
  }
};

export const RightToLeft: Story = {
  args: { stack: projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", recipientKind: "browser", profile: reversedProfile("horizontal"), runs: reversedRuns }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = canvas.getAllByRole("listitem");
    await expect(cards[0]).toHaveAccessibleName(/^Timer 1,/u);
    await expect(Number.parseFloat(cards[0]!.style.left)).toBeGreaterThan(Number.parseFloat(cards[2]!.style.left));
    await expect(canvas.getByText("+3 more")).toHaveStyle({ left: "48px" });
  }
};

export const ConcurrentStatesAndOverflow: Story = {
  args: { stack: {
    targetProfileId: "landscape",
    region: landscapeRegion,
    cards: [
      card("complete", "Oven mitt challenge complete", "completed", { x: 1060, y: 80, width: 760, height: 130, zIndex: 4 }),
      card("running", "Cat paws reward", "running", { x: 1060, y: 210, width: 760, height: 130, zIndex: 4 }),
      card("soon", "Tea steeping", "running", { x: 1060, y: 340, width: 760, height: 130, zIndex: 4 }),
      card("paused", "Paused community challenge with an intentionally long name", "paused", { x: 1060, y: 470, width: 760, height: 130, zIndex: 4 })
    ],
    overflowCount: 2
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("list", { name: "Active timers" })).toBeVisible();
    const overflowBadge = canvas.getByText("+2 more");
    await expect(overflowBadge).toBeVisible();
    const timerLabel = canvas.getByTitle("Oven mitt challenge complete");
    await expect(getComputedStyle(overflowBadge).fontSize).toBe(getComputedStyle(timerLabel).fontSize);
    await expect(canvas.getByText("0:00")).toBeVisible();
    await expect(canvas.getAllByRole("img", { name: "Default timer icon" })).toHaveLength(3);
    await expect(canvas.getByRole("img", { name: "Cat paws reward icon" })).toBeVisible();
  }
};

export const HorizontalLandscape: Story = {
  args: { stack: {
    targetProfileId: "landscape",
    region: { layout: { x: 120, y: 760, width: 1680, height: 180, zIndex: 3 }, orientation: "horizontal", maxVisible: 3 },
    cards: [
      card("one", "First timer", "paused", { x: 120, y: 760, width: 560, height: 180, zIndex: 3 }),
      card("two", "Second timer", "paused", { x: 680, y: 760, width: 560, height: 180, zIndex: 3 }),
      card("three", "Third timer", "paused", { x: 1240, y: 760, width: 560, height: 180, zIndex: 3 })
    ],
    overflowCount: 0
  } }
};

export const BottomRightOverflow: Story = {
  args: { stack: {
    targetProfileId: "landscape",
    region: { layout: { x: 1320, y: 780, width: 600, height: 300, zIndex: 4 }, orientation: "vertical", maxVisible: 3 },
    cards: [0, 1, 2].map(index => card(`edge-${index}`, `Timer ${index + 1}`, "paused", {
      x: 1320, y: 780 + index * 100, width: 600, height: 100, zIndex: 4
    })), overflowCount: 2
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const last = canvas.getAllByRole("listitem").at(-1)!.getBoundingClientRect();
    const badge = canvas.getByText("+2 more").getBoundingClientRect();
    const root = canvasElement.querySelector(".timer-stack")!.parentElement!.getBoundingClientRect();
    await expect(badge.top).toBeGreaterThanOrEqual(last.bottom);
    await expect(badge.bottom).toBeLessThanOrEqual(root.bottom + 1);
    await expect(badge.right).toBeLessThanOrEqual(root.right + 1);
  }
};

export const RightEdgeHorizontalOverflow: Story = {
  args: { stack: {
    targetProfileId: "landscape",
    region: { layout: { x: 1320, y: 780, width: 600, height: 300, zIndex: 4 }, orientation: "horizontal", maxVisible: 3 },
    cards: [0, 1, 2].map(index => card(`edge-${index}`, `Timer ${index + 1}`, "paused", {
      x: 1320 + index * 200, y: 780, width: 200, height: 300, zIndex: 4
    })), overflowCount: 2
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const last = canvas.getAllByRole("listitem").at(-1)!.getBoundingClientRect();
    const badge = canvas.getByText("+2 more").getBoundingClientRect();
    const root = canvasElement.querySelector(".timer-stack")!.parentElement!.getBoundingClientRect();
    await expect(badge.left).toBeGreaterThanOrEqual(last.right);
    await expect(badge.bottom).toBeLessThanOrEqual(root.bottom + 1);
    await expect(badge.right).toBeLessThanOrEqual(root.right + 1);
  }
};

export const VerticalProfile: Story = {
  args: { stack: {
    targetProfileId: "vertical",
    region: { layout: { x: 80, y: 180, width: 920, height: 1100, zIndex: 2 }, orientation: "vertical", maxVisible: 2 },
    cards: [
      card("vertical-one", "Vertical running timer", "running", { x: 80, y: 180, width: 920, height: 550, zIndex: 2 }),
      card("vertical-two", "Vertical paused timer", "paused", { x: 80, y: 730, width: 920, height: 550, zIndex: 2 })
    ],
    overflowCount: 0
  } },
  decorators: [(Story) => <div style={{ background: "#243140", height: 1920, position: "relative", width: 1080 }}><Story /></div>]
};

export const MissingIconAndLongLabel: Story = {
  args: { stack: {
    targetProfileId: "landscape",
    region: landscapeRegion,
    cards: [{ ...card("missing", "A very long timer label that demonstrates the single-line ellipsis behavior", "paused", { x: 1060, y: 80, width: 760, height: 180, zIndex: 4 }), iconAssetId: "missing-icon" }],
    overflowCount: 0
  }, resolveAssetUrl: () => "/storybook-assets/does-not-exist.png" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTitle("A very long timer label that demonstrates the single-line ellipsis behavior")).toBeVisible();
    await expect(canvas.getByText("1:30")).toBeVisible();
  }
};

function card(
  definitionId: string,
  label: string,
  status: "running" | "paused" | "completed",
  slot: { x: number; y: number; width: number; height: number; zIndex: number }
): TimerStackProjection["cards"][number] {
  const common = { definitionId, generation: `generation-${definitionId}`, label, iconAssetId: definitionId === "running" ? "story-icon" : null, slot };
  if (status === "running") return { ...common, status, endsAtEpochMs: Date.now() + 300_000 };
  if (status === "paused") return { ...common, status, remainingMs: 90_000 };
  return { ...common, status, remainingMs: 0, expiresAtEpochMs: Date.now() + 3_000 };
}
