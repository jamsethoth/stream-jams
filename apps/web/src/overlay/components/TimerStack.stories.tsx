import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TimerStackProjection } from "@stream-jams/core";
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
  args: { resolveAssetUrl: () => "/storybook-assets/tiny-alert.svg" },
  decorators: [(Story) => <div style={{ background: "#243140", height: 1080, position: "relative", width: 1920 }}><Story /></div>],
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof TimerStack>;

export default meta;
type Story = StoryObj<typeof meta>;

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
    await expect(canvas.getByText("+2 more")).toBeVisible();
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
