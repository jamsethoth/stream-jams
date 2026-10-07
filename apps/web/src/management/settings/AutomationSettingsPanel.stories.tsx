import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AutomationSettingsPanel } from "./AutomationSettingsPanel.js";
import type { AutomationSettingsApi, AutomationPairingView, AutomationGrantView } from "./automation-api.js";
const pairing: AutomationPairingView = { id: "11111111-1111-4111-8111-111111111111", clientName: "Stream Deck", comparisonCode: "A1B2C3D4", scopes: ["timers:read", "timers:control"], expiresAt: "2026-10-04T00:05:00Z", approvalUrl: "/manage/settings#automation", status: "pending" };
const grant: AutomationGrantView = { id: "22222222-2222-4222-8222-222222222222", clientName: "Local deck", scopes: ["playback:read", "playback:mute:alerts"], createdAt: "2026-10-03T00:00:00Z", revokedAt: null };
function api(pairings: readonly AutomationPairingView[] = [], grants: readonly AutomationGrantView[] = []): AutomationSettingsApi {
  let pending = [...pairings]; let paired = [...grants];
  return { listPairings: fn(async () => pending), listGrants: fn(async () => paired), approve: fn(async id => { pending = pending.map(p => p.id === id ? { ...p, status: "approved" } : p); return pending.find(p => p.id === id)!; }), deny: fn(async id => { pending = pending.map(p => p.id === id ? { ...p, status: "denied" } : p); return pending.find(p => p.id === id)!; }), revoke: fn(async id => { paired = paired.map(g => g.id === id ? { ...g, revokedAt: "2026-10-03T00:01:00Z" } : g); return { revoked: true }; }) };
}
const meta = { title: "Management/Settings/Automation", component: AutomationSettingsPanel, tags: ["mantine-stage6b", "scoped-automation"], args: { api: api() }, parameters: { layout: "padded" } } satisfies Meta<typeof AutomationSettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { args: { api: { ...api(), listPairings: async () => new Promise(() => {}) } } };
export const ServiceUnavailable: Story = { args: { api: { ...api(), listPairings: async () => { throw new Error("The local service is unavailable. Check Diagnostics, then refresh."); } } } };
export const PendingApproval: Story = { args: { api: api([pairing]) }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(await canvas.findByText("A1B2C3D4")).toBeVisible(); await userEvent.click(canvas.getByRole("button", { name: "Approve Stream Deck" })); await expect(await canvas.findByText("Approved. Waiting for the client to finish pairing.")).toBeVisible(); } };
export const GrantedClients: Story = { args: { api: api([], [grant]) }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Revoke Local deck" })); await expect(await canvas.findByText("Access revoked")).toBeVisible(); } };

export const SubsetApproval: Story = {
  args: { api: api([pairing]) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "timers:control" }));
    await expect(canvas.getByRole("checkbox", { name: "timers:read" })).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Approve Stream Deck" }));
    await expect(args.api!.approve).toHaveBeenCalledWith(pairing.id, ["timers:read"]);
  }
};
export const NoPermissionsSelected: Story = {
  args: { api: api([pairing]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "timers:read" }));
    await expect(canvas.getByRole("checkbox", { name: "timers:control" })).not.toBeChecked();
    await expect(canvas.getByRole("button", { name: "Approve Stream Deck" })).toBeDisabled();
    await expect(canvas.getByText("Select at least one permission to approve.")).toBeVisible();
  }
};
export const ApproveDuringStalledRefresh: Story = {
  args: { api: api([pairing]) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("A1B2C3D4");
    const list = fn(args.api!.listPairings);
    list.mockImplementationOnce(() => new Promise(() => {}));
    args.api!.listPairings = list;
    await userEvent.click(canvas.getByRole("button", { name: "Refresh automation" }));
    await userEvent.click(canvas.getByRole("button", { name: "Approve Stream Deck" }));
    await expect(await canvas.findByText("Approved. Waiting for the client to finish pairing.")).toBeVisible();
  }
};
