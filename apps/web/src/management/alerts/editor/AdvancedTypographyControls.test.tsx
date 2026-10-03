import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { compatibilityAlertTextStyle, type AlertTextStyle, type AssetRecord } from "@stream-jams/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetApi } from "../../assets/asset-api.js";
import { AdvancedTypographyControls } from "./AdvancedTypographyControls.js";

afterEach(cleanup);
const font: AssetRecord = { id: "font-one", originalFileName: "sample.woff2", mediaType: "font", mimeType: "font/woff2", sizeBytes: 128, checksum: "storybook-checksum", storagePath: "storybook-font.woff2", durationMs: null };
function setup(importAsset = vi.fn<AssetApi["importAsset"]>().mockResolvedValue(font)) {
  const change = vi.fn(); const refresh = vi.fn(async () => {});
  const api: AssetApi = { importAsset, listAssets: vi.fn(), getAssetFile: vi.fn(), replaceAsset: vi.fn(), createPreview: vi.fn(), renewPreview: vi.fn(), releasePreview: vi.fn() };
  function Harness() {
    const [value, setValue] = useState<AlertTextStyle>({ ...compatibilityAlertTextStyle });
    return <AdvancedTypographyControls value={value} onChange={(next) => { change(next); setValue(next); }} assets={[]} assetApi={api} onAssetsChanged={refresh} editingWarp={false} onEditWarp={vi.fn()} />;
  }
  render(<Harness />);
  return { change, refresh, importAsset };
}
describe("AdvancedTypographyControls", () => {
  it("edits decoration, spacing and independent outline RGBA/thickness", async () => {
    const { change } = setup(); const user = userEvent.setup();
    await user.click(screen.getByLabelText("Italic"));
    await user.click(screen.getByLabelText("Underline"));
    fireEvent.change(screen.getByLabelText("Letter spacing"), { target: { value: "3.5" } });
    await user.click(screen.getByLabelText("Text outline"));
    fireEvent.change(screen.getByLabelText("Outline color color"), { target: { value: "#abcdef" } });
    fireEvent.change(screen.getByLabelText("Outline color opacity"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Outline thickness"), { target: { value: "8.5" } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ italic: true, underline: true, letterSpacingPx: 3.5, outline: { color: "#ABCDEF80", widthPx: 8.5 } }));
    await user.click(screen.getByLabelText("Text outline"));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ outline: null }));
  });
  it("selects an uploaded reusable font after refreshing the library", async () => {
    const { change, refresh, importAsset } = setup();
    const file = new File(["font"], "sample.woff2", { type: "font/woff2" });
    await userEvent.setup().upload(screen.getByLabelText("Upload reusable font"), file);
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ fontAssetId: font.id })));
    expect(importAsset).toHaveBeenCalledWith(file); expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("combobox", { name: "Uploaded font" })).toHaveValue(font.id);
  });
  it("reports rejected uploads and allows retry without changing saved typography", async () => {
    const importAsset = vi.fn<AssetApi["importAsset"]>().mockRejectedValueOnce(new Error("Invalid font. Choose another file.")).mockResolvedValueOnce(font);
    const { change } = setup(importAsset); const user = userEvent.setup();
    const file = new File(["bad"], "bad.ttf", { type: "font/ttf" });
    await user.upload(screen.getByLabelText("Upload reusable font"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid font. Choose another file.");
    expect(change).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText("Upload reusable font"), file);
    await waitFor(() => expect(change).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
