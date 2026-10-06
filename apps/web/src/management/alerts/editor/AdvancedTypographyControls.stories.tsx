import type { Meta, StoryObj } from "@storybook/react-vite";
import { compatibilityAlertTextStyle, createDefaultTextWarp, type AlertTextStyle, type AssetLibraryItem, type AssetRecord } from "@stream-jams/core";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { AssetApi } from "../../assets/asset-api.js";
import { AdvancedTypographyControls } from "./AdvancedTypographyControls.js";

const font: AssetLibraryItem = { id: "storybook-font", displayName: "Reusable sample font", originalFileName: "sample.woff2", mediaType: "font", mimeType: "font/woff2", sizeBytes: 128, width: null, height: null, durationMs: null, health: "available", tags: [], createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", usage: { assetId: "storybook-font", totalUsageCount: 0, usages: [] } };
const unsupported = async (): Promise<never> => { throw new Error("This preview operation is unavailable in Storybook."); };
const fontRecord: AssetRecord = { id: font.id, originalFileName: font.originalFileName, mediaType: "font", mimeType: font.mimeType, sizeBytes: font.sizeBytes, checksum: "storybook-checksum", storagePath: "storybook-font.woff2", durationMs: null };
function TypographyExample({ populated = false, uploadFailure = false }: { populated?: boolean; uploadFailure?: boolean }) {
  const [value, setValue] = useState<AlertTextStyle>(() => ({ ...compatibilityAlertTextStyle, ...(populated ? { fontAssetId: font.id, italic: true, underline: true, letterSpacingPx: 2, outline: { color: "#12345680", widthPx: 4 }, warp: createDefaultTextWarp() } : {}) }));
  const [editing, setEditing] = useState(false);
  const [assets, setAssets] = useState<readonly AssetLibraryItem[]>(populated ? [font] : []);
  const api: AssetApi = { listAssets: async () => assets.map(() => fontRecord), importAsset: async () => { if (uploadFailure) throw new Error("Choose a valid TTF, OTF, WOFF or WOFF2 file."); setAssets([font]); return fontRecord; }, getAssetFile: unsupported, replaceAsset: unsupported, createPreview: unsupported, renewPreview: unsupported, releasePreview: async () => {} };
  return <div className="alert-editor-inspector" style={{ maxWidth: 420 }}>
    <AdvancedTypographyControls value={value} onChange={setValue} assets={assets} assetApi={api} onAssetsChanged={async () => {}} editingWarp={editing} onEditWarp={setEditing} />
  </div>;
}
const meta = { tags: ["mantine-stage6c"], title: "Management/Alerts/Advanced typography controls", component: TypographyExample, parameters: { layout: "padded" } } satisfies Meta<typeof TypographyExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LegacyDefaults: Story = {};
export const SavedTypography: Story = { args: { populated: true } };
export const UploadRecovery: Story = {
  args: { uploadFailure: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Upload reusable font"), new File(["invalid font"], "invalid.woff2", { type: "font/woff2" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Choose a valid TTF, OTF, WOFF or WOFF2 file.");
  }
};
