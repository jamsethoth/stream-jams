import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderManagement } from "../../test-support/render-management.js";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { DataOverlaysPage } from "./DataOverlaysPage.js";
import { createDataManagementFixture } from "./data-management-fixtures.js";
afterEach(cleanup);
describe("Data Overlays module", () => {
  it("requires explicit enablement save and confirms canvas deletion without deleting values", async () => {
    const api = createDataManagementFixture(); api.setEnabled = vi.fn(api.setEnabled); api.deleteCanvas = vi.fn(api.deleteCanvas);
    const user = userEvent.setup();
    renderManagement(<DataOverlaysPage api={api} assetApi={createStoryAssetApi()} managementApi={createStoryManagementApi()} />);
    await screen.findByRole("button", { name: "Edit Challenge display" });
    await user.click(screen.getByLabelText("Enable Data Overlays"));
    expect(api.setEnabled).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save enablement" }));
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole("button", { name: "Delete Challenge display" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteCanvas).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Challenge display" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete canvas" }));
    await screen.findByText("No canvases yet. Create one and add reusable elements.");
    expect((await api.getState()).values).toHaveLength(2);
  });
});
