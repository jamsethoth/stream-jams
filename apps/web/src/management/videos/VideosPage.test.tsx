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
    expect(await screen.findByText(/the desktop app is playing videos/u)).toBeVisible();
    expect(screen.getByLabelText("Stream mix delay (ms)")).toHaveValue(120);
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
      audioDeviceIds: ["stream", "private"], audioDeviceDelaysMs: { stream: 120 }, streamerBotAutoplay: false,
      rewardMappings: [{ rewardId: "reward-video", purpose: "live" }, { rewardId: "reward-test", purpose: "test" }],
      layout: { x: 269, y: 140, width: 1382, height: 876 }
    });
    expect(await screen.findByText("Videos settings saved. They apply to later requests and runs.")).toBeVisible();
  });

  it("edits a per-output audio delay next to each selected output", async () => {
    const user = userEvent.setup();
    const api = createStaticVideosApi(queuedVideos());
    const save = vi.spyOn(api, "saveModuleConfig");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    const delay = await screen.findByLabelText("Stream mix delay (ms)");
    expect(screen.queryByLabelText("Private headphones delay (ms)")).toBeNull();
    await user.clear(delay); await user.type(delay, "501");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(delay).toHaveAccessibleDescription(expect.stringContaining("Enter whole milliseconds from 0 to 500."));
    expect(save).not.toHaveBeenCalled();
    await user.clear(delay); await user.type(delay, "2.5");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).not.toHaveBeenCalled();
    await user.clear(delay); await user.type(delay, "250");
    await user.click(screen.getByRole("checkbox", { name: "Private headphones" }));
    await user.type(screen.getByLabelText("Private headphones delay (ms)"), "0");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenLastCalledWith(true, expect.objectContaining({ audioDeviceIds: ["stream", "private"], audioDeviceDelaysMs: { stream: 250 } }));
    // Removing an output drops its delay.
    await user.click(screen.getByRole("checkbox", { name: "Stream mix" }));
    expect(screen.queryByLabelText("Stream mix delay (ms)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenLastCalledWith(true, expect.objectContaining({ audioDeviceIds: ["private"], audioDeviceDelaysMs: {} }));
  });

  it("places the video box in the preview and saves it with the settings", async () => {
    const user = userEvent.setup();
    const api = createStaticVideosApi(queuedVideos());
    const save = vi.spyOn(api, "saveModuleConfig");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    const placement = await screen.findByRole("region", { name: "Video placement" });
    expect(await within(placement).findByLabelText("Video X (px)")).toHaveValue(269);
    within(placement).getByRole("button", { name: "Move video box" }).focus();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}{ArrowUp}");
    const width = within(placement).getByLabelText("Video width (px)");
    await user.clear(width); await user.type(width, "960{Enter}");
    expect(within(placement).getByLabelText("Video X (px)")).toHaveValue(259);
    expect(screen.getByTestId("video-placement-preview")).toHaveStyle({ left: "259px", top: "139px", width: "960px", height: "876px" });
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenLastCalledWith(true, expect.objectContaining({ layout: { x: 259, y: 139, width: 960, height: 876 } }));
    await user.click(within(placement).getByRole("button", { name: "Reset to default placement" }));
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenLastCalledWith(true, expect.objectContaining({ layout: { x: 269, y: 140, width: 1382, height: 876 } }));
  });

  it("keeps an off-canvas saved placement from being saved again", async () => {
    const user = userEvent.setup();
    const base = createStaticVideosApi(queuedVideos());
    const state = await base.getModuleConfig();
    const api = createStaticVideosApi(queuedVideos(), { getModuleConfig: async () => ({ ...state, config: { ...state.config, layout: { x: 900, y: 0, width: 1382, height: 876 } } }) });
    const save = vi.spyOn(api, "saveModuleConfig");
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    await within(await screen.findByRole("region", { name: "Video placement" })).findByLabelText("Video X (px)");
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep the video box at least 240 x 180 px and inside the 1920 x 1080 canvas.");
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset to default placement" }));
    expect(screen.queryByText(/Keep the video box/u)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save Videos settings" }));
    expect(save).toHaveBeenCalledWith(true, expect.objectContaining({ layout: { x: 269, y: 140, width: 1382, height: 876 } }));
  });

  it("says when the desktop app is not running so browser sources play on their own", async () => {
    const api = createStaticVideosApi({ ...queuedVideos(), mirror: { available: false } });
    renderManagement(<VideosPage api={api} audioApi={createStoryAudioApi()} managementApi={managementApi()} />);
    expect(await screen.findByText(/desktop app not running/u)).toBeVisible();
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
