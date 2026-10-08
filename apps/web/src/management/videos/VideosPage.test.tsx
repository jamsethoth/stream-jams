import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStoryAudioApi } from "../../stories/audio-fixtures.js";
import { createStaticVideosApi, queuedVideos } from "../../stories/video-queue-fixtures.js";
import { renderManagement } from "../../test-support/render-management.js";
import { ManagementHttpError } from "../management-http-client.js";
import { VideosPage } from "./VideosPage.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const rewards = { rewards: [
  { id: "reward-video", title: "Play my video", cost: 500, prompt: "", backgroundColor: "#9147FF", isEnabled: true, isPaused: false, isInStock: true, isUserInputRequired: true },
  { id: "reward-test", title: "Test video", cost: 1, prompt: "", backgroundColor: "#9147FF", isEnabled: true, isPaused: false, isInStock: true, isUserInputRequired: true }
] };
const managementApi = (load = async () => rewards) => ({ getTwitchCustomRewards: vi.fn(load) }) as unknown as Parameters<typeof VideosPage>[0]["managementApi"];

describe("VideosPage", () => {
  it("loads settings, outputs, the mirror status and the queue", async () => {
    renderManagement(<VideosPage api={createStaticVideosApi(queuedVideos())} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    expect(await screen.findByLabelText("Maximum length (seconds)")).toHaveValue(120);
    expect(screen.getByLabelText("Gap between videos (seconds)")).toHaveValue(3);
    expect(screen.getByRole("checkbox", { name: "Play video audio in the OBS Browser Source" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Stream mix" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Private headphones" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Let Streamer.bot start videos automatically/u })).toBeChecked();
    expect(within(screen.getByRole("list", { name: "Allowed hosts" })).getByText("videos.example.com")).toBeVisible();
    expect(await within(screen.getByRole("list", { name: "Mapped rewards" })).findByText("Play my video")).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("the desktop mirror arrives with the desktop player");
    expect(await screen.findByRole("article", { name: "Cat plays keyboard" })).toBeVisible();
  });

  it("validates limits locally and saves the edited configuration", async () => {
    const user = userEvent.setup();
    const api = createStaticVideosApi(queuedVideos());
    const save = vi.spyOn(api, "saveModuleConfig");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    const maxLength = await screen.findByLabelText("Maximum length (seconds)");
    await user.clear(maxLength); await user.type(maxLength, "2");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(maxLength).toHaveAccessibleDescription("Enter whole seconds from 5 to 14400.");
    expect(save).not.toHaveBeenCalled();
    await user.clear(maxLength); await user.type(maxLength, "300");
    await user.click(screen.getByRole("checkbox", { name: "Play video audio in the OBS Browser Source" }));
    await user.click(screen.getByRole("checkbox", { name: "Private headphones" }));
    await user.click(screen.getByRole("checkbox", { name: /Let Streamer.bot start videos automatically/u }));
    await user.type(screen.getByLabelText("Host name"), "Cdn.Example.org");
    await user.click(screen.getByRole("button", { name: "Add host" }));
    await user.selectOptions(await screen.findByLabelText("Reward"), "reward-test");
    await user.selectOptions(screen.getByLabelText("Queue"), "test");
    await user.click(screen.getByRole("button", { name: "Add reward" }));
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenCalledWith(true, {
      maxLengthSeconds: 300, gapSeconds: 3, allowedDirectHosts: ["videos.example.com", "cdn.example.org"], obsAudio: false,
      audioDeviceIds: ["stream", "private"], streamerBotAutoplay: false,
      rewardMappings: [{ rewardId: "reward-video", purpose: "live" }, { rewardId: "reward-test", purpose: "test" }]
    });
    expect(await screen.findByText("Videos settings saved. They apply to later requests and runs.")).toBeVisible();
  });

  it("rejects invalid hosts and shows a server save failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createStaticVideosApi(queuedVideos(), { saveModuleConfig: async () => { throw new ManagementHttpError("Invalid module config (OVERLAY_MODULE_CONFIG_INVALID, ref-1)", "OVERLAY_MODULE_CONFIG_INVALID", "ref-1"); } });
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    const host = await screen.findByLabelText("Host name");
    await user.type(host, "https://bad/path");
    await user.click(screen.getByRole("button", { name: "Add host" }));
    expect(host).toHaveAccessibleDescription("Enter a host name such as videos.example.com, without https:// or a path.");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(await screen.findByText("Videos settings could not be saved")).toBeVisible();
    expect(screen.getAllByText("ref-1").length).toBeGreaterThan(0);
  });

  it("falls back to a reward ID field when the Twitch catalog is unavailable", async () => {
    const user = userEvent.setup();
    const api = createStaticVideosApi(queuedVideos());
    const save = vi.spyOn(api, "saveModuleConfig");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi(async () => { throw new Error("Twitch is not connected."); })} />);
    expect(await screen.findByText(/Twitch rewards could not be loaded: Twitch is not connected./u)).toBeVisible();
    await user.type(screen.getByLabelText("Reward ID"), "manual-reward");
    await user.click(screen.getByRole("button", { name: "Add reward" }));
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(true, expect.objectContaining({ rewardMappings: [{ rewardId: "reward-video", purpose: "live" }, { rewardId: "manual-reward", purpose: "live" }] })));
  });

  it("toggles the module and creates a test Browser Source URL", async () => {
    const user = userEvent.setup();
    const api = createStaticVideosApi(queuedVideos());
    const setEnabled = vi.spyOn(api, "setModuleEnabled");
    const create = vi.spyOn(api, "createBrowserSource");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    await user.click(await screen.findByRole("button", { name: "Disable Videos module" }));
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Module disabled")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Expand browser sources" }));
    await user.click(screen.getByRole("button", { name: "Create URL" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ purpose: "test" }));
  });
});
