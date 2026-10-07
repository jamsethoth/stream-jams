import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { RegisteredProviderView } from "@stream-jams/core";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import { MusicSourcesPage } from "./MusicSourcesPage.js";

const provider: RegisteredProviderView = { id: "provider-story", name: "Studio Pear", kind: "pear-desktop", capability: "music-source", active: true, connectionState: "connected", intakeState: null, validatedAt: "2026-10-04T12:00:00.000Z", error: null, usedByAlertCount: 0 };
const baseStatus = { enabled: true, selectedProviderId: provider.id, status: { state: "connected" as const, stale: false, diagnosticReference: null }, missingAssetIds: { landscape: [], vertical: [] } };

const meta = { title: "Management/Music Sources", component: MusicSourcesPage, tags: ["music-task-12", "mantine-stage6a"], args: { api: createStoryManagementApi() } } satisfies Meta<typeof MusicSourcesPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { api: createStoryManagementApi() },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("No Music sources registered.")).toBeVisible(); }
};

export const Connected: Story = {
  args: { api: createStoryManagementApi({ listRegisteredProviders: async () => [provider], getMusicStatus: async () => baseStatus, getProvider: async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null }) }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole("button", { name: "Studio Pear" })).toBeVisible(); }
};

export const AuthorizationRequired: Story = {
  args: { api: createStoryManagementApi({ listRegisteredProviders: async () => [provider], getMusicStatus: async () => ({ ...baseStatus, status: { state: "auth-required", stale: false, diagnosticReference: "ref_story" } }), getProvider: async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null }) }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/Pear authorization is required/u)).toBeVisible(); }
};

export const Reconnecting: Story = {
  args: { api: createStoryManagementApi({ listRegisteredProviders: async () => [provider], getMusicStatus: async () => ({ ...baseStatus, status: { state: "reconnecting", stale: false, diagnosticReference: null } }), getProvider: async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null }) }) }
};

export const StaleStatus: Story = {
  args: { api: createStoryManagementApi({ listRegisteredProviders: async () => [provider], getMusicStatus: async () => ({ ...baseStatus, status: { state: "connected", stale: true, diagnosticReference: null } }), getProvider: async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null }) }) }
};

export const MissingAssets: Story = {
  args: { api: createStoryManagementApi({ listRegisteredProviders: async () => [provider], getMusicStatus: async () => ({ ...baseStatus, missingAssetIds: { landscape: ["missing-brand"], vertical: ["missing-font"] } }), getProvider: async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null }) }) }
};

export const PairApproved: Story = {
  args: { api: createStoryManagementApi({ beginMusicPairing: async () => ({ attemptId: "pair_story", status: "approved", expiresAt: "2026-10-04T12:00:00.000Z" }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add Pear Desktop" }));
    await userEvent.click(canvas.getByRole("button", { name: "Pair Pear Desktop" }));
    await expect(await canvas.findByText("Pear approval: approved")).toBeVisible();
  }
};

export const PairDenied: Story = {
  args: { api: createStoryManagementApi({ beginMusicPairing: async () => ({ attemptId: "pair_denied", status: "denied", expiresAt: "2026-10-04T12:00:00.000Z" }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add Pear Desktop" }));
    await userEvent.click(canvas.getByRole("button", { name: "Pair Pear Desktop" }));
    await expect(await canvas.findByText("Pear approval: denied")).toBeVisible();
  }
};

export const LoadError: Story = {
  args: { api: createStoryManagementApi({ getMusicStatus: async () => { throw new Error("Local service unavailable"); } }) },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Unable to load Music sources")).toBeVisible(); }
};
