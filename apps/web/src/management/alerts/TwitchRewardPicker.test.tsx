import type {
  ChannelPointRewardSelection,
  TwitchCustomReward,
  TwitchCustomRewardCatalog
} from "@stream-jams/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementHttpError } from "../management-http-client.js";
import { TwitchRewardPicker } from "./TwitchRewardPicker.js";

afterEach(() => {
  cleanup();
});

describe("TwitchRewardPicker", () => {
  it("shows loading and preserves unavailable saved IDs before and after a failed request", async () => {
    const request = deferred<TwitchCustomRewardCatalog>();
    render(
      <TwitchRewardPicker
        loadRewards={() => request.promise}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-missing"] }}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading Twitch rewards");
    expect(screen.getByRole("checkbox", { name: /Unavailable reward.*reward-missing/u })).toBeChecked();

    request.reject(new Error("provider unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Twitch rewards could not be loaded");
    expect(screen.getByRole("checkbox", { name: /Unavailable reward.*reward-missing/u })).toBeChecked();
  });

  it("renders loaded reward metadata and every inactive state without provider images or URLs", async () => {
    const catalog = {
      rewards: [
        customReward("reward-hydrate", "Hydrate", { isUserInputRequired: true }),
        customReward("reward-disabled", "Disabled reward", { isEnabled: false }),
        customReward("reward-paused", "Paused reward", { isPaused: true }),
        customReward("reward-stock", "Stock reward", { isInStock: false, imageUrl: "https://example.invalid/reward.png" } as Partial<TwitchCustomReward>)
      ]
    };
    const { container } = render(
      <TwitchRewardPicker
        loadRewards={async () => catalog}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-hydrate"] }}
      />
    );

    expect(await screen.findByText("4 custom rewards loaded.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Hydrate/u })).toBeChecked();
    expect(screen.getByText("Requires user input")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getAllByText("500 points")).toHaveLength(4);
    expect(container.querySelector("img")).toBeNull();
    expect(container).not.toHaveTextContent("example.invalid");
  });

  it("supports ordered multi-selection, select-all snapshots, clearing, and catch-all mode", async () => {
    const user = userEvent.setup();
    render(
      <PickerHarness
        initialSelection={{ mode: "selected", rewardIds: ["reward-b"] }}
        loadRewards={async () => ({ rewards: [
          customReward("reward-a", "Hydrate"),
          customReward("reward-b", "Stretch")
        ] })}
      />
    );
    await screen.findByText("2 custom rewards loaded.");

    await user.click(screen.getByRole("checkbox", { name: /Hydrate/u }));
    expect(selectionOutput()).toEqual({ mode: "selected", rewardIds: ["reward-b", "reward-a"] });

    await user.click(screen.getByRole("checkbox", { name: /Stretch/u }));
    expect(selectionOutput()).toEqual({ mode: "selected", rewardIds: ["reward-a"] });

    await user.click(screen.getByRole("button", { name: "Select all currently listed" }));
    expect(selectionOutput()).toEqual({ mode: "selected", rewardIds: ["reward-a", "reward-b"] });

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(selectionOutput()).toEqual({ mode: "selected", rewardIds: [] });
    expect(screen.getByText("Select at least one reward before saving this alert.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Every custom reward, including future rewards" }));
    expect(selectionOutput()).toEqual({ mode: "all" });

    await user.click(screen.getByRole("radio", { name: "Selected rewards" }));
    expect(selectionOutput()).toEqual({ mode: "selected", rewardIds: [] });
  });

  it("refreshes current metadata and ignores stale request results", async () => {
    const user = userEvent.setup();
    const first = deferred<TwitchCustomRewardCatalog>();
    const second = deferred<TwitchCustomRewardCatalog>();
    const { rerender } = render(
      <TwitchRewardPicker
        loadRewards={() => first.promise}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );

    rerender(
      <TwitchRewardPicker
        loadRewards={() => second.promise}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );
    second.resolve({ rewards: [customReward("reward-a", "Current title")] });
    expect(await screen.findByText("Current title")).toBeInTheDocument();
    first.resolve({ rewards: [customReward("reward-a", "Stale title")] });
    await waitFor(() => expect(screen.queryByText("Stale title")).not.toBeInTheDocument());

    const refreshLoad = vi.fn()
      .mockResolvedValueOnce({ rewards: [customReward("reward-a", "Current title")] })
      .mockResolvedValueOnce({ rewards: [customReward("reward-a", "Refreshed title")] });
    rerender(
      <TwitchRewardPicker
        loadRewards={refreshLoad}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Refresh rewards" }));
    expect(await screen.findByText("Refreshed title")).toBeInTheDocument();
    expect(refreshLoad).toHaveBeenCalledTimes(2);
  });

  it("shows a successful empty catalog", async () => {
    render(
      <TwitchRewardPicker
        loadRewards={async () => ({ rewards: [] })}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: [] }}
      />
    );

    expect(await screen.findByText("No custom rewards are available for this channel.")).toBeInTheDocument();
  });

  it.each([
    ["TWITCH_REWARD_CATALOG_DISCONNECTED", "Twitch is not connected", "Open Event sources"],
    ["TWITCH_REWARD_CATALOG_SCOPE_REQUIRED", "Twitch permission update required", "Open Event sources"],
    ["TWITCH_REWARD_CATALOG_RECONNECT_REQUIRED", "Twitch authorization expired", "Open Event sources"],
    ["TWITCH_REWARD_CATALOG_INELIGIBLE", "Custom rewards are unavailable for this channel", null],
    ["TWITCH_API_REQUEST_FAILED", "Twitch rewards could not be loaded", null]
  ])("maps %s to actionable catalog guidance", async (code, summary, linkLabel) => {
    render(
      <TwitchRewardPicker
        loadRewards={async () => { throw new ManagementHttpError("Request failed", code, "ref-rewards"); }}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: [] }}
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(summary);
    expect(alert).toHaveTextContent("ref-rewards");
    expect(screen.getByRole("button", { name: "Retry rewards" })).toBeEnabled();
    if (linkLabel === null) {
      expect(screen.queryByRole("link", { name: "Open Event sources" })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole("link", { name: linkLabel })).toHaveAttribute("href", "/manage/event-sources");
    }
  });

  it("retries after a failure and keeps explicit refresh available", async () => {
    const user = userEvent.setup();
    const loadRewards = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ rewards: [customReward("reward-a", "Hydrate")] });
    render(
      <TwitchRewardPicker
        loadRewards={loadRewards}
        onChange={vi.fn()}
        selection={{ mode: "selected", rewardIds: [] }}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Retry rewards" }));
    expect(await screen.findByText("Hydrate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh rewards" })).toBeEnabled();
    expect(loadRewards).toHaveBeenCalledTimes(2);
  });

  it("disables mode, selection, sample, and request controls", async () => {
    render(
      <TwitchRewardPicker
        disabled
        loadRewards={async () => ({ rewards: [customReward("reward-a", "Hydrate")] })}
        onChange={vi.fn()}
        onUseAsSample={vi.fn()}
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );
    await screen.findByText("Hydrate");

    for (const control of screen.getAllByRole("radio")) expect(control).toBeDisabled();
    for (const control of screen.getAllByRole("checkbox")) expect(control).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all currently listed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh rewards" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use Hydrate as sample" })).toBeDisabled();
  });

  it("defaults an outside session sample exactly once after settlement and preserves a matching sample", async () => {
    const onUseAsSample = vi.fn();
    const loadRewards = vi.fn(async () => ({ rewards: [customReward("reward-a", "Hydrate")] }));
    const props = {
      loadRewards,
      onChange: vi.fn(),
      onUseAsSample,
      sampleRewardId: "reward-outside",
      selection: { mode: "selected", rewardIds: ["reward-a"] } as ChannelPointRewardSelection
    };
    const { rerender } = render(<StrictMode><TwitchRewardPicker {...props} /></StrictMode>);

    await waitFor(() => expect(onUseAsSample).toHaveBeenCalledWith({ rewardId: "reward-a", rewardTitle: "Hydrate" }));
    rerender(<StrictMode><TwitchRewardPicker {...props} /></StrictMode>);
    await waitFor(() => expect(onUseAsSample).toHaveBeenCalledTimes(1));

    cleanup();
    const matchingSample = vi.fn();
    render(
      <TwitchRewardPicker
        loadRewards={loadRewards}
        onChange={vi.fn()}
        onUseAsSample={matchingSample}
        sampleRewardId="reward-a"
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );
    await screen.findByText("Hydrate");
    expect(matchingSample).not.toHaveBeenCalled();
  });

  it("emits stable current reward identity and unavailable fallback for sample actions", async () => {
    const user = userEvent.setup();
    const onUseAsSample = vi.fn();
    render(
      <TwitchRewardPicker
        loadRewards={async () => ({ rewards: [customReward("reward-a", "Hydrate")] })}
        onChange={vi.fn()}
        onUseAsSample={onUseAsSample}
        sampleRewardId="reward-a"
        selection={{ mode: "selected", rewardIds: ["reward-a", "reward-missing"] }}
      />
    );
    await screen.findByText("Hydrate");

    await user.click(screen.getByRole("button", { name: "Use Hydrate as sample" }));
    await user.click(screen.getByRole("button", { name: "Use Unavailable reward reward-missing as sample" }));

    expect(onUseAsSample).toHaveBeenNthCalledWith(1, { rewardId: "reward-a", rewardTitle: "Hydrate" });
    expect(onUseAsSample).toHaveBeenNthCalledWith(2, { rewardId: "reward-missing", rewardTitle: "Unavailable reward" });
  });

  it("shows overlap names as a non-blocking warning", async () => {
    render(
      <TwitchRewardPicker
        loadRewards={async () => ({ rewards: [customReward("reward-a", "Hydrate")] })}
        onChange={vi.fn()}
        overlapAlertNames={["General rewards", "Hydration layer"]}
        selection={{ mode: "selected", rewardIds: ["reward-a"] }}
      />
    );

    const warning = await screen.findByLabelText("Potential overlapping alerts");
    expect(warning).toHaveTextContent("General rewards");
    expect(warning).toHaveTextContent("Hydration layer");
    expect(screen.getByRole("checkbox", { name: /Hydrate/u })).toBeEnabled();
  });
});

function PickerHarness({
  initialSelection,
  loadRewards
}: {
  readonly initialSelection: ChannelPointRewardSelection;
  readonly loadRewards: () => Promise<TwitchCustomRewardCatalog>;
}) {
  const [selection, setSelection] = useState(initialSelection);
  return (
    <>
      <TwitchRewardPicker loadRewards={loadRewards} onChange={setSelection} selection={selection} />
      <output data-testid="selection">{JSON.stringify(selection)}</output>
    </>
  );
}

function selectionOutput(): ChannelPointRewardSelection {
  return JSON.parse(screen.getByTestId("selection").textContent ?? "null") as ChannelPointRewardSelection;
}

function customReward(
  id: string,
  title: string,
  overrides: Partial<TwitchCustomReward> = {}
): TwitchCustomReward {
  return {
    id,
    title,
    prompt: "",
    cost: 500,
    backgroundColor: "#00E5CB",
    isUserInputRequired: false,
    isEnabled: true,
    isPaused: false,
    isInStock: true,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
