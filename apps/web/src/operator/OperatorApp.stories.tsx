import type { MergedOperationsSnapshot, OperationRow } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorApp } from "./OperatorApp.js";
import { PlaybackOperationsConflictError, type PlaybackApi } from "./playback-api.js";

const meta = {
  title: "Operator/Playback Console",
  component: OperatorApp,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof OperatorApp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { api: createApi(emptySnapshot()) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No playback is active.")).toBeVisible();
  }
};

export const SimultaneousCurrentInterleavedQueues: Story = {
  args: { api: createApi(activeSnapshot()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nowPlaying = await canvas.findByRole("heading", { name: "Now playing (2)" });
    await expect(nowPlaying).toBeVisible();
    await expect(nowPlaying.compareDocumentPosition(canvas.getByRole("heading", { name: "Module queues" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(canvas.getByText("Flash sweep")).toBeVisible();
    await expect(canvas.getByText("Cheer burst").closest("article")).toHaveTextContent("#2");
  }
};

export const ScreenEffectsPausedGlobalActive: Story = {
  args: { api: createApi({ ...activeSnapshot(), owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: true }] }) }
};

export const GlobalPausedModuleStillPaused: Story = {
  args: { api: createApi({ ...activeSnapshot(), paused: true, owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: true }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Resume all queues" }));
    await expect(canvas.getByText("Module paused")).toBeVisible();
  }
};

export const StaleSnapshot: Story = {
  args: { api: createStaleApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Large raid")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    await expect(await canvas.findByText("Playback state may be stale")).toBeVisible();
  }
};

export const InitialFailure: Story = {
  args: { api: createApi(emptySnapshot(), { getSnapshot: async () => { throw new ManagementHttpError("Playback service unavailable.", "PLAYBACK_READ_FAILED", "ref-story-load"); } }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Unable to load playback state")).toBeVisible();
  }
};

export const StaleSkipConflict: Story = {
  args: {
    api: createApi(activeSnapshot(), {
      skip: async () => {
        const refreshed = activeSnapshot();
        throw new PlaybackOperationsConflictError(
          "The current playback changed before it could be skipped.",
          {
            ...refreshed,
            revision: refreshed.revision + 1,
            current: refreshed.current.filter((item) => item.moduleId !== "screen-effects")
          }
        );
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Skip Flash sweep in Screen Effects" }));
    await expect(await canvas.findByText("Playback command failed")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Now playing (1)" })).toBeVisible();
    await expect(canvas.queryByText("Flash sweep")).not.toBeInTheDocument();
  }
};

export const KeyboardControls: Story = {
  args: { api: createApi(activeSnapshot()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Large raid");
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Back to management" })).toHaveFocus();
    const clear = canvas.getAllByRole("button", { name: "Clear pending" })[0]!;
    clear.focus();
    await userEvent.keyboard("{Enter}");
    await expect(within(document.body).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(clear).toHaveFocus();
  }
};

function createApi(value: MergedOperationsSnapshot, overrides: Partial<PlaybackApi> = {}): PlaybackApi {
  const same = async () => value;
  return {
    getSnapshot: same,
    pause: async () => ({ ...value, paused: true }),
    resume: async () => ({ ...value, paused: false }),
    mute: async () => ({ ...value, muted: true }),
    unmute: async () => ({ ...value, muted: false }),
    setDoNotDisturb: async (enabled) => ({ ...value, doNotDisturb: enabled }),
    skip: same,
    remove: same,
    replay: same,
    clear: same,
    setModulePaused: async (moduleId, paused) => ({ ...value, owners: value.owners.map((owner) => owner.moduleId === moduleId ? { ...owner, paused } : owner) }),
    ...overrides
  };
}

function createStaleApi(): PlaybackApi {
  const value = activeSnapshot();
  let calls = 0;
  return createApi(value, { getSnapshot: async () => { calls += 1; if (calls === 1) return value; throw new ManagementHttpError("Refresh failed.", "PLAYBACK_READ_FAILED", "ref-story-stale"); } });
}

function emptySnapshot(): MergedOperationsSnapshot {
  return {
    revision: 0,
    owners: [{ moduleId: "alerts", paused: false }, { moduleId: "screen-effects", paused: false }],
    current: [],
    queued: [],
    recent: [],
    paused: false,
    muted: false,
    doNotDisturb: false
  };
}

function activeSnapshot(): MergedOperationsSnapshot {
  return {
    ...emptySnapshot(),
    revision: 7,
    current: [row("alerts", "alert-current", "Large raid", "playing"), row("screen-effects", "effect-current", "Flash sweep", "playing")],
    queued: [row("screen-effects", "effect-next", "Cheer burst", "queued", 2), row("alerts", "alert-next", "Follow alert", "queued", 1)],
    recent: [row("alerts", "alert-recent", "Recent follow", "completed")]
  };
}

function row(moduleId: string, occurrenceId: string, name: string, status: OperationRow["status"], moduleQueuePosition: number | null = null): OperationRow {
  return {
    moduleId,
    occurrenceId,
    name,
    summary: "Viewer One",
    status,
    enqueuedAtMs: Date.parse("2026-09-13T12:00:00.000Z"),
    completedAtMs: status === "completed" ? Date.parse("2026-09-13T12:01:00.000Z") : null,
    sequence: 0,
    moduleQueuePosition
  };
}
