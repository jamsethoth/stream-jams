import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDefaultTextWarp, insertTextWarpSplit, type AlertTextWarp } from "@stream-jams/core";
import { useState } from "react";
import { TextWarpEditor } from "./TextWarpEditor.js";

function WarpExample({ expanded = false }: { expanded?: boolean }) {
  const [warp, setWarp] = useState(() => expanded ? insertTextWarpSplit(createDefaultTextWarp(), "vertical", .25) : createDefaultTextWarp());
  const [preview, setPreview] = useState<AlertTextWarp | null>(null);
  const [editing, setEditing] = useState(true);
  return <div>
    <p>Drag a handle, use arrow keys, or enter exact coordinates. Add splits for more detail.</p>
    <div style={{ position: "relative", width: "min(100%, 700px)", height: 380, border: "1px solid var(--color-border)" }}>
      {editing ? <TextWarpEditor warp={preview ?? warp} onPreview={setPreview} onCommit={setWarp} onDone={() => setEditing(false)} /> : <button type="button" onClick={() => setEditing(true)}>Edit warp</button>}
    </div>
  </div>;
}
const meta = { tags: ["mantine-stage6c"], title: "Management/Alerts/Text warp editor", component: WarpExample, parameters: { layout: "padded" } } satisfies Meta<typeof WarpExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const IdentityGrid: Story = {};
export const AddedSplit: Story = { args: { expanded: true } };
