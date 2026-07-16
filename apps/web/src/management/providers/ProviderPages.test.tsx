import type {
  ActionableManagementError,
  ProviderActivationImpact,
  ProviderRegistrationAttempt,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView,
  TtsProviderSafetySettings
} from "@stream-jams/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventSourcesPage } from "./EventSourcesPage.js";
import type { ProviderPageApi } from "./ProviderPage.js";
import { TtsProvidersPage } from "./TtsProvidersPage.js";

const validationError: ActionableManagementError = {
  summary: "Streamer.bot validation failed",
  cause: "No WebSocket server answered on port 8080.",
  nextStep: "Start Streamer.bot's WebSocket server and retry the connection test.",
  severity: "error",
  occurredAt: "2026-07-15T12:00:00.000Z",
  referenceId: "ref-validation-41",
  correction: { label: "Open diagnostics", route: "/manage/diagnostics?reference=ref-validation-41" }
};

const warning: ActionableManagementError = {
  summary: "Some active alerts use another event source",
  cause: "Two enabled alerts do not match Streamer.bot events.",
  nextStep: "Review unmatched alerts before changing the active event source.",
  severity: "warning",
  occurredAt: null,
  referenceId: "ref-impact-9",
  correction: { label: "Review alerts", route: "/manage/modules/alerts?filter=unmatched" }
};

const validResult: ProviderValidationResult = {
  valid: true,
  connectionState: "connected",
  intakeState: "inactive",
  validatedAt: "2026-07-15T12:00:00.000Z",
  availableVoices: [],
  error: null
};

const invalidResult: ProviderValidationResult = {
  valid: false,
  connectionState: "error",
  intakeState: "error",
  validatedAt: "2026-07-15T12:00:00.000Z",
  availableVoices: [],
  error: validationError
};

const activeTwitch = provider({ id: "twitch-main", name: "Main Twitch", kind: "twitch", active: true, intakeState: "active" });
const inactiveStreamerBot = provider({
  id: "streamerbot-local",
  name: "Local Streamer.bot",
  kind: "streamerbot",
  active: false,
  intakeState: "inactive",
  usedByAlertCount: 2
});
const activeSpeakerBot = provider({
  id: "speakerbot-main",
  name: "Speaker.bot",
  kind: "speakerbot",
  capability: "tts",
  active: true,
  intakeState: null,
  usedByAlertCount: 4
});

