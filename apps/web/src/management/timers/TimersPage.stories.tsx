import type { Meta, StoryObj } from "@storybook/react-vite";
import { timersOverlayModuleDefinition, type TimerDefinition, type TimerRunState } from "@stream-jams/core";
import type { AudioApi } from "../audio/audio-api.js";
import type { AssetApi } from "../assets/asset-api.js";
import type { AssetLibraryManagementApi } from "../assets/asset-library-utils.js";
import { TimersPage } from "./TimersPage.js";
import type { TimersApi } from "./timers-api.js";

const definition: TimerDefinition = { id: "mitts", label: "Wear oven mitts for the cat paws reward", durationMs: 60_000, iconAssetId: null,
  startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] },
  createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" };
const audioApi = { getStatus: async () => ({ capability: { available: true, devices: [], reason: null, nextStep: null }, muted: false, routes: [] }) } as unknown as AudioApi;
const buildApi = (states: readonly TimerRunState[]): TimersApi => ({
  list: async () => [definition], listStates: async () => states, create: async input => ({ ...definition, ...input }), update: async (_id, input) => ({ ...definition, ...input }),
  remove: async () => {}, command: async () => ({ changed: false, state: states[0] ?? null }),
  getModuleConfig: async () => ({ moduleId: "timers", enabled: true, config: structuredClone(timersOverlayModuleDefinition.defaultConfig), updatedAt: definition.updatedAt }),
  saveModuleConfig: async (enabled, config) => ({ moduleId: "timers", enabled, config, updatedAt: definition.updatedAt }),
  getAutomationCredential: async () => ({ configured: false, createdAt: null, rotatedAt: null }),
  rotateAutomationCredential: async () => ({ configured: true, createdAt: definition.createdAt, rotatedAt: null, token: `tmr_${"placeholder".repeat(4)}` }), revokeAutomationCredential: async () => {}
});
const meta = { title: "Management/Timers", component: TimersPage, parameters: { layout: "fullscreen" }, args: {
  assetApi: {} as AssetApi, audioApi, managementApi: {} as AssetLibraryManagementApi, api: buildApi([])
} } satisfies Meta<typeof TimersPage>;
export default meta; type Story = StoryObj<typeof meta>;
export const IdleInventory: Story = {};
export const Running: Story = { args: { api: buildApi([{ status: "running", definitionId: definition.id, generation: "run", snapshot: definition, startedAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 60_000 }]) } };
export const Paused: Story = { args: { api: buildApi([{ status: "paused", definitionId: definition.id, generation: "pause", snapshot: definition, remainingMs: 30_000 }]) } };
export const Completed: Story = { args: { api: buildApi([{ status: "completed", definitionId: definition.id, generation: "done", snapshot: definition, completedAtEpochMs: Date.now(), expiresAtEpochMs: Date.now() + 3000 }]) } };
