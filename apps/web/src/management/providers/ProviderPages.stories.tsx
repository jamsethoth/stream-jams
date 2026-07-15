import type {
  ActionableManagementError,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import type { ManagementApi } from "../management-api.js";
import { EventSourcesPage } from "./EventSourcesPage.js";
import { TtsProvidersPage } from "./TtsProvidersPage.js";

const activeTwitch = provider("provider-twitch", "Main Twitch", "twitch", true, "connected", "active");
const inactiveStreamerBot = provider("provider-streamerbot", "Studio Streamer.bot", "streamerbot", false, "connected", "inactive");
const activationWarning: ActionableManagementError = {
  summary: "Active alerts use a different provider kind",
  cause: "Six active alerts currently use Main Twitch.",
  nextStep: "Confirm the switch, then review affected alerts before going live.",
  severity: "warning",
  occurredAt: "2026-07-15T05:00:00.000Z",
  referenceId: null,
  correction: { label: "Review active alerts", route: "/modules/alerts" }
};
const invalidValidation: ProviderValidationResult = {
  valid: false,
  connectionState: "error",
  intakeState: null,
  validatedAt: "2026-07-15T05:00:00.000Z",
  availableVoices: [],
  error: {
    summary: "Twitch validation failed",
    cause: "Twitch is not connected.",
    nextStep: "Connect Twitch, then retry validation.",
    severity: "error",
    occurredAt: "2026-07-15T05:00:00.000Z",
    referenceId: "ref-provider-story",
    correction: { label: "Open Diagnostics", route: "/diagnostics?reference=ref-provider-story" }
  }
};

const meta = {
  title: "Management/Providers",
  component: EventSourcesPage
} satisfies Meta<typeof EventSourcesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfiguredEventSources: Story = {
  args: { managementApi: providerApi([activeTwitch, inactiveStreamerBot]) }
};

export const ConfiguredTtsProvider: Story = {
  args: {
    managementApi: createStoryManagementApi({
      listRegisteredProviders: async (capability) => capability === "tts" ? [activeSpeakerBot] : [],
      getProvider: async () => speakerBotDetail,
      getTtsProviderSafetySettings: async () => speakerBotDetail.ttsSafety!,
      updateTtsSafety: async (_providerId, settings) => settings,
      testProviderVoice: async () => ({ delivered: true, error: null })
    })
  },
  render: (args) => <TtsProvidersPage {...args} />
};

export const ValidationFailure: Story = {
  args: {
    managementApi: providerApi([], {
      validateProvider: async () => invalidValidation
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Test connection" }));
    await canvas.findByText("Twitch validation failed");
  }
};

export const ActivationWarning: Story = {
  args: { managementApi: providerApi([activeTwitch, inactiveStreamerBot]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "View Studio Streamer.bot" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Set active" }));
    await canvas.findByRole("dialog", { name: "Set Studio Streamer.bot active?" });
  }
};

function provider(
  id: string,
  name: string,
  kind: "twitch" | "streamerbot",
  active: boolean,
  connectionState: RegisteredProviderView["connectionState"],
  intakeState: RegisteredProviderView["intakeState"]
): RegisteredProviderView {
  return {
    id,
    name,
    kind,
    capability: "event-source",
    active,
    connectionState,
    intakeState,
    validatedAt: "2026-07-15T05:00:00.000Z",
    error: null,
    usedByAlertCount: 6
  };
}

const activeSpeakerBot: RegisteredProviderView = {
  id: "provider-speakerbot",
  name: "Studio Speaker.bot",
  kind: "speakerbot",
  capability: "tts",
  active: true,
  connectionState: "connected",
  intakeState: null,
  validatedAt: "2026-07-15T05:00:00.000Z",
  error: null,
  usedByAlertCount: 3
};

const speakerBotDetail: RegisteredProviderDetail = {
  provider: activeSpeakerBot,
  configuration: { protocol: "ws", host: "127.0.0.1", port: 7680, endpoint: "/" },
  availableVoices: [{ id: "voice-default", label: "Default voice" }],
  ttsSafety: {
    defaultVoiceId: "voice-default",
    volume: 0.8,
    minimumRate: 0.5,
    maximumRate: 2,
    maximumTextLength: 240
  }
};

function providerApi(providers: readonly RegisteredProviderView[], overrides: Partial<ManagementApi> = {}) {
  return createStoryManagementApi({
    listRegisteredProviders: async (capability) => capability === "event-source" ? providers : [],
    getProvider: async (providerId) => detail(providers.find((candidate) => candidate.id === providerId) ?? activeTwitch),
    getProviderActivationImpact: async () => ({
      matchedAlertCount: 0,
      unmatchedAlertCount: 6,
      blockers: [],
      warnings: [activationWarning]
    }),
    ...overrides
  });
}

function detail(providerView: RegisteredProviderView): RegisteredProviderDetail {
  return {
    provider: providerView,
    configuration: providerView.kind === "streamerbot"
      ? { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" }
      : {},
    availableVoices: [],
    ttsSafety: null
  };
}