describe("provider pages", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps failed validation in the wizard and prevents registration", async () => {
    const user = userEvent.setup();
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => []),
      validateProvider: vi.fn(async () => invalidResult)
    });

    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.selectOptions(screen.getByLabelText("Provider type"), "streamerbot");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Connection name"));
    await user.type(screen.getByLabelText("Connection name"), "Local Streamer.bot");
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Start Streamer.bot's WebSocket server");
    expect(screen.getByText("ref-validation-41")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configure Streamer.bot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register event source" })).not.toBeInTheDocument();
    expect(api.registerProvider).not.toHaveBeenCalled();
  });

  it("opens the setup wizard from route context", async () => {
    render(<EventSourcesPage managementApi={providerApi()} openSetupOnLoad />);

    expect(await screen.findByRole("dialog", { name: "Add event source" })).toBeInTheDocument();
  });

  it("selects the provider named by route context", async () => {
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeTwitch, inactiveStreamerBot]),
      getProvider: vi.fn(async (providerId) => detail(providerId === activeTwitch.id ? activeTwitch : inactiveStreamerBot))
    });

    render(<EventSourcesPage initialProviderId={inactiveStreamerBot.id} managementApi={api} />);

    expect(await screen.findByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
  });

  it("registers only after successful validation", async () => {
    const user = userEvent.setup();
    const registered = detail(inactiveStreamerBot);
    const attempt: ProviderRegistrationAttempt = { status: "registered", provider: registered, validation: validResult };
    const listRegisteredProviders = vi
      .fn<ProviderPageApi["listRegisteredProviders"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([inactiveStreamerBot]);
    const api = providerApi({
      listRegisteredProviders,
      validateProvider: vi.fn(async () => validResult),
      registerProvider: vi.fn(async () => attempt),
      getProvider: vi.fn(async () => registered)
    });

    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.selectOptions(screen.getByLabelText("Provider type"), "streamerbot");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Configure Streamer.bot" })).toHaveFocus();
    await user.clear(screen.getByLabelText("Connection name"));
    await user.type(screen.getByLabelText("Connection name"), "Local Streamer.bot");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("heading", { name: "Review event source" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review event source" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Configure Streamer.bot" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await user.click(screen.getByRole("button", { name: "Register event source" }));

    expect(api.registerProvider).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add event source" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("registered");
    expect(screen.getByRole("status")).toHaveTextContent("inactive");
  });

  it("opens Device Code Twitch activation synchronously, polls once per interval, then requires an explicit connection test", async () => {
    const user = userEvent.setup();
    const connected = {
      connected: true as const,
      account: {
        accountId: "twitch-account",
        login: "jamsethoth",
        displayName: "Jamsethoth",
        scopes: ["user:read:chat"],
        connectedAt: "2026-07-15T12:00:00.000Z",
        updatedAt: "2026-07-15T12:00:00.000Z"
      }
    };
    const registered = detail(activeTwitch);
    const polledAt: number[] = [];
    const api = providerApi({
      getTwitchStatus: vi
        .fn<ProviderPageApi["getTwitchStatus"]>()
        .mockResolvedValueOnce({ connected: false, account: null })
        .mockResolvedValue(connected),
      startTwitchAuth: vi.fn(async () => ({
        authorizationId: "auth-test",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "ABCD-EFGH",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: ["user:read:chat"]
      })),
      pollTwitchAuth: vi.fn<ProviderPageApi["pollTwitchAuth"]>(async () => {
        polledAt.push(Date.now());
        return polledAt.length === 1 ? { status: "pending" as const } : { status: "connected" as const, connection: connected };
      }),
      validateProvider: vi.fn(async () => validResult),
      registerProvider: vi.fn<ProviderPageApi["registerProvider"]>(async () => ({ status: "registered", provider: registered, validation: validResult })),
      listRegisteredProviders: vi
        .fn<ProviderPageApi["listRegisteredProviders"]>()
        .mockResolvedValueOnce([])
        .mockResolvedValue([activeTwitch]),
      getProvider: vi.fn(async () => registered)
    });

    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("No Twitch account connected")).toBeInTheDocument();
    const popup = { location: { href: "" }, close: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    await user.click(screen.getByRole("button", { name: "Connect Twitch" }));
    expect(open).toHaveBeenCalledWith("about:blank", "stream-jams-twitch-device-auth");
    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Twitch" })).toHaveAttribute(
      "href",
      "https://www.twitch.tv/activate"
    );
    expect(popup.location.href).toBe("https://www.twitch.tv/activate");
    await new Promise((resolve) => window.setTimeout(resolve, 2_150));
    expect(api.pollTwitchAuth).toHaveBeenCalledTimes(2);
    expect(polledAt[1]! - polledAt[0]!).toBeGreaterThanOrEqual(900);
    expect(screen.getByText("Jamsethoth (@jamsethoth)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByRole("heading", { name: "Review event source" })).toBeInTheDocument();
    expect(screen.getByText("Jamsethoth (@jamsethoth)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Register event source" }));
    expect(api.validateProvider).toHaveBeenCalledWith({ name: "Twitch", kind: "twitch", configuration: {} });
    expect(await screen.findByText("Main Twitch registered and active.")).toBeInTheDocument();
    open.mockRestore();
  });

  it("keeps Twitch code and fallback link usable when popup opening is blocked, then clears polling when the wizard closes", async () => {
    const user = userEvent.setup();
    const pollTwitchAuth = vi.fn(async () => ({ status: "pending" as const }));
    const api = providerApi({
      startTwitchAuth: vi.fn(async () => ({
        authorizationId: "auth-popup",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "POPUP-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      })),
      pollTwitchAuth
    });
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Connect Twitch" }));
    expect(await screen.findByText("POPUP-CODE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Twitch" })).toHaveAttribute("href", "https://www.twitch.tv/activate");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(pollTwitchAuth).not.toHaveBeenCalled();
    expect(api.registerProvider).not.toHaveBeenCalled();
  });

  it("clears pending Twitch polling when the provider wizard unmounts", async () => {
    const user = userEvent.setup();
    const pollTwitchAuth = vi.fn(async () => ({ status: "pending" as const }));
    const api = providerApi({
      startTwitchAuth: vi.fn(async () => ({
        authorizationId: "auth-unmount",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "UNMOUNT-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      })),
      pollTwitchAuth
    });
    vi.spyOn(window, "open").mockReturnValue(null);
    const view = render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Connect Twitch" }));
    expect(await screen.findByText("UNMOUNT-CODE")).toBeInTheDocument();
    view.unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(pollTwitchAuth).not.toHaveBeenCalled();
  });

  it("reports denied and expired authorization results with retry actions", async () => {
    const user = userEvent.setup();
    for (const [code, message] of [
      ["TWITCH_OAUTH_DENIED", "Twitch authorization was denied"],
      ["TWITCH_OAUTH_EXPIRED", "Twitch authorization expired"]
    ] as const) {
      const api = providerApi({
        startTwitchAuth: vi.fn(async () => ({
          authorizationId: code,
          verificationUri: "https://www.twitch.tv/activate",
          userCode: "RETRY-CODE",
          expiresAt: "2026-07-16T18:00:00.000Z",
          intervalSeconds: 1,
          scopes: []
        })),
        pollTwitchAuth: vi.fn(async () => ({ status: "failed" as const, code, message }))
      });
      render(<EventSourcesPage managementApi={api} />);
      await user.click(await screen.findByRole("button", { name: "Add event source" }));
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Connect Twitch" }));
      await new Promise((resolve) => window.setTimeout(resolve, 1_100));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("stops polling and uses ManagementErrorBanner when the Twitch poll fails", async () => {
    const user = userEvent.setup();
    const pollTwitchAuth = vi.fn(async () => { throw new Error("Twitch service unavailable"); });
    const api = providerApi({
      startTwitchAuth: vi.fn(async () => ({
        authorizationId: "auth-error",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "ERROR-CODE",
        expiresAt: "2026-07-16T18:00:00.000Z",
        intervalSeconds: 1,
        scopes: []
      })),
      pollTwitchAuth
    });
    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Connect Twitch" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to continue Twitch authorization");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(pollTwitchAuth).toHaveBeenCalledTimes(1);
  });

  it("shows connection and intake separately and confirms warned activation", async () => {
    const user = userEvent.setup();
    const impact: ProviderActivationImpact = {
      matchedAlertCount: 3,
      unmatchedAlertCount: 2,
      blockers: [],
      warnings: [warning]
    };
    const activateProvider = vi.fn(async () => ({
      provider: { ...inactiveStreamerBot, active: true, intakeState: "active" as const },
      replacedProviderId: activeTwitch.id,
      impact
    }));
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeTwitch, inactiveStreamerBot]),
      getProvider: vi.fn(async (providerId) => detail(providerId === activeTwitch.id ? activeTwitch : inactiveStreamerBot)),
      getProviderActivationImpact: vi.fn(async () => impact),
      activateProvider
    });

    render(<EventSourcesPage managementApi={api} />);
    const row = await screen.findByRole("row", { name: /Local Streamer\.bot/ });
    expect(within(row).getByText("Connected")).toBeInTheDocument();
    expect(within(row).getAllByText("Inactive")).toHaveLength(2);
    await user.click(within(row).getByRole("button", { name: "View Local Streamer.bot" }));

    expect(await screen.findByText(/2 unmatched alerts/)).toBeInTheDocument();
    expect(screen.getByText("ref-impact-9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set active" }));
    const dialog = screen.getByRole("dialog", { name: "Set Local Streamer.bot active?" });
    expect(dialog).toHaveTextContent("Two enabled alerts do not match Streamer.bot events.");
    await user.click(within(dialog).getByRole("button", { name: "Set active provider" }));

    expect(activateProvider).toHaveBeenCalledWith(inactiveStreamerBot.id, true);
  });

  it("saves TTS safety settings and runs the fixed safe voice test", async () => {
    const user = userEvent.setup();
    const safety: TtsProviderSafetySettings = {
      defaultVoiceId: "voice-1",
      volume: 0.8,
      minimumRate: 0.8,
      maximumRate: 1.2,
      maximumTextLength: 240
    };
    const updateTtsSafety = vi.fn(async (_providerId: string, input: TtsProviderSafetySettings) => input);
    const testProviderVoice = vi.fn(async () => ({ delivered: true, error: null }));
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeSpeakerBot]),
      getProvider: vi.fn(async () => ({
        ...detail(activeSpeakerBot),
        availableVoices: [{ id: "voice-1", label: "Default voice" }],
        ttsSafety: safety
      })),
      getTtsProviderSafetySettings: vi.fn(async () => safety),
      updateTtsSafety,
      testProviderVoice
    });

    render(<TtsProvidersPage managementApi={api} />);
    expect(await screen.findByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
    expect(screen.getByText("4 alert uses")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View 4 alert uses" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Volume"));
    await user.type(screen.getByLabelText("Volume"), "0.6");
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));
    expect(updateTtsSafety).toHaveBeenCalledWith(activeSpeakerBot.id, { ...safety, volume: 0.6 });

    expect(screen.getByText("Stream Jams voice test. Your text to speech provider is ready.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test voice" }));
    expect(testProviderVoice).toHaveBeenCalledWith(activeSpeakerBot.id);
    expect(await screen.findByText("Voice test delivered.")).toBeInTheDocument();
  });
});

