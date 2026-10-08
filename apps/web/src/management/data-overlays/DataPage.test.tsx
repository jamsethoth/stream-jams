import { createTwitchDataFixture } from "./twitch-data-source-fixtures.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderManagement } from "../../test-support/render-management.js";
import { DataPage } from "./DataPage.js";
import { createDataManagementFixture } from "./data-management-fixtures.js";
import { DirtyNavigationProvider } from "../navigation/dirty-navigation.js";
import { dataPreviewFixture } from "./data-preview-fixtures.js";

afterEach(cleanup);
describe("Data definitions", () => {
  it("renames source definitions without offering reset defaults or group membership", async () => {
    const state = dataPreviewFixture(); state.values[0]!.source = { provider: "twitch", kind: "follower-total", broadcasterId: "123" };
    const api = createDataManagementFixture(state); api.updateValue = vi.fn(api.updateValue);
    const user = userEvent.setup(); renderManagement(<DataPage twitchSourcesApi={createTwitchDataFixture()} api={api} />);
    await user.click(await screen.findByRole("button", { name: "Edit Community challenge" }));
    expect(screen.queryByLabelText("Reset default")).toBeNull(); expect(screen.queryByLabelText("Reset group")).toBeNull();
    await user.clear(screen.getByLabelText(/Name/u)); await user.type(screen.getByLabelText(/Name/u), "Followers");
    await user.click(screen.getByRole("button", { name: "Save definition" }));
    expect(api.updateValue).toHaveBeenCalledWith("counter", { name: "Followers" });
  });
  it("creates a definition without live-content controls and preserves immutable kind", async () => {
    const api = createDataManagementFixture();
    const user = userEvent.setup();
    renderManagement(<DirtyNavigationProvider><DataPage twitchSourcesApi={createTwitchDataFixture()} api={api} /></DirtyNavigationProvider>);
    await screen.findByRole("button", { name: "Edit Community challenge" });
    expect(screen.queryByRole("button", { name: "+1" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add value" }));
    await user.type(screen.getByLabelText(/Name/u), "Deaths");
    await user.click(screen.getByRole("button", { name: "Save definition" }));
    await screen.findByRole("button", { name: "Edit Deaths" });
    expect((await api.getState()).values.find(value => value.name === "Deaths")?.content).toBe(0);
    await user.click(screen.getByRole("button", { name: "Edit Deaths" }));
    expect(screen.getByLabelText("Kind")).toBeDisabled();
  });
  it("retains failed definition drafts and waits for an explicit deletion confirmation", async () => {
    const api = createDataManagementFixture();
    api.updateValue = vi.fn().mockRejectedValue(new Error("Duplicate name. Choose another name."));
    api.deleteValue = vi.fn().mockRejectedValue(new Error("Referenced by goal:goal"));
    const user = userEvent.setup();
    renderManagement(<DataPage twitchSourcesApi={createTwitchDataFixture()} api={api} />);
    await user.click(await screen.findByRole("button", { name: "Edit Community challenge" }));
    await user.clear(screen.getByLabelText(/Name/u)); await user.type(screen.getByLabelText(/Name/u), "New draft");
    await user.click(screen.getByRole("button", { name: "Save definition" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(/Name/u)).toHaveValue("New draft");
    await user.click(screen.getByRole("button", { name: "Discard definition" }));
    await user.click(screen.getByRole("button", { name: "Delete Community challenge" }));
    expect(api.deleteValue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteValue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Community challenge" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(api.deleteValue).toHaveBeenCalledWith("counter"));
    await screen.findByRole("alert");
  });
  it("keeps a cleared integer default as an invalid draft", async () => {
    const api = createDataManagementFixture(); api.updateValue = vi.fn(api.updateValue);
    const user = userEvent.setup(); renderManagement(<DataPage twitchSourcesApi={createTwitchDataFixture()} api={api} />);
    await user.click(await screen.findByRole("button", { name: "Edit Community challenge" }));
    await user.clear(screen.getByLabelText(/Reset default/u));
    await user.click(screen.getByRole("button", { name: "Save definition" }));
    expect(api.updateValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Reset default/u)).toHaveValue(null);
  });
  it("refreshes current content and references without replacing a definition draft", async () => {
    const state = dataPreviewFixture();
    const api = createDataManagementFixture(); api.getState = async () => structuredClone(state);
    const user = userEvent.setup(); renderManagement(<DataPage twitchSourcesApi={createTwitchDataFixture()} api={api} />);
    await user.click(await screen.findByRole("button", { name: "Edit Community challenge" }));
    await user.clear(screen.getByLabelText(/Name/u)); await user.type(screen.getByLabelText(/Name/u), "Retained draft");
    state.values[0]!.content = 55; state.revision = 1;
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("55")).toBeInTheDocument());
    expect(screen.getByLabelText(/Name/u)).toHaveValue("Retained draft");
    expect(screen.getByText(/Goal: Challenge goal/u)).toHaveTextContent("Canvas: Challenge display");
  });
});
