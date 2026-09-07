import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AudioOutputStatus } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management-http-client.js";
import type { AudioApi } from "./audio-api.js";
import { AudioOutputsPanel } from "./AudioOutputsPanel.js";

describe("AudioOutputsPanel", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("creates and edits named routes only after explicit saves, without playing on selection", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AudioOutputsPanel audioApi={api} />);

    await user.type(await screen.findByLabelText("New output name"), "Stream headphones");
    expect(screen.getByRole("heading", { name: "Audio outputs" })).toBeVisible();
    await user.selectOptions(screen.getByLabelText("New output device"), "endpoint-b");
    expect(api.testRoute).not.toHaveBeenCalled();
    expect(api.createRoute).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create output" }));
    expect(api.createRoute).toHaveBeenCalledWith({ name: "Stream headphones", deviceId: "endpoint-b" });

    const route = await screen.findByRole("group", { name: "Headphones audio output" });
    await user.clear(within(route).getByLabelText("Output name"));
    await user.type(within(route).getByLabelText("Output name"), "Private mix");
    await user.selectOptions(within(route).getByLabelText("Output device"), "endpoint-b");
    expect(api.updateRoute).not.toHaveBeenCalled();
    expect(api.testRoute).not.toHaveBeenCalled();
    await user.click(within(route).getByRole("button", { name: "Save output" }));
    expect(api.updateRoute).toHaveBeenCalledWith("route-a", {
      name: "Private mix", deviceId: "endpoint-b", confirmLiveImpact: false
    });
  });

  it("keeps a route draft during polling and marks retained status stale after a refresh failure", async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const getStatus = vi.fn().mockResolvedValueOnce(status()).mockRejectedValueOnce(new Error("Device scan unavailable"));
    const api = createApi({ getStatus });
    render(<AudioOutputsPanel audioApi={api} />);

    const name = await screen.findByLabelText("Output name");
    await user.clear(name);
    await user.type(name, "Unsaved name");
    await screen.findByText("Ready");
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await screen.findByText("Audio output status is stale")).toBeVisible();
    expect(name).toHaveValue("Unsaved name");
  });

  it("confirms deletion and shows referenced alert names from a conflict", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteRoute: vi.fn(async () => {
        throw new ManagementHttpError(
          "This route is still referenced by alerts. (AUDIO_ROUTE_REFERENCED)",
          "AUDIO_ROUTE_REFERENCED",
          null,
          "Remove the route from the listed alerts before deleting it.",
          [{ alertId: "alert-a", name: "New follower" }, { alertId: "alert-b", name: "Big raid" }]
        );
      })
    });
    render(<AudioOutputsPanel audioApi={api} />);

    await user.click(await screen.findByRole("button", { name: "Delete Headphones" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/cannot be undone/i)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Delete output" }));
    expect(await screen.findByText("New follower")).toBeVisible();
    expect(screen.getByText("Big raid")).toBeVisible();
    expect(screen.getByText("Remove the route from the listed alerts before deleting it.")).toBeVisible();
  });

  it("requires affected-alert confirmation before rebinding a referenced route", async () => {
    const user = userEvent.setup();
    const updateRoute = vi.fn()
      .mockRejectedValueOnce(new ManagementHttpError(
        "Changing this binding affects alerts using the route. (AUDIO_ROUTE_CONFIRMATION_REQUIRED)",
        "AUDIO_ROUTE_CONFIRMATION_REQUIRED",
        null,
        "Review the listed alerts and confirm the binding change.",
        [{ alertId: "alert-a", name: "New follower" }]
      ))
      .mockResolvedValueOnce({ id: "route-a", name: "Headphones", deviceId: "endpoint-b", deviceLabel: "Stream speakers" });
    const api = createApi({ updateRoute });
    render(<AudioOutputsPanel audioApi={api} />);

    const route = await screen.findByRole("group", { name: "Headphones audio output" });
    await user.selectOptions(within(route).getByLabelText("Output device"), "endpoint-b");
    await user.click(within(route).getByRole("button", { name: "Save output" }));
    expect(await screen.findByText("Confirm affected alerts before rebinding")).toBeVisible();
    expect(screen.getByText("New follower")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Confirm binding change" }));
    expect(updateRoute).toHaveBeenLastCalledWith("route-a", {
      deviceId: "endpoint-b", confirmLiveImpact: true
    });
    expect(await screen.findByText("Headphones saved.")).toBeVisible();
  });

  it("omits an unchanged unavailable device binding from a name-only save", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getStatus: vi.fn(async () => status({
        capability: { available: false, devices: [], reason: "desktop-unavailable", nextStep: "Open the desktop app." },
        routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "endpoint-gone", deviceLabel: "Unplugged headset" }, state: "unavailable" }]
      }))
    });
    render(<AudioOutputsPanel audioApi={api} />);

    const name = await screen.findByLabelText("Output name");
    await user.clear(name);
    await user.type(name, "Renamed headphones");
    await user.click(screen.getByRole("button", { name: "Save output" }));

    expect(api.updateRoute).toHaveBeenCalledWith("route-a", {
      name: "Renamed headphones", confirmLiveImpact: false
    });
  });

  it("waits for a stale scan, refreshes again, and locks mutations during save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    let finishStalePoll: ((value: AudioOutputStatus) => void) | undefined;
    const getStatus = vi.fn()
      .mockResolvedValueOnce(status())
      .mockImplementationOnce(() => new Promise((resolve) => { finishStalePoll = resolve; }))
      .mockResolvedValueOnce(status({ routes: [{ route: { id: "route-a", name: "Private mix", deviceId: "endpoint-a", deviceLabel: "USB headphones" }, state: "ready" }] }));
    const api = createApi({ getStatus });
    render(<AudioOutputsPanel audioApi={api} />);
    const name = await screen.findByLabelText("Output name");
    await user.clear(name);
    await user.type(name, "Private mix");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(getStatus).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Save output" }));
    await waitFor(() => expect(api.updateRoute).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("New output name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Headphones" })).toBeDisabled();

    await act(async () => { finishStalePoll?.(status()); });
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(name).toHaveValue("Private mix"));
  });

  it("explains unavailable and missing devices, retries the player, and reports muted tests", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getStatus: vi.fn(async () => status({
        capability: { available: false, devices: [], reason: "desktop-unavailable", nextStep: "Open the desktop app and retry." },
        muted: true,
        routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "gone", deviceLabel: "Old headset" }, state: "unavailable" }]
      })),
      testRoute: vi.fn(async () => ({ routeId: "route-a", muted: true }))
    });
    render(<AudioOutputsPanel audioApi={api} />);

    expect(await screen.findByText("Open the desktop app and retry.")).toBeVisible();
    expect(await screen.findByText("Unavailable")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry audio player" }));
    expect(api.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Test Headphones" })).toBeDisabled();
  });

  it("announces that an explicit test was muted", async () => {
    const user = userEvent.setup();
    const api = createApi({ testRoute: vi.fn(async () => ({ routeId: "route-a", muted: true })) });
    render(<AudioOutputsPanel audioApi={api} />);

    await user.click(await screen.findByRole("button", { name: "Test Headphones" }));
    expect(await screen.findByRole("status")).toHaveTextContent("test completed while global alert audio was muted");
  });
});

function createApi(overrides: Partial<AudioApi> = {}): AudioApi {
  return {
    getStatus: vi.fn(async () => status()),
    createRoute: vi.fn(async ({ name, deviceId }) => ({ id: "route-new", name, deviceId, deviceLabel: deviceId === null ? null : "Stream speakers" })),
    updateRoute: vi.fn(async (id, input) => ({ id, name: input.name ?? "Headphones", deviceId: input.deviceId ?? "endpoint-a", deviceLabel: "USB headphones" })),
    deleteRoute: vi.fn(async () => undefined),
    testRoute: vi.fn(async (routeId) => ({ routeId, muted: false })),
    retry: vi.fn(async () => undefined),
    ...overrides
  };
}

function status(overrides: Partial<AudioOutputStatus> = {}): AudioOutputStatus {
  return {
    capability: { available: true, devices: [{ deviceId: "endpoint-a", label: "USB headphones" }, { deviceId: "endpoint-b", label: "Stream speakers" }], reason: null, nextStep: null },
    muted: false,
    routes: [{ route: { id: "route-a", name: "Headphones", deviceId: "endpoint-a", deviceLabel: "USB headphones" }, state: "ready" }],
    ...overrides
  };
}
