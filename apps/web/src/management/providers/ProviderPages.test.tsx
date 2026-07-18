import type {
  ActionableManagementError,
  ProviderActivationImpact,
  ProviderRegistrationAttempt,
  ProviderValidationResult,
  RegisteredProviderDetail,
  RegisteredProviderView,
  TtsProviderSafetySettings
} from "@stream-jams/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const runtimeError: ActionableManagementError = {
  summary: "Streamer.bot live status error",
  cause: "Streamer.bot request timed out",
  nextStep: "Review the provider connection and reconnect it before retrying.",
  severity: "error",
  occurredAt: "2026-07-17T12:00:00.000Z",
  referenceId: "ref-streamerbot-runtime",
  correction: { label: "Open diagnostics", route: "/manage/diagnostics?reference=ref-streamerbot-runtime" }
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
const inactiveSpeakerBot = provider({
  id: "speakerbot-backup",
  name: "Backup Speaker.bot",
  kind: "speakerbot",
  capability: "tts",
  active: false,
  intakeState: null
});
const ttsSafety: TtsProviderSafetySettings = {
  defaultVoiceId: null,
  volume: 0.8,
  minimumRate: 0.8,
  maximumRate: 1.2,
  maximumTextLength: 240
};

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

  it("shows event-source usage and live status without redundant connection, intake, or runtime columns", async () => {
    const providers = [
      { ...activeTwitch, liveStatus: "healthy" },
      { ...inactiveStreamerBot, liveStatus: "not-running" }
    ] as readonly RegisteredProviderView[];
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => providers),
      getProvider: vi.fn(async (providerId) => detail(providers.find((providerView) => providerView.id === providerId)!))
    });

    render(<EventSourcesPage managementApi={api} />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Usage" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Live status" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Connection" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Intake" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Runtime" })).not.toBeInTheDocument();
    expect(within(await screen.findByRole("row", { name: /Main Twitch/ })).getByText("In use")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Main Twitch/ })).getByText("Healthy")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Local Streamer\.bot/ })).getByText("Not in use")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Local Streamer\.bot/ })).getByText("Not running")).toBeInTheDocument();
  });

  it("reconnects an existing Twitch provider without registering a duplicate", async () => {
    const user = userEvent.setup();
    const failedTwitch = {
      ...activeTwitch,
      liveStatus: "error" as const,
      error: {
        ...runtimeError,
        summary: "Twitch EventSub status degraded",
        cause: "Twitch API returned HTTP 401"
      }
    };
    const healthyTwitch = { ...activeTwitch, liveStatus: "healthy" as const, error: null };
    const connected = {
      connected: true as const,
      account: {
        accountId: "twitch-account",
        login: "jamsethoth",
        displayName: "Jamsethoth",
        scopes: ["user:read:chat"],
        connectedAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:00:00.000Z"
      }
    };
    const listRegisteredProviders = vi
      .fn<ProviderPageApi["listRegisteredProviders"]>()
      .mockResolvedValueOnce([failedTwitch])
      .mockResolvedValue([healthyTwitch]);
    const api = providerApi({
      listRegisteredProviders,
      getProvider: vi.fn(async () => detail(failedTwitch)),
      getTwitchStatus: vi.fn(async () => connected),
      startTwitchAuth: vi.fn(async () => ({
        authorizationId: "auth-reconnect",
        verificationUri: "https://www.twitch.tv/activate",
        userCode: "RECONNECT",
        expiresAt: "2026-07-17T13:00:00.000Z",
        intervalSeconds: 0.001,
        scopes: ["user:read:chat"]
      })),
      pollTwitchAuth: vi.fn(async () => ({ status: "connected" as const, connection: connected }))
    });
    const popup = { location: { href: "" }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<EventSourcesPage managementApi={api} />);

    await user.click(await screen.findByRole("button", { name: "Reconnect Twitch" }));
    const dialog = screen.getByRole("dialog", { name: "Reconnect Main Twitch" });
    expect(within(dialog).queryByLabelText("Provider type")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Register event source" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reconnect Twitch" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Main Twitch reconnected. Live status is updating.");
    expect(api.registerProvider).not.toHaveBeenCalled();
    expect(listRegisteredProviders).toHaveBeenCalledTimes(2);
  });

  it("refreshes event-source live status every five seconds while preserving selection", async () => {
    vi.useFakeTimers();
    const initialProviders = [
      { ...activeTwitch, liveStatus: "healthy" as const },
      { ...inactiveStreamerBot, active: true, liveStatus: "error" as const, error: runtimeError }
    ];
    const refreshedProviders = [
      initialProviders[0]!,
      { ...initialProviders[1]!, liveStatus: "healthy" as const, error: null }
    ];
    const listRegisteredProviders = vi
      .fn<ProviderPageApi["listRegisteredProviders"]>()
      .mockResolvedValueOnce(initialProviders)
      .mockResolvedValue(refreshedProviders);
    const api = providerApi({
      listRegisteredProviders,
      getProvider: vi.fn(async (providerId) =>
        detail(initialProviders.find((providerView) => providerView.id === providerId)!)
      )
    });

    render(<EventSourcesPage managementApi={api} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("row", { name: /Local Streamer\.bot/ }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
    expect(screen.getByText("Streamer.bot request timed out")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(listRegisteredProviders).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("row", { name: /Local Streamer\.bot/ })).getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
    expect(screen.queryByText("Streamer.bot request timed out")).not.toBeInTheDocument();
  });

  it("keeps the last event-source state visible when a background refresh fails", async () => {
    vi.useFakeTimers();
    const listRegisteredProviders = vi
      .fn<ProviderPageApi["listRegisteredProviders"]>()
      .mockResolvedValueOnce([{ ...activeTwitch, liveStatus: "healthy" }])
      .mockRejectedValueOnce(new Error("Local service request failed"));
    const api = providerApi({ listRegisteredProviders });

    render(<EventSourcesPage managementApi={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("row", { name: /Main Twitch/ })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(screen.getByRole("row", { name: /Main Twitch/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to refresh live status");
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

  it("opens before start resolves and invalidates late start or pending poll work after cleanup", async () => {
    const user = userEvent.setup();
    const start = deferred<Awaited<ReturnType<ProviderPageApi["startTwitchAuth"]>>>();
    const poll = deferred<Awaited<ReturnType<ProviderPageApi["pollTwitchAuth"]>>>();
    const api = providerApi({
      startTwitchAuth: vi.fn(() => start.promise),
      pollTwitchAuth: vi.fn(() => poll.promise)
    });
    const popup = { close: vi.fn(), location: { href: "" } } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);

    const view = render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Connect Twitch" }));
    expect(window.open).toHaveBeenCalledWith("about:blank", "stream-jams-twitch-device-auth");
    expect(popup.location.href).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      start.resolve(deviceAuthorization());
      await Promise.resolve();
    });
    expect(popup.location.href).toBe("");
    expect(api.registerProvider).not.toHaveBeenCalled();

    view.unmount();
    const secondStart = deferred<Awaited<ReturnType<ProviderPageApi["startTwitchAuth"]>>>();
    const secondApi = providerApi({
      startTwitchAuth: vi.fn(() => secondStart.promise),
      pollTwitchAuth: vi.fn(() => poll.promise)
    });
    const secondView = render(<EventSourcesPage managementApi={secondApi} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add event source" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Twitch" }));
    await act(async () => {
      secondStart.resolve(deviceAuthorization());
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(secondApi.pollTwitchAuth).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(secondApi.pollTwitchAuth).toHaveBeenCalledTimes(1);
    secondView.unmount();
    await act(async () => {
      poll.resolve({ status: "pending" });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(secondApi.pollTwitchAuth).toHaveBeenCalledTimes(1);
    expect(secondApi.registerProvider).not.toHaveBeenCalled();
  });

  it("reports denied and expired authorization results with retry actions", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "open").mockReturnValue(null);
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
    vi.spyOn(window, "open").mockReturnValue(null);
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

  it("selects an event source by row and confirms activation from its inline action", async () => {
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
    expect(within(row).getByText("Not in use")).toBeInTheDocument();
    expect(within(row).getByText("Not running")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /View/ })).not.toBeInTheDocument();
    const selectButton = within(row).getByRole("button", { name: "Select Local Streamer.bot" });
    const activateButton = within(row).getByRole("button", { name: "Activate Local Streamer.bot" });
    await user.click(activateButton);
    expect(selectButton).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("heading", { name: "Main Twitch" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", { name: "Activate Local Streamer.bot?" })).getByRole("button", { name: "Cancel" }));

    await user.click(row);

    expect(await screen.findByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
    expect(await screen.findByText(/2 unmatched alerts/)).toBeInTheDocument();
    expect(screen.getByText("ref-impact-9")).toBeInTheDocument();
    await user.click(activateButton);
    const dialog = await screen.findByRole("dialog", { name: "Activate Local Streamer.bot?" });
    expect(dialog).toHaveTextContent("Two enabled alerts do not match Streamer.bot events.");
    expect(activateProvider).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Activate event source" }));

    expect(activateProvider).toHaveBeenCalledWith(inactiveStreamerBot.id, true);
  });

  it("describes activation when no event source is currently active", async () => {
    const user = userEvent.setup();
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [inactiveStreamerBot]),
      getProvider: vi.fn(async () => detail(inactiveStreamerBot))
    });

    render(<EventSourcesPage managementApi={api} />);
    const row = await screen.findByRole("row", { name: /Local Streamer\.bot/ });
    await user.click(within(row).getByRole("button", { name: "Activate Local Streamer.bot" }));

    const dialog = await screen.findByRole("dialog", { name: "Activate Local Streamer.bot?" });
    expect(dialog).toHaveTextContent("Local Streamer.bot will become the active event source");
    expect(dialog).not.toHaveTextContent("current event source");
  });

  it("describes the impact and requires confirmation before deactivating an event source", async () => {
    const user = userEvent.setup();
    let providers: readonly RegisteredProviderView[] = [activeTwitch];
    const deactivateProvider = vi.fn(async () => {
      const deactivated = { ...activeTwitch, active: false, intakeState: "inactive" as const };
      providers = [deactivated];
      return deactivated;
    });
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => providers),
      getProvider: vi.fn(async () => detail(providers[0]!)),
      deactivateProvider
    });

    render(<EventSourcesPage managementApi={api} />);
    const row = await screen.findByRole("row", { name: /Main Twitch/ });
    await user.click(within(row).getByRole("button", { name: "Deactivate Main Twitch" }));

    const dialog = screen.getByRole("dialog", { name: "Deactivate Main Twitch?" });
    expect(dialog).toHaveTextContent("Live event intake will stop");
    expect(dialog).toHaveTextContent("settings and alert mappings will remain saved");
    expect(dialog).toHaveTextContent("Activate this or another event source to resume intake");
    expect(deactivateProvider).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Deactivate event source" }));

    expect(deactivateProvider).toHaveBeenCalledWith(activeTwitch.id);
    expect(await screen.findByRole("status")).toHaveTextContent("Main Twitch is inactive");
  });

  it("saves TTS safety settings and runs the fixed safe voice test", async () => {
    const user = userEvent.setup();
    const safety: TtsProviderSafetySettings = {
      defaultVoiceId: null,
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
        availableVoices: [],
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
    await user.type(screen.getByLabelText("Default voice alias"), "EventVoice");
    await user.clear(screen.getByLabelText("Volume"));
    await user.type(screen.getByLabelText("Volume"), "0.6");
    await user.click(screen.getByRole("button", { name: "Save safety settings" }));
    expect(updateTtsSafety).toHaveBeenCalledWith(activeSpeakerBot.id, {
      ...safety,
      defaultVoiceId: "EventVoice",
      volume: 0.6
    });

    expect(screen.getByText("Stream Jams voice test. Your text to speech provider is ready.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test voice" }));
    expect(testProviderVoice).toHaveBeenCalledWith(activeSpeakerBot.id);
    expect(await screen.findByText("Voice test delivered.")).toBeInTheDocument();
  });

  it("requires an explicit choice before discarding TTS safety to select another provider", async () => {
    const user = userEvent.setup();
    const updateTtsSafety = vi.fn(async (_providerId: string, input: TtsProviderSafetySettings) => input);
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeSpeakerBot, inactiveSpeakerBot]),
      getProvider: vi.fn(async (providerId) => detail(providerId === activeSpeakerBot.id ? activeSpeakerBot : inactiveSpeakerBot)),
      getTtsProviderSafetySettings: vi.fn(async () => ttsSafety),
      updateTtsSafety
    });

    render(<TtsProvidersPage managementApi={api} />);
    expect(await screen.findByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Volume"));
    await user.type(screen.getByLabelText("Volume"), "0.5");
    await user.click(screen.getByRole("button", { name: "Select Backup Speaker.bot" }));

    const dialog = screen.getByRole("dialog", { name: "Switch providers with unsaved changes?" });
    expect(within(dialog).getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Discard" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
    expect(screen.getByLabelText("Volume")).toHaveValue(0.5);

    await user.click(screen.getByRole("button", { name: "Select Backup Speaker.bot" }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch providers with unsaved changes?" })).getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("heading", { name: "Backup Speaker.bot" })).toBeInTheDocument();
    expect(updateTtsSafety).not.toHaveBeenCalled();
  });

  it("saves dirty TTS safety before selecting another provider", async () => {
    const user = userEvent.setup();
    const updateTtsSafety = vi.fn(async (_providerId: string, input: TtsProviderSafetySettings) => input);
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeSpeakerBot, inactiveSpeakerBot]),
      getProvider: vi.fn(async (providerId) => detail(providerId === activeSpeakerBot.id ? activeSpeakerBot : inactiveSpeakerBot)),
      getTtsProviderSafetySettings: vi.fn(async () => ttsSafety),
      updateTtsSafety
    });

    render(<TtsProvidersPage managementApi={api} />);
    expect(await screen.findByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Volume"));
    await user.type(screen.getByLabelText("Volume"), "0.6");
    await user.click(screen.getByRole("button", { name: "Select Backup Speaker.bot" }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch providers with unsaved changes?" })).getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(updateTtsSafety).toHaveBeenCalledWith(activeSpeakerBot.id, { ...ttsSafety, volume: 0.6 }));
    expect(await screen.findByRole("heading", { name: "Backup Speaker.bot" })).toBeInTheDocument();
  });

  it("keeps provider selection blocked with an actionable error when save-and-continue fails", async () => {
    const user = userEvent.setup();
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => [activeSpeakerBot, inactiveSpeakerBot]),
      getProvider: vi.fn(async (providerId) => detail(providerId === activeSpeakerBot.id ? activeSpeakerBot : inactiveSpeakerBot)),
      getTtsProviderSafetySettings: vi.fn(async () => ttsSafety),
      updateTtsSafety: vi.fn(async () => { throw new Error("Provider settings store unavailable"); })
    });

    render(<TtsProvidersPage managementApi={api} />);
    expect(await screen.findByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Volume"));
    await user.type(screen.getByLabelText("Volume"), "0.6");
    await user.click(screen.getByRole("button", { name: "Select Backup Speaker.bot" }));
    await user.click(within(screen.getByRole("dialog", { name: "Switch providers with unsaved changes?" })).getByRole("button", { name: "Save and continue" }));

    const dialog = screen.getByRole("dialog", { name: "Switch providers with unsaved changes?" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Review each safety value, then retry the save.");
    expect(screen.getByRole("heading", { name: "Speaker.bot" })).toBeInTheDocument();
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
    deactivateProvider: vi.fn(async () => ({ ...activeTwitch, active: false, intakeState: "inactive" as const })),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function deviceAuthorization() {
  return {
    authorizationId: "auth-deferred",
    verificationUri: "https://www.twitch.tv/activate",
    userCode: "DEFER-CODE",
    expiresAt: "2026-07-16T18:00:00.000Z",
    intervalSeconds: 5,
    scopes: []
  };
}
