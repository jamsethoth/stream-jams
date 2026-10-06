import { renderManagement as render } from "../../test-support/render-management.js";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationSettingsPanel } from "./AutomationSettingsPanel.js";
import type { AutomationSettingsApi, AutomationPairingView, AutomationGrantView } from "./automation-api.js";
const pairing: AutomationPairingView = { id: "11111111-1111-4111-8111-111111111111", clientName: "Stream Deck", scopes: ["timers:read", "timers:control"], comparisonCode: "A1B2C3D4", expiresAt: "2026-10-04T00:05:00Z", approvalUrl: "/manage/settings#automation", status: "pending" };
const grant: AutomationGrantView = { id: "22222222-2222-4222-8222-222222222222", clientName: "Deck client", scopes: ["timers:read"], createdAt: "2026-10-04T00:00:00Z", revokedAt: null };
function api(): AutomationSettingsApi {
  let p = structuredClone(pairing); let g = structuredClone(grant);
  return { listPairings: vi.fn(async () => [p]), listGrants: vi.fn(async () => [g]), approve: vi.fn(async () => { p = { ...p, status: "approved" }; return p; }), deny: vi.fn(async () => { p = { ...p, status: "denied" }; return p; }), revoke: vi.fn(async () => { g = { ...g, revokedAt: "2026-10-04T00:00:01Z" }; return { revoked: true }; }) };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("AutomationSettingsPanel", () => {
  it("loads immediately under React strict effect replay", async () => {
    render(<StrictMode><AutomationSettingsPanel api={api()} /></StrictMode>);
    expect(await screen.findByText("A1B2C3D4")).toBeInTheDocument();
  });
  it("shows comparison and scopes, approves explicitly and revokes a paired client", async () => {
    const client = api(); const user = userEvent.setup(); render(<AutomationSettingsPanel api={client} />);
    expect(screen.getByText("Loading automation permissions...")).toBeInTheDocument();
    expect(await screen.findByText("A1B2C3D4")).toBeInTheDocument();
    expect(screen.getByText("timers:control")).toBeInTheDocument();
    expect(client.approve).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Approve Stream Deck" }));
    expect(client.approve).toHaveBeenCalledWith(pairing.id, pairing.scopes);
    expect(await screen.findByText("Approved. Waiting for the client to finish pairing.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke Deck client" }));
    expect(client.revoke).toHaveBeenCalledWith(grant.id);
    expect(await screen.findByText("Access revoked")).toBeInTheDocument();
  });
  it("approves only selected permissions and enforces read dependencies", async () => {
    const client = api(); const user = userEvent.setup();
    vi.mocked(client.listPairings).mockResolvedValue([{ ...pairing, scopes: ["timers:read", "timers:control", "playback:read", "playback:mute:alerts"] }]);
    render(<AutomationSettingsPanel api={client} />);
    await user.click(await screen.findByRole("checkbox", { name: "timers:read" }));
    expect(screen.getByRole("checkbox", { name: "timers:control" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "timers:control" }));
    expect(screen.getByRole("checkbox", { name: "timers:read" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "playback:read" }));
    expect(screen.getByRole("checkbox", { name: "playback:mute:alerts" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "timers:read" }));
    expect(screen.getByRole("button", { name: "Approve Stream Deck" })).toBeDisabled();
    expect(screen.getByText("Select at least one permission to approve.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "playback:mute:alerts" }));
    expect(screen.getByRole("checkbox", { name: "playback:read" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Approve Stream Deck" }));
    expect(client.approve).toHaveBeenCalledWith(pairing.id, ["playback:read", "playback:mute:alerts"]);
  });
  it("preserves a subset through polling and stale recovery without selecting added scopes", async () => {
    vi.useFakeTimers();
    const client = api(); render(<AutomationSettingsPanel api={client} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("checkbox", { name: "timers:control" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("checkbox", { name: "timers:control" })).not.toBeChecked();
    vi.mocked(client.listPairings).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh automation" })); });
    vi.mocked(client.listPairings).mockResolvedValue([{ ...pairing, scopes: [...pairing.scopes, "playback:read"] }]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh automation" })); });
    expect(screen.getByRole("checkbox", { name: "timers:control" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "playback:read" })).not.toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve Stream Deck" })); });
    expect(client.approve).toHaveBeenCalledWith(pairing.id, ["timers:read"]);
  });
  it("defaults new pairing and API identities to their requested scopes", async () => {
    const first = api(); const view = render(<AutomationSettingsPanel api={first} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "timers:control" }));
    vi.mocked(first.listPairings).mockResolvedValue([{ ...pairing, id: grant.id }]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh automation" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "timers:control" })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: "timers:control" }));
    const second = api(); vi.mocked(second.listPairings).mockResolvedValue([{ ...pairing, id: grant.id }]);
    view.rerender(<AutomationSettingsPanel api={second} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "timers:control" })).toBeChecked());
  });
  it.each(["approve", "deny", "revoke"] as const)("refreshes after %s without waiting for an outstanding poll", async action => {
    const client = api(); const user = userEvent.setup();
    render(<AutomationSettingsPanel api={client} />);
    await screen.findByText("A1B2C3D4");
    let release!: (value: readonly AutomationPairingView[]) => void;
    vi.mocked(client.listPairings).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await user.click(screen.getByRole("button", { name: "Refresh automation" }));
    const label = action === "approve" ? "Approve Stream Deck" : action === "deny" ? "Deny Stream Deck" : "Revoke Deck client";
    await user.click(screen.getByRole("button", { name: label }));
    const status = action === "approve" ? "Approved. Waiting for the client to finish pairing." : action === "deny" ? "Pairing denied." : "Access revoked";
    expect(await screen.findByText(status, { selector: "article p" })).toBeInTheDocument();
    expect(client.listPairings).toHaveBeenCalledTimes(3);
    await act(async () => { release([pairing]); });
    expect(screen.getByText(status, { selector: "article p" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("ignores an obsolete poll failure after an action refresh", async () => {
    const client = api(); const user = userEvent.setup();
    render(<AutomationSettingsPanel api={client} />); await screen.findByText("A1B2C3D4");
    let reject!: (reason: Error) => void;
    vi.mocked(client.listPairings).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await user.click(screen.getByRole("button", { name: "Refresh automation" }));
    await user.click(screen.getByRole("button", { name: "Approve Stream Deck" }));
    expect(await screen.findByText("Approved. Waiting for the client to finish pairing.")).toBeInTheDocument();
    await act(async () => { reject(new Error("Obsolete poll failed")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("denies and does not approve implicitly", async () => {
    const client = api(); render(<AutomationSettingsPanel api={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Deny Stream Deck" }));
    expect(client.deny).toHaveBeenCalledWith(pairing.id); expect(client.approve).not.toHaveBeenCalled();
    expect(await screen.findByText("Pairing denied.", { selector: "article p" })).toBeInTheDocument();
  });
  it("retains stale status on failure and offers explicit recovery", async () => {
    const client = api(); render(<AutomationSettingsPanel api={client} />);
    await screen.findByText("A1B2C3D4");
    vi.mocked(client.listPairings).mockRejectedValueOnce(new Error("Service unavailable"));
    await userEvent.click(screen.getByRole("button", { name: "Refresh automation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
    expect(screen.getByText(/Last known automation status is stale/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve Stream Deck" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Refresh automation" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
  it("shows actionable initial failure and empty state", async () => {
    const client = api(); vi.mocked(client.listPairings).mockRejectedValueOnce(new Error("Offline"));
    render(<AutomationSettingsPanel api={client} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh automation status");
    vi.mocked(client.listPairings).mockResolvedValue([]); vi.mocked(client.listGrants).mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Refresh automation" }));
    expect(await screen.findByText("No paired clients.")).toBeInTheDocument();
  });
  it("polls only while visible and removes its interval when unmounted", async () => {
    const client = api(); const view = render(<AutomationSettingsPanel api={client} />);
    await screen.findByText("A1B2C3D4"); vi.useFakeTimers();
    // Mount again after enabling fake timers so interval scheduling is controlled.
    view.unmount(); const next = render(<AutomationSettingsPanel api={client} />);
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.listPairings).toHaveBeenCalledTimes(3);
    next.unmount(); await vi.advanceTimersByTimeAsync(10000);
    expect(client.listPairings).toHaveBeenCalledTimes(3);
  });
});
