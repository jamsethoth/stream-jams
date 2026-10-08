import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { dataPreviewFixture } from "../../management/data-overlays/data-preview-fixtures.js";
import { createDataPreviewStore, type DataPreviewScenario } from "../../management/data-overlays/data-preview-store.js";
import { DataOverlayCanvases } from "./DataOverlayCanvases.js";

function sample(scenario?: DataPreviewScenario) {
  const store = createDataPreviewStore(dataPreviewFixture());
  if (scenario) store.simulate(scenario, scenario === "long-text" ? "label" : "counter", "goal");
  return store.project({ runtimeId: "preview", output: "browser", targetProfileId: "landscape", nowEpochMs: 0,
    moduleEnabled: true, outputPaused: false, resolveAssetId: () => true });
}
const meta = {
  title: "Overlay/DataOverlayCanvases", component: DataOverlayCanvases, tags: ["data-overlays"],
  args: { projection: sample(), resolveAssetUrl: (): string | null => "/storybook-assets/tiny-alert.svg" },
  decorators: [(Story) => <div style={{ background: "#243140", width: 1920, height: 1080, position: "relative" }}><Story /></div>],
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof DataOverlayCanvases>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CommunityChallenge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Community challenge")).toBeVisible();
    await expect(canvas.getByText("40 / 100")).toBeVisible();
    const bar = canvasElement.querySelector<HTMLElement>(".data-overlay-progress-fill")!;
    const track = bar.parentElement!;
    await expect(Math.abs(bar.getBoundingClientRect().width / track.clientWidth - 0.4)).toBeLessThan(0.001);
  }
};
export const Zero: Story = { args: { projection: sample("zero") } };
export const Decrease: Story = { args: { projection: sample("decrease") } };
export const Completed: Story = { args: { projection: sample("completion") } };
export const OverTarget: Story = { args: { projection: sample("over-target") } };
export const LongPlainText: Story = { args: { projection: sample("long-text") },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("b")).toBeNull();
    await expect(within(canvasElement).getByText(/with literal markup/)).toBeVisible();
  } };
export const MissingSourceAndImage: Story = { args: { projection: sample("missing-source"), resolveAssetUrl: () => null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText("40 / 100")).toBeNull();
    await expect(canvasElement.querySelector("img")).toBeNull();
  } };
export const Empty: Story = { args: { projection: { runtimeId: "preview", revision: 0, canvases: [] } } };

const vertical = sample();
vertical.canvases[0]!.targetProfileId = "vertical";
const verticalBar = vertical.canvases[0]!.elements.find(element => element.kind === "progress")!;
if (verticalBar.kind === "progress") {
  verticalBar.orientation = "vertical";
  verticalBar.direction = "reverse";
  verticalBar.width = 80;
  verticalBar.height = 640;
}
export const VerticalReverseProgress: Story = { args: { projection: vertical },
  decorators: [(Story) => <div style={{ background: "#243140", width: 1080, height: 1920, position: "relative" }}><Story /></div>] };

const stacked = sample();
const decoration = { ...structuredClone(stacked.canvases[0]!), id: "decoration", order: 1 };
decoration.elements = [
  { id: "rectangle", kind: "rectangle", order: 0, x: 800, y: 80, width: 320, height: 160, color: "#ffbc44ff" },
  { id: "ellipse", kind: "ellipse", order: 1, x: 880, y: 120, width: 160, height: 160, color: "#ff6644ff" }
];
stacked.canvases.push(decoration);
export const TwoIndependentCanvases: Story = { args: { projection: stacked } };
