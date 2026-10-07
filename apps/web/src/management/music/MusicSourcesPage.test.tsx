import { renderManagement as render } from "../../test-support/render-management.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicPairingAttemptView } from "@stream-jams/core";
import type { MusicSourcesApi } from "./MusicSourcesPage.js";
import { MusicSourcesPage } from "./MusicSourcesPage.js";

const status = { enabled: false, selectedProviderId: null, status: { state: "disconnected" as const, stale: false, diagnosticReference: null }, missingAssetIds: { landscape: [], vertical: [] } };
const provider = { id: "provider-1", name: "Pear Studio", kind: "pear-desktop" as const, capability: "music-source" as const, active: true, connectionState: "connected" as const, intakeState: null, validatedAt: "2026-10-04T12:00:00.000Z", error: null, usedByAlertCount: 0 };
const validation = { valid: true, connectionState: "connected" as const, intakeState: null, validatedAt: "2026-10-04T12:00:00.000Z", availableVoices: [], error: null };
afterEach(() => cleanup());

function createApi(overrides: Partial<MusicSourcesApi> = {}): MusicSourcesApi {
  return {
    listRegisteredProviders: vi.fn(async () => []),
    getProvider: vi.fn(async () => ({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null })),
    validateProvider: vi.fn(async () => validation),
    registerProvider: vi.fn(async () => ({ status: "registered" as const, provider: { provider, configuration: {}, availableVoices: [], ttsSafety: null }, validation })),
    activateProvider: vi.fn(async () => ({ provider, replacedProviderId: null, impact: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] } })),
    getMusicStatus: vi.fn(async () => status),
    beginMusicPairing: vi.fn(async () => ({ attemptId: "pair_123", status: "approved" as const, expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const }, certificate: null })),
    getMusicPairing: vi.fn(async () => ({ attemptId: "pair_123", status: "approved" as const, expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const }, certificate: null })),
    cancelMusicPairing: vi.fn(async () => undefined),
    acceptMusicPairingCertificate: vi.fn(async () => { throw new Error("No certificate review in this fixture"); }),
    reconnectMusicSource: vi.fn(async () => status),
    replaceMusicCredential: vi.fn(async () => ({ validation, runtimeReconcilePending: false, credentialRetirementPending: false })),
    setOverlayModuleEnabled: vi.fn(async () => true),
    ...overrides
  } as MusicSourcesApi;
}

