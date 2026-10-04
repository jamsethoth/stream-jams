import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDefaultMusicModuleConfig, projectMusicWidget, type MusicAppearance, type MusicSnapshot } from "@stream-jams/core";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { MusicLayoutEditor } from "./MusicLayoutEditor.js";

const now = 1_000_000;
const snapshot: MusicSnapshot = { providerId: "preview", generation: "example", revision: 1,
  track: { id: "song", title: "A longer title for arranging the broadcast preview", artists: ["First artist", "Second artist"], album: "Example album", artworkRef: null },
  playbackState: "playing", positionMs: 35_000, durationMs: 180_000, observedAtEpochMs: now, session: null };
const resolver = { resolveAsset: () => null, resolveArtwork: () => null };

function Example({ customCss = false }: { readonly customCss?: boolean }) {
  const [appearance, setAppearance] = useState<MusicAppearance>(() => createDefaultMusicModuleConfig().profiles.landscape.views.full);
  const config = createDefaultMusicModuleConfig();
  config.profiles.landscape.views.full = appearance;
  if (customCss) config.css = { source: ".sj-title { color: #FFFFFFFF; }", enabled: true, styleContractVersion: 1 };
  const projection = projectMusicWidget(snapshot, { state: "connected", stale: false, diagnosticReference: null }, config, "landscape", now, now);
  return <div style={{ maxWidth: 780 }}><MusicLayoutEditor appearance={appearance} onChange={setAppearance} projection={projection} resolveAsset={resolver} /></div>;
}

const meta = { title: "Management/Music component layout", component: MusicLayoutEditor, tags: ["music-editor-refinement"],
  args: { projection: null, appearance: createDefaultMusicModuleConfig().profiles.landscape.views.full, resolveAsset: resolver, onChange: fn() },
  parameters: { layout: "padded" }
} satisfies Meta<typeof MusicLayoutEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AutomaticPreview: Story = { render: () => <Example /> };

export const EditNativeParts: Story = { render: () => <Example />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Edit component layout" }));
  await expect(canvas.getByRole("button", { name: "Move Title" })).toBeVisible();
  await expect(canvas.getByRole("spinbutton", { name: "Title X (px)" })).toHaveValue(182);
} };

export const CustomCssBlocksHandles: Story = { render: () => <Example customCss />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("button", { name: "Edit component layout" })).toBeDisabled();
  await expect(canvas.getByText(/Disable custom CSS to edit native component layout/u)).toBeVisible();
} };
