import { renderManagement as render } from "../../test-support/render-management.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventReplaySettings, replayAgeLabel, type EventReplaySettingsApi } from "./EventReplaySettings.js";

afterEach(() => { cleanup(); });

function api(replayAgeSeconds = 120): EventReplaySettingsApi {
  let current = { replayAgeSeconds };
  return {
    getEventBusSettings: vi.fn(async () => current),
    saveEventBusSettings: vi.fn(async (settings) => { current = settings; return current; })
  };
}

describe("EventReplaySettings", () => {
  it("loads the replay age, saves a change and hides Save until something changes", async () => {
    const client = api();
    const user = userEvent.setup();
    render(<EventReplaySettings api={client} />);
    const select = await screen.findByRole("combobox", { name: "Replay age" });
    expect(select).toHaveValue("120");
    expect(screen.getByRole("option", { name: "2 minutes (default)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save replay age" })).not.toBeInTheDocument();

    await user.selectOptions(select, "0");
    await user.click(screen.getByRole("button", { name: "Save replay age" }));
    expect(client.saveEventBusSettings).toHaveBeenCalledWith({ replayAgeSeconds: 0 });
    expect(await screen.findByText("Event replay age saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save replay age" })).not.toBeInTheDocument();
  });

  it("keeps a saved value outside the presets selectable", async () => {
    render(<EventReplaySettings api={api(45)} />);
    expect(await screen.findByRole("combobox", { name: "Replay age" })).toHaveValue("45");
    expect(screen.getByRole("option", { name: "45 seconds" })).toBeInTheDocument();
  });

  it("explains load and save failures and keeps the draft", async () => {
    const client = api();
    vi.mocked(client.getEventBusSettings).mockRejectedValueOnce(new Error("service down"));
    vi.mocked(client.saveEventBusSettings).mockRejectedValueOnce(new Error("EVENT_BUS_SETTINGS_INVALID"));
    const user = userEvent.setup();
    render(<EventReplaySettings api={client} />);
    expect(await screen.findByText("Event replay settings could not be loaded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Replay age" }), "1800");
    await user.click(screen.getByRole("button", { name: "Save replay age" }));
    expect(await screen.findByText("Event replay age was not saved")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Replay age" })).toHaveValue("1800");
  });

  it("labels replay ages in plain units", () => {
    expect([0, 30, 60, 90, 120, 1_800].map(replayAgeLabel)).toEqual([
      "Off: skip missed events", "30 seconds", "1 minute", "1 min 30 s", "2 minutes (default)", "30 minutes"
    ]);
  });
});
