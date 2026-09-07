import type { AudioOutputStatus } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ManagementHttpError } from "../management-http-client.js";
import type { AudioApi } from "./audio-api.js";
import { AudioOutputsPanel } from "./AudioOutputsPanel.js";

const meta = {
  title: "Management/Settings/Audio outputs",
  component: AudioOutputsPanel,
  args: { audioApi: createAudioApi() },
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof AudioOutputsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadedRoutes: Story = {};

export const Empty: Story = {
  args: { audioApi: createAudioApi({ getStatus: fn(async () => status({ routes: [] })) }) }
};

export const Loading: Story = {
  args: { audioApi: createAudioApi({ getStatus: fn(() => new Promise<never>(() => undefined)) }) }
};

export const InitialLoadError: Story = {
  args: { audioApi: createAudioApi({ getStatus: fn(async () => { throw new Error("The local audio service is unavailable."); }) }) }
};

export const DesktopUnavailable: Story = {
  args: {
    audioApi: createAudioApi({
      getStatus: fn(async () => status({
        capability: { available: false, devices: [], reason: "desktop-unavailable", nextStep: "Open or restart the desktop app, then retry." },
        routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "endpoint-gone", deviceLabel: "USB headphones" }, state: "unavailable" }]
      }))
    })
  }
};

export const DeletionConflict: Story = {
  args: {
    audioApi: createAudioApi({
      deleteRoute: fn(async () => {
        throw new ManagementHttpError(
          "This route is still referenced by alerts. (AUDIO_ROUTE_REFERENCED)",
          "AUDIO_ROUTE_REFERENCED",
          null,
          "Remove the route from the listed alerts before deleting it.",
          [{ alertId: "alert-follow", name: "New follower" }, { alertId: "alert-raid", name: "Large raid" }]
        );
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Delete Headphones" }));
    await userEvent.click(within(document.body).getByRole("button", { name: "Delete output" }));
    await expect(await canvas.findByText("New follower")).toBeVisible();
    await expect(canvas.getByText("Large raid")).toBeVisible();
  }
};

export const TestCompletedWhileMuted: Story = {
  args: {
    audioApi: createAudioApi({
      getStatus: fn(async () => status({ muted: true })),
      testRoute: fn(async (routeId) => ({ routeId, muted: true }))
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Test Headphones" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("test completed while global alert audio was muted");
  }
};

function createAudioApi(overrides: Partial<AudioApi> = {}): AudioApi {
  return {
    getStatus: fn(async () => status()),
    createRoute: fn(async ({ name, deviceId }) => ({ id: "route-new", name, deviceId, deviceLabel: deviceId === null ? null : "Broadcast speakers" })),
    updateRoute: fn(async (routeId, input) => ({ id: routeId, name: input.name ?? "Headphones", deviceId: input.deviceId ?? "endpoint-a", deviceLabel: "USB headphones" })),
    deleteRoute: fn(async () => undefined),
    testRoute: fn(async (routeId) => ({ routeId, muted: false })),
    retry: fn(async () => undefined),
    ...overrides
  };
}

function status(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    capability: {
      available: true,
      devices: [
        { deviceId: "endpoint-a", label: "USB headphones" },
        { deviceId: "endpoint-b", label: "Broadcast speakers" }
      ],
      reason: null,
      nextStep: null
    },
    muted: false,
    routes: [
      { route: { id: "route-a", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headphones" }, state: "ready" },
      { route: { id: "route-b", name: "Private monitor", deviceId: "endpoint-gone", deviceLabel: "Wave Link SFX" }, state: "missing-device" },
      { route: { id: "route-c", name: "Studio speakers", deviceId: null, deviceLabel: null }, state: "unbound" }
    ],
    ...overrides
  };
}
