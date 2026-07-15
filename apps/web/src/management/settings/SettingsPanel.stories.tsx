import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  createStoryManagementApi,
  storyBackupArchive,
  storyBackupPreflight
} from "../../stories/mock-apis.js";
import { SettingsPanel } from "./SettingsPanel.js";

const meta = {
  title: "Management/Settings/Backup and restore",
  component: SettingsPanel,
  args: { managementApi: createStoryManagementApi() },
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof SettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const ExportReady: Story = {
  args: {
    managementApi: createStoryManagementApi({ exportConfigurationBackup: fn(async () => storyBackupArchive()) })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Export backup" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Backup exported");
  }
};

export const RestoreValidation: Story = {
  args: {
    managementApi: createStoryManagementApi({
      preflightConfigurationRestore: async () => ({
        ...storyBackupPreflight(),
        state: "invalid",
        blockers: [problem("Backup asset checksum does not match", "Export a new backup and try again.")]
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(await canvas.findByLabelText("Backup file"), backupFile());
    await expect(await canvas.findByText("Backup asset checksum does not match")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Restore configuration" })).toBeDisabled();
  }
};

export const LiveBlockedRestore: Story = {
  args: {
    managementApi: createStoryManagementApi({
      preflightConfigurationRestore: async () => ({
        ...storyBackupPreflight(),
        state: "blocked-live",
        runtime: { intakeActive: true, playbackActive: true, queuedPlaybackCount: 2 },
        blockers: [problem("Restore is blocked while Stream Jams is live", "Stop event intake and wait for playback to finish.")]
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(await canvas.findByLabelText("Backup file"), backupFile());
    await expect(await canvas.findByText("Restore is blocked while Stream Jams is live")).toBeVisible();
  }
};

export const SafetyBackupFailure: Story = {
  args: {
    managementApi: createStoryManagementApi({
      restoreConfiguration: async () => {
        throw new Error("Safety backup could not be created. Check storage permissions and try again. (SAFETY_BACKUP_FAILED, ref_story_backup)");
      }
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(await canvas.findByLabelText("Backup file"), backupFile());
    await userEvent.type(await canvas.findByLabelText("Type RESTORE to confirm"), "RESTORE");
    await userEvent.click(canvas.getByRole("button", { name: "Restore configuration" }));
    await expect(await canvas.findByText("Configuration was not restored")).toBeVisible();
    await expect(canvas.getByText("ref_story_backup")).toBeVisible();
  }
};

export const RouteKeyWarning: Story = {
  args: {
    managementApi: createStoryManagementApi({
      restoreConfiguration: async () => ({
        state: "completed",
        safetyBackupPath: "C:/Users/James/.stream-jams/backups/pre-restore.streamjams-backup",
        restored: storyBackupPreflight().impact!,
        regeneratedOutputs: [{ label: "Landscape live", url: "http://127.0.0.1:39187/overlay/modules/alerts/live/new-key" }],
        reconnectProviders: ["Twitch"],
        warnings: [problem("Browser-source URLs changed", "Update every affected source in OBS before going live.")]
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(await canvas.findByLabelText("Backup file"), backupFile());
    await userEvent.type(await canvas.findByLabelText("Type RESTORE to confirm"), "RESTORE");
    await userEvent.click(canvas.getByRole("button", { name: "Restore configuration" }));
    await expect(await canvas.findByText("Update browser-source URLs")).toBeVisible();
    await expect(canvas.getByText("Reconnect Twitch")).toBeVisible();
  }
};

function backupFile(): File {
  return new File([JSON.stringify(storyBackupArchive())], "stream-jams.streamjams-backup", { type: "application/json" });
}

function problem(summary: string, nextStep: string) {
  return { summary, cause: null, nextStep, severity: "warning" as const, occurredAt: null, referenceId: null, correction: null };
}
