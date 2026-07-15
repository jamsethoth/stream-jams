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
  correction: { label: "Open diagnostics", route: "/diagnostics?reference=ref-validation-41" }
};

const warning: ActionableManagementError = {
  summary: "Some active alerts use another event source",
  cause: "Two enabled alerts do not match Streamer.bot events.",
  nextStep: "Review unmatched alerts before changing the active event source.",
  severity: "warning",
  occurredAt: null,
  referenceId: "ref-impact-9",
  correction: { label: "Review alerts", route: "/modules/alerts?filter=unmatched" }
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
  afterEach(cleanup);

  it("keeps failed validation in the wizard and prevents registration", async () => {
    const user = userEvent.setup();
    const api = providerApi({
      listRegisteredProviders: vi.fn(async () => []),
      validateProvider: vi.fn(async () => invalidResult)
    });

    render(<EventSourcesPage managementApi={api} />);
    await user.click(await screen.findByRole("button", { name: "Add event source" }));
    await user.selectOptions(screen.getByLabelText("Provider type"), "streamerbot");
    await user.clear(screen.getByLabelText("Provider name"));
    await user.type(screen.getByLabelText("Provider name"), "Local Streamer.bot");
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Start Streamer.bot's WebSocket server");
    expect(screen.getByText("ref-validation-41")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register provider" })).toBeDisabled();
    expect(api.registerProvider).not.toHaveBeenCalled();
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
    await user.clear(screen.getByLabelText("Provider name"));
    await user.type(screen.getByLabelText("Provider name"), "Local Streamer.bot");

    const register = screen.getByRole("button", { name: "Register provider" });
    expect(register).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connection test passed.")).toBeInTheDocument();
    expect(register).toBeEnabled();
    await user.click(register);

    expect(api.registerProvider).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "Local Streamer.bot" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "View 4 alert uses" })).toHaveAttribute(
      "href",
      "/modules/alerts?ttsProvider=speakerbot-main"
    );
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
    ...overrides
  };
}
