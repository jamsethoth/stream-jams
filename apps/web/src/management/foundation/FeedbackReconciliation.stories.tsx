import { Button } from "@mantine/core";
import type { RegisteredProviderView } from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryAssetApi, createStoryManagementApi } from "../../stories/mock-apis.js";
import { storyAssetLibraryItems } from "../../stories/story-fixtures.js";
import { AssetManager } from "../assets/AssetManager.js";
import { AlertSafetyPage } from "../alerts/safety/AlertSafetyPage.js";
import { EventSourcesPage } from "../providers/EventSourcesPage.js";
import { TtsProvidersPage } from "../providers/TtsProvidersPage.js";
import { DirtyNavigationProvider, useManagementNavigation } from "../navigation/dirty-navigation.js";

const failure = Object.assign(new Error("Disposable local storage is unavailable."), { referenceId: "ref-guard-story", nextStep: "Restore local storage and retry." });
const speaker: RegisteredProviderView = { id: "story-speaker", name: "Story Speaker.bot", kind: "speakerbot", capability: "tts", active: true, connectionState: "connected", intakeState: null, validatedAt: null, error: null, usedByAlertCount: 0 };
const backup = { ...speaker, id: "story-backup", name: "Backup Speaker.bot", active: false };
const bot: RegisteredProviderView = { ...speaker, id: "story-bot", name: "Story Streamer.bot", kind: "streamerbot", capability: "event-source", intakeState: "active" };

function NavigationControl() {
  const navigation = useManagementNavigation();
  return <><Button onClick={() => navigation.requestNavigation({ id: "settings" })}>Leave page</Button>{navigation.guard}</>;
}

function FeedbackReconciliation({ surface }: { readonly surface: "assets" | "tts" | "safety" | "subscriptions" }) {
  const api = createStoryManagementApi({
    listRegisteredProviders: async () => surface === "tts" ? [speaker, backup] : [bot],
    getProvider: async id => ({ provider: id === backup.id ? backup : surface === "tts" ? speaker : bot, configuration: {}, availableVoices: [], ttsSafety: null }),
    getStreamerBotSubscriptions: async () => ({ providerId: bot.id, available: true, sources: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }], selected: [], unavailableSelections: [], twitchBroadcasterId: null }),
    updateStreamerBotSubscriptions: async () => { throw failure; },
    updateTtsSafety: async () => { throw failure; },
    updateModerationSettings: async () => { throw failure; },
    updateAssetMetadata: async () => { throw failure; }
  });
  return <DirtyNavigationProvider>
    {surface === "assets" ? <AssetManager assetApi={createStoryAssetApi()} managementApi={api} /> : surface === "tts" ? <TtsProvidersPage managementApi={api} /> : surface === "safety" ? <AlertSafetyPage managementApi={api} /> : <EventSourcesPage managementApi={api} />}
    <NavigationControl />
  </DirtyNavigationProvider>;
}

const meta = {
  title: "Management/Foundation/Feedback reconciliation", component: FeedbackReconciliation,
  tags: ["mantine-stage7-feedback"],
  beforeEach: () => {
    const reportError = console.error;
    // The fixture deliberately exercises the existing diagnostic-recording owner.
    console.error = () => {};
    return () => { console.error = reportError; };
  }
} satisfies Meta<typeof FeedbackReconciliation>;
export default meta;
type Story = StoryObj<typeof meta>;

async function assertTypedGuard(dialog: HTMLElement) {
  const review = within(dialog);
  await expect(await review.findByRole("alert")).toHaveTextContent("ref-guard-story");
  await expect(review.getByRole("alert")).toHaveTextContent("Restore local storage and retry.");
  await expect(within(document.body).getAllByRole("alert", { hidden: true })).toHaveLength(1);
  await expect(review.getByRole("button", { name: "Dismiss error" })).toHaveClass("mantine-Button-root");
}

export const AssetSelectionFailure: Story = {
  args: { surface: "assets" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: storyAssetLibraryItems[0]!.displayName });
    await userEvent.type(canvas.getByLabelText("Display name"), " draft");
    await userEvent.click(canvas.getByRole("button", { name: "Short chime" }));
    const dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and continue" }));
    await assertTypedGuard(dialog);
    await expect(canvas.getByLabelText("Display name")).toHaveValue("Follower burst draft");
  }
};

export const TtsSelectionFailure: Story = {
  args: { surface: "tts" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const volume = await canvas.findByLabelText("Volume (0–1)");
    await userEvent.clear(volume); await userEvent.type(volume, "0.6");
    await userEvent.click(canvas.getByRole("button", { name: "Select Backup Speaker.bot" }));
    const dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and continue" }));
    await assertTypedGuard(dialog);
    await expect(volume).toHaveValue(0.6);
  }
};

export const SafetyNavigationFailure: Story = {
  args: { surface: "safety" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const maximum = await canvas.findByLabelText("Rendered text maximum length");
    await userEvent.clear(maximum); await userEvent.type(maximum, "300");
    await userEvent.click(canvas.getByRole("button", { name: "Leave page" }));
    const dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and leave" }));
    await assertTypedGuard(dialog);
    await expect(maximum).toHaveValue(300);
  }
};

export const SubscriptionConsentThenFailure: Story = {
  args: { surface: "subscriptions" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "SceneChanged" }));
    const consent = canvas.getByRole("checkbox", { name: /I understand saving changes/ });
    await userEvent.click(consent);
    await userEvent.click(canvas.getByRole("button", { name: "Save subscriptions" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("ref-guard-story");
    await userEvent.click(consent);
    await userEvent.click(canvas.getByRole("button", { name: "Leave page" }));
    let dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and leave" }));
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("Cancel to review and confirm");
    await expect(within(document.body).getAllByRole("alert", { hidden: true })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: /I understand saving changes/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Leave page" }));
    dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and leave" }));
    await assertTypedGuard(dialog);
    await expect(canvas.getByRole("checkbox", { name: "SceneChanged" })).toBeChecked();
  }
};