function provider(
  overrides: Partial<RegisteredProviderView> & Pick<RegisteredProviderView, "id" | "name" | "kind">
): RegisteredProviderView {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind,
    capability: overrides.capability ?? "event-source",
    active: overrides.active ?? false,
    connectionState: overrides.connectionState ?? "connected",
    intakeState: overrides.intakeState ?? "inactive",
    validatedAt: overrides.validatedAt ?? "2026-07-15T12:00:00.000Z",
    error: overrides.error ?? null,
    usedByAlertCount: overrides.usedByAlertCount ?? 0
  };
}

function detail(view: RegisteredProviderView): RegisteredProviderDetail {
  return {
    provider: view,
    configuration: view.kind === "streamerbot" ? { protocol: "ws", host: "127.0.0.1", port: 8080, endpoint: "/" } : {},
    availableVoices: [],
    ttsSafety: null
  };
}

function providerApi(overrides: Partial<ProviderPageApi> = {}): ProviderPageApi {
  return {
    listRegisteredProviders: vi.fn(async () => []),
    validateProvider: vi.fn(async () => validResult),
    registerProvider: vi.fn(async () => ({ status: "validation-failed" as const, provider: null, validation: invalidResult })),
    getProvider: vi.fn(async () => detail(activeTwitch)),
    activateProvider: vi.fn(async () => ({
      provider: activeTwitch,
      replacedProviderId: null,
      impact: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] }
    })),
    getProviderActivationImpact: vi.fn(async () => ({
      matchedAlertCount: 0,
      unmatchedAlertCount: 0,
      blockers: [],
      warnings: []
    })),
    getTtsProviderSafetySettings: vi.fn(async () => ({
      defaultVoiceId: null,
      volume: 1,
      minimumRate: 0.8,
      maximumRate: 1.2,
      maximumTextLength: 240
    })),
    updateTtsSafety: vi.fn(async (_providerId, input) => input),
    testProviderVoice: vi.fn(async () => ({ delivered: true, error: null })),
    getTwitchStatus: vi.fn(async () => ({ connected: false as const, account: null })),
    startTwitchAuth: vi.fn(async () => ({
      authorizationId: "auth-test",
      verificationUri: "https://www.twitch.tv/activate",
      userCode: "ABCD-EFGH",
      expiresAt: "2026-07-16T18:00:00.000Z",
      intervalSeconds: 5,
      scopes: []
    })),
    pollTwitchAuth: vi.fn(async () => ({ status: "pending" as const })),
    ...overrides
  };
}
