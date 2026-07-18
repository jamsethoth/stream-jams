import type {
  ActionableManagementError,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView
} from "@stream-jams/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createStoryManagementApi } from "../../stories/mock-apis.js";
import type { ManagementApi, TwitchConnectionStatusView } from "../management-api.js";
import { EventSourcesPage } from "./EventSourcesPage.js";
import { TtsProvidersPage } from "./TtsProvidersPage.js";

const activeTwitch = provider("provider-twitch", "Main Twitch", "twitch", true, "connected", "active", "healthy");
const inactiveStreamerBot = provider("provider-streamerbot", "Studio Streamer.bot", "streamerbot", false, "connected", "inactive", "not-running");
const connectedTwitchStatus: TwitchConnectionStatusView = {
  connected: true,
  account: {
    accountId: "provider-story",
    login: "storyaccount",
    displayName: "Story account",
    scopes: ["user:read:chat"],
    connectedAt: "2026-07-15T05:00:00.000Z",
    updatedAt: "2026-07-15T05:00:00.000Z"
  }
};
const activationWarning: ActionableManagementError = {
  summary: "Active alerts use a different provider kind",
  cause: "Six active alerts currently use Main Twitch.",
  nextStep: "Confirm the switch, then review affected alerts before going live.",
  severity: "warning",
  occurredAt: "2026-07-15T05:00:00.000Z",
  referenceId: null,
  correction: { label: "Review active alerts", route: "/manage/modules/alerts" }
};
const runtimeError: ActionableManagementError = {
  summary: "Streamer.bot event intake failed",
  cause: "The WebSocket connection closed.",
  nextStep: "Start Streamer.bot's WebSocket server, then reactivate this event source.",
  severity: "error",
  occurredAt: "2026-07-15T05:00:00.000Z",
  referenceId: "ref-runtime-story",
  correction: { label: "Open Diagnostics", route: "/manage/diagnostics?reference=ref-runtime-story" }
};
const twitchRuntimeError: ActionableManagementError = {
  ...runtimeError,
  summary: "Twitch EventSub status degraded",
  cause: "Twitch API returned HTTP 401.",
  nextStep: "Reconnect Twitch, then confirm live status returns to Healthy."
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
    correction: { label: "Open Diagnostics", route: "/manage/diagnostics?reference=ref-provider-story" }
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

export const EventSourceRuntimeFailure: Story = {
  args: {
    managementApi: providerApi([
      { ...activeTwitch, kind: "streamerbot", name: "Studio Streamer.bot", liveStatus: "error", error: runtimeError },
      inactiveStreamerBot
    ])
  }
};

export const TwitchRuntimeFailureRecovery: Story = {
  args: {
    managementApi: providerApi(
      [{ ...activeTwitch, liveStatus: "error", error: twitchRuntimeError }],
      { getTwitchStatus: async () => connectedTwitchStatus }
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Reconnect Twitch" }));
    await canvas.findByRole("dialog", { name: "Reconnect Main Twitch" });
  }
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

export const SpeakerBotNeedsVoiceAlias: Story = {
  args: {
    managementApi: createStoryManagementApi({
      listRegisteredProviders: async (capability) => capability === "tts" ? [activeSpeakerBot] : [],
      getProvider: async () => ({
        ...speakerBotDetail,
        availableVoices: [],
        ttsSafety: { ...speakerBotDetail.ttsSafety!, defaultVoiceId: null }
      }),
      getTtsProviderSafetySettings: async () => ({ ...speakerBotDetail.ttsSafety!, defaultVoiceId: null })
    })
  },
  render: (args) => <TtsProvidersPage {...args} />
};

export const ValidationFailure: Story = {
  args: {
    managementApi: providerApi([], {
      getTwitchStatus: async () => connectedTwitchStatus,
      validateProvider: async () => invalidValidation
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Test connection" }));
    await canvas.findByText("Twitch validation failed");
  }
};

export const TwitchConnectionRequired: Story = {
  args: { managementApi: providerApi([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await canvas.findByText("No Twitch account connected");
  }
};

export const TwitchConnectionLoading: Story = {
  args: {
    managementApi: providerApi([], {
      getTwitchStatus: () => new Promise<TwitchConnectionStatusView>(() => undefined)
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await canvas.findByText("Checking Twitch connection...");
  }
};

export const TwitchAuthorizationWaiting: Story = {
  args: { managementApi: providerApi([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Connect Twitch" }));
    await canvas.findByRole("link", { name: "Open Twitch" });
    await canvas.findByText("STORY-CODE");
  }
};

export const TwitchPopupFallback: Story = {
  args: { managementApi: providerApi([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const originalOpen = window.open;
    window.open = () => null;
    try {
      await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
      await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
      await userEvent.click(await canvas.findByRole("button", { name: "Connect Twitch" }));
      await canvas.findByRole("link", { name: "Open Twitch" });
      await canvas.findByText("STORY-CODE");
    } finally {
      window.open = originalOpen;
    }
  }
};

export const TwitchReview: Story = {
  args: {
    managementApi: providerApi([], {
      startTwitchAuth: async () => ({
        authorizationId: "story-connected",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "CONNECTED-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      }),
      pollTwitchAuth: async () => ({ status: "connected", connection: connectedTwitchStatus })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Connect Twitch" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_050));
    await canvas.findByText("Story account (@storyaccount)");
    await canvas.findByRole("button", { name: "Test connection" });
  }
};

export const TwitchAuthorizationDenied: Story = {
  args: {
    managementApi: providerApi([], {
      startTwitchAuth: async () => ({
        authorizationId: "story-denied",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "DENIED-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      }),
      pollTwitchAuth: async () => ({ status: "failed", code: "TWITCH_OAUTH_DENIED", message: "Twitch authorization was denied" })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Connect Twitch" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_050));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Twitch authorization was denied");
    await canvas.findByRole("button", { name: "Try again" });
  }
};

export const TwitchAuthorizationExpired: Story = {
  args: {
    managementApi: providerApi([], {
      startTwitchAuth: async () => ({
        authorizationId: "story-expired",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "EXPIRED-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      }),
      pollTwitchAuth: async () => ({ status: "failed", code: "TWITCH_OAUTH_EXPIRED", message: "Twitch authorization expired" })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Connect Twitch" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_050));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Twitch authorization expired");
    await canvas.findByRole("button", { name: "Try again" });
  }
};

export const RegistrationSuccess: Story = {
  args: {
    managementApi: providerApi([activeTwitch], {
      getTwitchStatus: async () => connectedTwitchStatus,
      registerProvider: async () => ({
        status: "registered",
        provider: detail(activeTwitch),
        validation: {
          valid: true,
          connectionState: "connected",
          intakeState: "active",
          validatedAt: "2026-07-15T05:00:00.000Z",
          availableVoices: [],
          error: null
        }
      })
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Add event source" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Test connection" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Register event source" }));
    await canvas.findByText("Main Twitch registered and active.");
  }
};

export const ActivationWarning: Story = {
  args: { managementApi: providerApi([activeTwitch, inactiveStreamerBot]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Activate Studio Streamer.bot" }));
    await canvas.findByRole("dialog", { name: "Activate Studio Streamer.bot?" });
  }
};

export const DeactivationWarning: Story = {
  args: { managementApi: providerApi([activeTwitch, inactiveStreamerBot]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Deactivate Main Twitch" }));
    await canvas.findByRole("dialog", { name: "Deactivate Main Twitch?" });
  }
};

function provider(
  id: string,
  name: string,
  kind: "twitch" | "streamerbot",
  active: boolean,
  connectionState: RegisteredProviderView["connectionState"],
  intakeState: RegisteredProviderView["intakeState"],
  liveStatus: RegisteredProviderView["liveStatus"]
): RegisteredProviderView {
  return {
    id,
    name,
    kind,
    capability: "event-source",
    active,
    connectionState,
    intakeState,
    ...(liveStatus === undefined ? {} : { liveStatus }),
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
