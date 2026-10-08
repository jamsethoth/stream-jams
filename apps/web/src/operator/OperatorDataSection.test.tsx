import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { dataPreviewFixture } from "../management/data-overlays/data-preview-fixtures.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import { renderManagement } from "../test-support/render-management.js";
import { OperatorDataSection } from "./OperatorDataSection.js";
import type { OperatorDataApi } from "./data-api.js";
import { dataOverlayStateSchema } from "@stream-jams/core";
afterEach(() => { cleanup(); vi.useRealTimers(); });
function harness(overrides: Partial<OperatorDataApi> = {}) {
  const state = dataPreviewFixture();
  const api: OperatorDataApi = { getState: vi.fn(async () => state), setValue: vi.fn(async () => state), delta: vi.fn(async () => state), resetValue: vi.fn(async () => state), resetGroup: vi.fn(async () => state), restartGoal: vi.fn(async () => state), setVisibility: vi.fn(async () => state), ...overrides };
  renderManagement(<OperatorDataSection api={api} />);
  return { api, state };
}
it("shows pinned controls only and cancels reset without mutating", async () => {
  const user = userEvent.setup(); const { api } = harness();
  await screen.findByLabelText("Set Community challenge");
  expect(screen.queryByLabelText("Set Label")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset Community challenge" }));
  const dialog = await screen.findByRole("dialog", { name: "Reset Community challenge?" });
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api.resetValue).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Add one to Community challenge" }));
  expect(api.delta).toHaveBeenCalledWith("counter", "add");
});
it("retains a conflicting correction while refreshing actual content and revision", async () => {
  const user = userEvent.setup(); const state = dataPreviewFixture();
  const current = { ...state.values[0]!, content: 45, revision: 3 };
  const setValue = vi.fn().mockRejectedValueOnce(new ManagementHttpError("Value changed. Review the current content and retry.", "DATA_REVISION_CONFLICT", "ref-conflict", null, [], [], 409, null, [], current)).mockResolvedValue({ ...state, revision: 4, values: [{ ...current, content: 99, revision: 4 }, state.values[1]!] });
  harness({ setValue });
  const field = await screen.findByLabelText("Set Community challenge");
  await user.clear(field); await user.type(field, "99");
  await user.click(screen.getByRole("button", { name: "Set Community challenge" }));
  expect(await screen.findByText("Current: 45")).toBeVisible();
  expect(field).toHaveValue(99); expect(screen.getByRole("alert")).toHaveTextContent("ref-conflict");
  await user.click(screen.getByRole("button", { name: "Set Community challenge" }));
  expect(setValue).toHaveBeenLastCalledWith("counter", { content: 99, expectedRevision: 3 });
});
it("does not replace drafts or a committed command with a delayed poll", async () => {
  vi.useFakeTimers(); const state = dataPreviewFixture(); let resolvePoll!: (value: typeof state) => void;
  const getState = vi.fn().mockResolvedValueOnce(state).mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; })).mockResolvedValue(state);
  harness({ getState, delta: async () => dataOverlayStateSchema.parse({ ...state, revision: 2, values: [{ ...state.values[0]!, content: 42, revision: 2 }, state.values[1]!] }) });
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Set Community challenge"), { target: { value: "90" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  fireEvent.click(screen.getByRole("button", { name: "Add one to Community challenge" }));
  await act(async () => {});
  await act(async () => { resolvePoll(state); });
  expect(screen.getByText("Current: 42")).toBeVisible();
  expect(screen.getByLabelText("Set Community challenge")).toHaveValue(90);
});
it("confirms group resets, text updates, saved-goal restart and visibility independently", async () => {
  const user = userEvent.setup(); const state = dataPreviewFixture(); state.pinnedValueIds.push("label"); state.resetGroups.push({ id: "session", name: "Session" }); state.values[0]!.resetGroupId = "session";
  state.goals.push({ id: "next", name: "Next challenge", valueId: "counter", mode: "saved-baseline", baseline: 40, additionalAmount: 10 });
  const { api } = harness({ getState: async () => state, setValue: async () => state, resetGroup: vi.fn(async () => state), restartGoal: vi.fn(async () => state) }); await screen.findByLabelText("Set Label");
  await user.clear(screen.getByLabelText("Set Label")); await user.type(screen.getByLabelText("Set Label"), "<b>plain</b>");
  const setSpy = vi.spyOn(api, "setValue");
  await user.click(screen.getByRole("button", { name: "Set Label" })); expect(setSpy).toHaveBeenCalledWith("label", { content: "<b>plain</b>", expectedRevision: 0 });
  await user.click(screen.getByRole("button", { name: "Reset group Session" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm" })); await waitFor(() => expect(api.resetGroup).toHaveBeenCalledWith("session"));
  await user.click(screen.getByRole("button", { name: "Restart goal Next challenge" }));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm" })); expect(api.restartGoal).toHaveBeenCalledWith("next");
  await user.click(screen.getByRole("button", { name: "Hide Challenge display" })); expect(api.setVisibility).toHaveBeenCalledWith("canvas", false);
});
it("synchronously guards duplicate submissions and retains reset review on failure", async () => {
  let reject!: (cause: Error) => void;
  const resetValue = vi.fn(() => new Promise<ReturnType<typeof dataPreviewFixture>>((_resolve, fail) => { reject = fail; }));
  harness({ resetValue }); await screen.findByLabelText("Set Community challenge");
  fireEvent.click(screen.getByRole("button", { name: "Reset Community challenge" }));
  const confirm = within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm" });
  fireEvent.click(confirm); fireEvent.click(confirm); expect(resetValue).toHaveBeenCalledOnce();
  await act(async () => { reject(new Error("offline")); });
  expect(screen.getByRole("dialog")).toBeVisible(); expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("retry");
});
