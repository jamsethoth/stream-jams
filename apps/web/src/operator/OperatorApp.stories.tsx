import type { PlaybackQueueItem, PlaybackQueueSnapshot } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ManagementHttpError } from "../management/management-http-client.js";
import { OperatorApp } from "./OperatorApp.js";
import type { PlaybackApi } from "./playback-api.js";

const meta = {
  title: "Operator/Playback Console",
  component: OperatorApp,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof OperatorApp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { api: createApi(idleSnapshot()) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No alert is playing.")).toBeVisible();
  }
};

export const ActiveQueue: Story = {
  args: { api: createApi(activeSnapshot()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Current Viewer")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Up next (2)" })).toBeVisible();
  }
};

export const Paused: Story = { args: { api: createApi({ ...activeSnapshot(), paused: true }) } };
export const Muted: Story = { args: { api: createApi({ ...activeSnapshot(), muted: true }) } };
export const DoNotDisturb: Story = { args: { api: createApi({ ...activeSnapshot(), doNotDisturb: true }) } };

export const StaleSnapshot: Story = {
  args: { api: createStaleApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Current Viewer")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    await expect(await canvas.findByText("Playback state may be stale")).toBeVisible();
  }
};

export const InitialFailure: Story = {
  args: {
    api: createApi(idleSnapshot(), {
      getSnapshot: async () => { throw new ManagementHttpError("Playback service unavailable.", "PLAYBACK_READ_FAILED", "ref-story-load"); }
    })
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Unable to load playback state")).toBeVisible();
  }
};

export const CommandFailure: Story = {
  args: {
    api: createApi(activeSnapshot(), {
      pause: async () => { throw new ManagementHttpError("Pause could not be saved.", "PLAYBACK_WRITE_FAILED", "ref-story-command"); }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Pause queue" }));
    await expect(await canvas.findByText("Playback command failed")).toBeVisible();
  }
};

function createApi(snapshot: PlaybackQueueSnapshot, overrides: Partial<PlaybackApi> = {}): PlaybackApi {
  return {
    getSnapshot: async () => snapshot,
    pause: async () => ({ ...snapshot, paused: true }),
    resume: async () => ({ ...snapshot, paused: false }),
    mute: async () => ({ ...snapshot, muted: true }),
    unmute: async () => ({ ...snapshot, muted: false }),
    setDoNotDisturb: async (enabled) => ({ ...snapshot, doNotDisturb: enabled }),
    skip: async () => ({ ...snapshot, current: snapshot.queued[0] ?? null, queued: snapshot.queued.slice(1) }),
    replay: async (itemId) => ({ ...snapshot, queued: [...snapshot.queued, ...snapshot.recent.filter((item) => item.id === itemId)] }),
    ...overrides
  };
}

function createStaleApi(): PlaybackApi {
  const state = activeSnapshot();
  let calls = 0;
  return createApi(state, {
    getSnapshot: async () => {
      calls += 1;
      if (calls === 1) return state;
      throw new ManagementHttpError("Refresh failed.", "PLAYBACK_READ_FAILED", "ref-story-stale");
    }
  });
}

function idleSnapshot(): PlaybackQueueSnapshot {
  return { current: null, queued: [], recent: [], paused: false, muted: false, doNotDisturb: false };
}

function activeSnapshot(): PlaybackQueueSnapshot {
  return {
    ...idleSnapshot(),
    current: item("current", "playing", "Current Viewer"),
    queued: [item("queued-1", "queued", "Next Viewer"), item("queued-2", "queued", "Later Viewer")],
    recent: [item("recent", "completed", "Recent Viewer")]
  };
}

function item(id: string, status: PlaybackQueueItem["status"], actor: string): PlaybackQueueItem {
  return {
    id,
    sourceEvent: {
      id: `event-${id}`,
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "twitch",
      occurredAt: "2026-07-21T12:00:00.000Z",
      actor: { id: null, displayName: actor },
      message: null,
      metadata: {},
      type: "follow",
      amount: null
    },
    alerts: [],
    priority: 10,
    status,
    enqueuedAt: "2026-07-21T12:00:01.000Z",
    startedAt: status === "queued" ? null : "2026-07-21T12:00:02.000Z",
    completedAt: status === "completed" ? "2026-07-21T12:00:05.000Z" : null
  };
}
