import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { dataPreviewFixture } from "../management/data-overlays/data-preview-fixtures.js";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorDataSection } from "./OperatorDataSection.js";
import type { OperatorDataApi } from "./data-api.js";
import { ManagementPresentationProvider } from "../management/foundation/ManagementPresentationProvider.js";
function api(): OperatorDataApi {
  let state = dataPreviewFixture();
  state.pinnedValueIds.push("label"); state.resetGroups.push({ id: "session", name: "Session" }); state.values[0]!.resetGroupId = "session";
  return { getState: async () => structuredClone(state),
    setValue: async (id, input) => { state = { ...state, revision: state.revision + 1, values: state.values.map(value => value.id === id ? { ...value, content: input.content, revision: value.revision + 1 } as typeof value : value) }; return structuredClone(state); },
    delta: async (id, action) => { const value = state.values.find(value => value.id === id)!; if (value.kind === "integer") { value.content += action === "add" ? 1 : -1; value.revision++; state.revision++; } return structuredClone(state); },
    resetValue: async id => { const value = state.values.find(value => value.id === id)!; value.content = value.resetDefault; value.revision++; state.revision++; return structuredClone(state); },
    resetGroup: async () => structuredClone(state), restartGoal: async () => structuredClone(state),
    setVisibility: async (id, enabled) => { state.canvases.find(canvas => canvas.id === id)!.enabled = enabled; state.revision++; return structuredClone(state); }
  };
}
const meta = { title: "Operator/Data", component: OperatorDataSection, decorators: [Story => <ManagementPresentationProvider><Story /></ManagementPresentationProvider>], tags: ["data-overlays", "operator-compact", "mantine-foundation"], parameters: { layout: "padded" }, args: { api: api() } } satisfies Meta<typeof OperatorDataSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProviderReadOnly: Story = { tags: ["twitch-data-sources"], args: { api: { ...api(), getState: async () => {
  const state = dataPreviewFixture(); state.values[0]!.source = { provider: "twitch", kind: "follower-total", broadcasterId: "123" }; state.pinnedValueIds.push("label"); return state;
} } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByText(/Twitch follower total/u)).toHaveTextContent("Read-only");
  await expect(canvas.queryByRole("button", { name: "Add one to Community challenge" })).toBeNull();
  await expect(canvas.queryByRole("button", { name: "Reset Community challenge" })).toBeNull();
  await expect(canvas.getByRole("textbox", { name: "Set Label" })).toBeEnabled();
} };
export const LiveControls: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByLabelText("Set Community challenge");
  await userEvent.click(canvas.getByRole("button", { name: "Add one to Community challenge" }));
  await expect(await canvas.findByText("Current: 41")).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Reset Community challenge" }));
  const dialog = within(document.body).getByRole("dialog", { name: "Reset Community challenge?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await expect(canvas.getByText("Current: 41")).toBeVisible();
} };
export const Empty: Story = { args: { api: { ...api(), getState: async () => ({ revision: 0, values: [], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [] }) } } };
export const Loading: Story = { args: { api: { ...api(), getState: () => new Promise(() => {}) } } };
export const Unavailable: Story = { args: { api: { ...api(), getState: async () => { throw new Error("offline"); } } } };
export const RetainedConflict: Story = { args: { api: { ...api(), setValue: async () => { throw new ManagementHttpError("Value changed. Review current content and retry.", "DATA_REVISION_CONFLICT", "fixture-reference", null, [], [], 409, null, [], { ...dataPreviewFixture().values[0], content: 45, revision: 3 }); } } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); const field = await canvas.findByLabelText("Set Community challenge");
  await userEvent.clear(field); await userEvent.type(field, "99"); await userEvent.click(canvas.getByRole("button", { name: "Set Community challenge" }));
  await expect(await canvas.findByText("Current: 45")).toBeVisible(); await expect(field).toHaveValue(99);
} };