describe("MusicSourcesPage", () => {
  it("shows the empty, disabled and separate missing-asset states", async () => {
    const api = createApi({ getMusicStatus: vi.fn(async () => ({ ...status, missingAssetIds: { landscape: ["brand-1"], vertical: ["font-1"] } })) });
    render(<MusicSourcesPage api={api} />);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Loading Music sources");
    expect(await screen.findByText("No Music sources registered.")).toBeInTheDocument();
    expect(screen.getByText("Not running while Music is disabled")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Music asset diagnostics" })).toHaveTextContent("brand-1");
    expect(screen.getByRole("status", { name: "Music asset diagnostics" })).toHaveTextContent("font-1");
  });

  it("requires explicit pairing, transport test and save before registration", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<MusicSourcesPage api={api} />);
    await screen.findByText("No Music sources registered.");
    await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
    expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
    expect(await screen.findByText("Pear approval: approved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connection test passed. Save to use this source.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save source" }));
    await waitFor(() => expect(api.registerProvider).toHaveBeenCalledWith({ kind: "pear-desktop", name: "Pear Desktop", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, pairingAttemptId: "pair_123" }));
    expect(JSON.stringify(vi.mocked(api.registerProvider).mock.calls)).not.toMatch(/accessToken|secretRef/u);
  });

  it("ignores a late pairing result after unmount and cancels the approved attempt", async () => {
    let resolvePair!: (value: MusicPairingAttemptView) => void;
    const pending = new Promise<MusicPairingAttemptView>(resolve => { resolvePair = resolve; });
    const api = createApi({ beginMusicPairing: vi.fn(() => pending) });
    const user = userEvent.setup();
    const mounted = render(<MusicSourcesPage api={api} />);
    await screen.findByText("No Music sources registered.");
    await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
    await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
    mounted.unmount();
    resolvePair({ attemptId: "pair_late", status: "approved", expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const }, certificate: null });
    await waitFor(() => expect(api.cancelMusicPairing).toHaveBeenCalledWith("pair_late"));
  });

  it("keeps controls usable when selection changes during a slow pairing request", async () => {
    let resolvePair!: (value: MusicPairingAttemptView) => void;
    const pending = new Promise<MusicPairingAttemptView>(resolve => { resolvePair = resolve; });
    const api = createApi({ listRegisteredProviders: vi.fn(async () => [provider]), beginMusicPairing: vi.fn(() => pending) });
    const user = userEvent.setup();
    render(<MusicSourcesPage api={api} />);
    await screen.findByRole("button", { name: "Pear Studio" });
    await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
    await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
    await user.click(screen.getByRole("button", { name: "Pear Studio" }));
    resolvePair({ attemptId: "pair_late", status: "approved", expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const }, certificate: null });
    await waitFor(() => expect(api.cancelMusicPairing).toHaveBeenCalledWith("pair_late"));
    expect(screen.getByRole("button", { name: "Pair Pear Desktop" })).toBeEnabled();
    expect(screen.queryByText("Pear approval: approved")).not.toBeInTheDocument();
  });

  describe("self-signed Pear certificate", () => {
    const sha256 = Array.from({ length: 32 }, () => "AB").join(":");
    const httpsConfig = { baseUrl: "https://127.0.0.1:26538", transport: "auto" as const };
    const pinned = { ...httpsConfig, trustedCertificate: { sha256, pem: "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n" } };
    const review: MusicPairingAttemptView = {
      attemptId: "pair_cert", status: "certificate-review", expiresAt: "2026-10-04T12:00:00.000Z", configuration: httpsConfig,
      certificate: { sha256, subject: "CN=localhost", issuer: "CN=localhost", validFrom: "Oct  4 23:22:12 2026 GMT", validTo: "Oct  4 23:22:12 2027 GMT", replacesTrusted: false }
    };
    const accepted: MusicPairingAttemptView = { ...review, status: "pending", configuration: pinned, certificate: null };

    async function startPairing(api: MusicSourcesApi) {
      const user = userEvent.setup();
      render(<MusicSourcesPage api={api} />);
      await screen.findByText("No Music sources registered.");
      await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
      await user.clear(screen.getByLabelText("Pear address"));
      await user.type(screen.getByLabelText("Pear address"), httpsConfig.baseUrl);
      await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
      return user;
    }

    it("requires the user to accept the certificate before Pear approval and saves the accepted certificate", async () => {
      const api = createApi({
        beginMusicPairing: vi.fn(async () => review),
        acceptMusicPairingCertificate: vi.fn(async () => accepted),
        getMusicPairing: vi.fn(async () => ({ ...accepted, status: "approved" as const }))
      });
      const user = await startPairing(api);
      const dialog = await screen.findByRole("dialog", { name: "Trust Pear Desktop's certificate?" });
      expect(dialog).toHaveTextContent(sha256);
      expect(dialog).toHaveTextContent("self-signed certificate");
      expect(screen.getByText("Pear approval: Review Pear Desktop's certificate to continue")).toBeInTheDocument();
      expect(api.acceptMusicPairingCertificate).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Trust certificate and pair" }));
      await waitFor(() => expect(api.acceptMusicPairingCertificate).toHaveBeenCalledWith("pair_cert", sha256));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(await screen.findByText("Pear approval: approved", {}, { timeout: 3_000 })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Test connection" }));
      await waitFor(() => expect(api.validateProvider).toHaveBeenCalledWith({ kind: "pear-desktop", name: "Pear Desktop", configuration: pinned, pairingAttemptId: "pair_cert" }));
    });

    it("cancels pairing when the user declines the certificate", async () => {
      const api = createApi({ beginMusicPairing: vi.fn(async () => review), acceptMusicPairingCertificate: vi.fn(async () => accepted) });
      const user = await startPairing(api);
      const dialog = await screen.findByRole("dialog", { name: "Trust Pear Desktop's certificate?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel pairing" }));
      await waitFor(() => expect(api.cancelMusicPairing).toHaveBeenCalledWith("pair_cert"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.acceptMusicPairingCertificate).not.toHaveBeenCalled();
    });

    it("explains when a previously accepted certificate changed", async () => {
      const api = createApi({ beginMusicPairing: vi.fn(async () => ({ ...review, certificate: { ...review.certificate!, replacesTrusted: true } })) });
      await startPairing(api);
      expect(await screen.findByRole("dialog", { name: "Pear Desktop's certificate changed" })).toHaveTextContent("different self-signed certificate");
    });

    it("shows the HTTPS address when pairing from the default HTTP address finds Pear serving TLS", async () => {
      const api = createApi({ beginMusicPairing: vi.fn(async () => review) });
      const user = userEvent.setup();
      render(<MusicSourcesPage api={api} />);
      await screen.findByText("No Music sources registered.");
      await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
      await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
      expect(api.beginMusicPairing).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:26538", transport: "auto" });
      expect(await screen.findByRole("dialog", { name: "Trust Pear Desktop's certificate?" })).toHaveTextContent(httpsConfig.baseUrl);
      expect(screen.getByLabelText("Pear address")).toHaveValue(httpsConfig.baseUrl);
    });
  });

  it.each(["denied", "expired"] as const)("keeps %s pairing incomplete and offers a retry", async outcome => {
    const api = createApi({ beginMusicPairing: vi.fn(async () => ({ attemptId: "pair_123", status: outcome, expiresAt: "2026-10-04T12:00:00.000Z", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" as const }, certificate: null })) });
    const user = userEvent.setup();
    render(<MusicSourcesPage api={api} />);
    await screen.findByText("No Music sources registered.");
    await user.click(screen.getByRole("button", { name: "Add Pear Desktop" }));
    await user.click(screen.getByRole("button", { name: "Pair Pear Desktop" }));
    expect(await screen.findByText(`Pear approval: ${outcome}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
    expect(screen.getByText(/Start a new pairing request and approve it/u)).toBeInTheDocument();
  });

  it("discards a late detail response after choosing another source", async () => {
    const second = { ...provider, id: "provider-2", name: "Pear Desk", active: false };
    let resolveFirst!: (value: { provider: typeof provider; configuration: { baseUrl: string; transport: "auto" }; availableVoices: []; ttsSafety: null }) => void;
    const first = new Promise<{ provider: typeof provider; configuration: { baseUrl: string; transport: "auto" }; availableVoices: []; ttsSafety: null }>(resolve => { resolveFirst = resolve; });
    const api = createApi({
      listRegisteredProviders: vi.fn(async () => [provider, second]),
      getProvider: vi.fn(async id => id === provider.id ? first : { provider: second, configuration: { baseUrl: "http://127.0.0.1:26539", transport: "auto" as const }, availableVoices: [], ttsSafety: null })
    });
    const user = userEvent.setup();
    render(<MusicSourcesPage api={api} />);
    await screen.findByRole("button", { name: "Pear Desk" });
    await user.click(screen.getByRole("button", { name: "Pear Desk" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Pear address" })).toHaveValue("http://127.0.0.1:26539"));
    resolveFirst({ provider, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "auto" }, availableVoices: [], ttsSafety: null });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Pear address" })).toHaveValue("http://127.0.0.1:26539"));
  });

  it("refreshes live status within five seconds, retains stale state, and stops after unmount", async () => {
    vi.useFakeTimers();
    try {
      const getMusicStatus = vi.fn().mockResolvedValueOnce({ ...status, enabled: true, status: { state: "connected", stale: false, diagnosticReference: null } }).mockRejectedValueOnce(new Error("service offline"));
      const api = createApi({ getMusicStatus });
      const mounted = render(<MusicSourcesPage api={api} />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText("connected")).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(4_000); await Promise.resolve(); });
      expect(getMusicStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/connected — status stale/u)).toBeInTheDocument();
      mounted.unmount();
      await act(async () => { vi.advanceTimersByTime(8_000); await Promise.resolve(); });
      expect(getMusicStatus).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("shows auth-required state independently from available source registration", async () => {
    const api = createApi({ listRegisteredProviders: vi.fn(async () => [provider]), getMusicStatus: vi.fn(async () => ({ ...status, enabled: true, selectedProviderId: provider.id, status: { state: "auth-required" as const, stale: false, diagnosticReference: "ref_123" } })) });
    render(<MusicSourcesPage api={api} />);
    expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent("Pear authorization is required");
    expect(screen.getByRole("button", { name: "Reconnect source" })).toBeInTheDocument();
    expect(screen.getByText("ref_123")).toBeInTheDocument();
  });
});
