import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderManagement } from "../../test-support/render-management.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { DataCanvasEditor } from "./DataCanvasEditor.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";
import { createDataManagementFixture } from "./data-management-fixtures.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";

function setup(limit = false) {
  const state = dataPreviewFixture();
  const canvas = state.canvases[0]!;
  if (limit) canvas.elements = Array.from({ length: 100 }, (_, i) => ({ ...canvas.elements[0]!, id: `layer-${i}`, order: i }));
  const api = createDataManagementFixture(state);
  api.saveCanvas = vi.fn(api.saveCanvas);
  const onBack = vi.fn();
  const assetApi = createStoryAssetApi(); assetApi.listAssets = async () => [];
  renderManagement(<DirtyNavigationProvider><DataCanvasEditor state={state} canvas={canvas} api={api} assetApi={assetApi} managementApi={createStoryManagementApi()} onSaved={() => undefined} onBack={onBack} /></DirtyNavigationProvider>);
  return { state, api, onBack };
}
afterEach(cleanup);
describe("Data canvas authoring", () => {
  it("applies keyboard and numeric bounds, then persists only on explicit save", async () => {
    const { api } = setup(); const user = userEvent.setup();
    await user.click(screen.getByLabelText("Alignment snapping"));
    const move = screen.getAllByRole("group", { name: /Move text layer/u })[0]!;
    move.focus(); await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("x")).toHaveValue(41);
    await user.clear(screen.getByLabelText("x")); await user.type(screen.getByLabelText("x"), "9999");
    expect(Number((screen.getByLabelText("x") as HTMLInputElement).value)).toBeLessThanOrEqual(1280);
    expect(api.saveCanvas).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save canvas" }));
    await waitFor(() => expect(api.saveCanvas).toHaveBeenCalledTimes(1));
  });
  it("simulates completion in a separate sample and protects unsaved back navigation", async () => {
    const { state, api, onBack } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "completion" }));
    expect(state.values[0]!.content).toBe(40);
    expect(api.saveCanvas).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add rectangle" }));
    await user.click(screen.getByRole("button", { name: "Back to canvases" }));
    await screen.findByText("Unsaved canvas changes");
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onBack).not.toHaveBeenCalled();
  });
  it("rejects the 101st layer without mutating saved state", async () => {
    const { api } = setup(true); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add text" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 100 elements");
    expect(screen.getByText("100 / 100 elements")).toBeInTheDocument();
    expect(api.saveCanvas).not.toHaveBeenCalled();
  });
});
