import type { DataOverlayService, DataSourceStatus, SecretStore, TwitchDataSourceStatus } from "@stream-jams/core";
import { TwitchApiHttpError, type TwitchDataApiClient } from "./twitch-api-client.js";
import type { TwitchAccountRepository } from "./twitch-account-repository.js";
import { createTwitchTokenSecretRef } from "./twitch-oauth-service.js";

/** Polls authoritative state only. Event hints must eventually come from the central bus. */
export class TwitchDataSourceRuntime {
  #epoch = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #suspended = false;
  #failures = 0;
  #staleSince: number | null = null;
  #lastAttempt = -Infinity;
  #notBefore = 0;
  #fingerprint = "";
  #inFlightEpoch: number | null = null;
  readonly #work = new Set<Promise<void>>();
  #ownedIds = new Set<string>();
  #status: TwitchDataSourceStatus = { follower: { state: "unconfigured", broadcasterId: null, valueIds: [], updatedAt: null }, goals: { state: "disconnected", missingScopes: [] } };
  constructor(private readonly dependencies: {
    service: DataOverlayService; repository: TwitchAccountRepository; secretStore: SecretStore;
    clientId: string; apiClient: TwitchDataApiClient; now?: () => number;
    setStatus(valueId: string, status: DataSourceStatus | null): void;
    validateAccount?(): Promise<void>;
    onError?(error: unknown): void;
  }) {
    for (const value of dependencies.service.getState().values) if (value.source) { this.#ownedIds.add(value.id); dependencies.setStatus(value.id, { state: "invalid" }); }
  }
  getStatus(): TwitchDataSourceStatus { return structuredClone(this.#status); }
  /** Configuration changes are explicit; no configured source means no Helix work. */
  reconcile(): void {
    const fingerprint = JSON.stringify(this.dependencies.service.getState().values.filter(value => value.source).map(value => [value.id, value.source]));
    if (fingerprint === this.#fingerprint || this.#closed || this.#suspended) return;
    this.#fingerprint = fingerprint;
    this.#launch(() => this.connectionChanged());
  }
  async createFollowerSource(name: string) {
    const account = await this.dependencies.repository.findConnectedAccount();
    if (!account) throw new TypeError("Connect Twitch before selecting a source");
    if (this.#closed) throw new TypeError("Source runtime is closed");
    const state = this.dependencies.service.createTwitchFollowerValue(name, account.accountId);
    this.reconcile();
    return state;
  }
  async connectionChanged(): Promise<void> {
    if (this.#closed || this.#suspended) return;
    const epoch = ++this.#epoch;
    clearTimeout(this.#timer);
    this.#failures = 0; this.#staleSince = null; this.#notBefore = 0;
    const sources = this.dependencies.service.getState().values.filter(value => value.source);
    const currentIds = new Set(sources.map(value => value.id));
    for (const id of this.#ownedIds) if (!currentIds.has(id)) this.dependencies.setStatus(id, null);
    this.#ownedIds = currentIds;
    this.#fingerprint = JSON.stringify(sources.map(value => [value.id, value.source]));
    for (const value of sources) this.dependencies.setStatus(value.id, { state: "invalid" });
    const account = await this.dependencies.repository.findConnectedAccount();
    if (this.#closed || epoch !== this.#epoch) return;
    if (account) this.dependencies.service.invalidateTwitchBindingsExcept(account.accountId);
    if (epoch !== this.#epoch) return;
    this.#status.goals = !account ? { state: "disconnected", missingScopes: [] }
      : account.scopes.includes("channel:read:goals") ? { state: "blocked-event-bus", missingScopes: [] }
      : { state: "reauthorization-required", missingScopes: ["channel:read:goals"] };
    const matches = this.dependencies.service.getState().values.filter(value => value.source !== undefined && value.source.broadcasterId === account?.accountId && !value.source.invalidated);
    this.#status.follower = { state: sources.length === 0 ? "unconfigured" : !account ? "disconnected" : "invalid", broadcasterId: account?.accountId ?? null, valueIds: matches.map(value => value.id), updatedAt: null };
    if (account && matches.length > 0) await this.#refresh(epoch, account.accountId);
  }
  /** Future bus consumer hook, deliberately not wired to private EventSub intake. */
  requestEarlyRefresh(): void {
    const broadcasterId = this.#status.follower.broadcasterId;
    if (!broadcasterId || this.#status.follower.valueIds.length === 0 || this.#closed || this.#suspended) return;
    this.#schedule(Math.max(this.#now(), this.#lastAttempt + 10_000, this.#notBefore), this.#epoch, broadcasterId);
  }
  #now(): number { return (this.dependencies.now ?? Date.now)(); }
  #launch(work: () => Promise<void>): void {
    const result = work().catch((error: unknown) => {
      // error-provenance: allow expected -- background producer failures are diagnosed without exposing provider payloads
      this.#report(error);
    });
    this.#work.add(result);
    void result.finally(() => this.#work.delete(result));
  }
  #report(error: unknown): void {
    try { this.dependencies.onError?.(error); }
    // error-provenance: allow expected -- diagnostics cannot turn background source errors into unhandled failures
    catch { /* Original source status already describes the failure. */ }
  }
  #schedule(deadline: number, epoch: number, broadcasterId: string): void {
    clearTimeout(this.#timer);
    const delay = Math.min(2_147_483_647, Math.max(0, deadline - this.#now()));
    this.#timer = setTimeout(() => {
      if (epoch !== this.#epoch || this.#closed) return;
      if (this.#now() < deadline) this.#schedule(deadline, epoch, broadcasterId);
      else this.#launch(() => this.#refresh(epoch, broadcasterId));
    }, delay);
    this.#timer.unref();
  }
  async #refresh(epoch: number, broadcasterId: string): Promise<void> {
    if (this.#closed || epoch !== this.#epoch) return;
    if (this.#inFlightEpoch === epoch) { this.#schedule(this.#now() + 10_000, epoch, broadcasterId); return; }
    this.#inFlightEpoch = epoch;
    this.#lastAttempt = this.#now();
    try {
      await this.dependencies.validateAccount?.();
      const account = await this.dependencies.repository.findConnectedAccount();
      if (!account || account.accountId !== broadcasterId || epoch !== this.#epoch || this.#closed) return;
      const accessToken = await this.dependencies.secretStore.getSecret(createTwitchTokenSecretRef(broadcasterId, "access_token"));
      if (epoch !== this.#epoch || this.#closed) return;
      if (accessToken === null) throw new TypeError("Twitch access token unavailable");
      const result = await this.dependencies.apiClient.getFollowerTotal({ accessToken, broadcasterId, clientId: this.dependencies.clientId });
      if (epoch !== this.#epoch || this.#closed) return;
      const current = await this.dependencies.repository.findConnectedAccount();
      if (epoch !== this.#epoch || this.#closed || current?.accountId !== broadcasterId) return;
      this.dependencies.service.replaceTwitchFollowerTotal(broadcasterId, result.total);
      this.#failures = 0; this.#staleSince = null;
      this.#status.follower.state = "current";
      this.#status.follower.updatedAt = new Date(this.#now()).toISOString();
      for (const id of this.#status.follower.valueIds) this.dependencies.setStatus(id, { state: "current" });
      this.#notBefore = Math.max(this.#now() + 10_000, result.rateResetEpochMs ?? 0);
      this.#schedule(Math.max(this.#now() + 60_000, this.#notBefore), epoch, broadcasterId);
    } catch (error) {
      if (epoch !== this.#epoch || this.#closed) return;
      this.#staleSince ??= this.#now();
      this.#status.follower.state = "stale";
      // Persisted values have no trust before this epoch's first successful fetch.
      for (const id of this.#status.follower.valueIds) this.dependencies.setStatus(id, this.#status.follower.updatedAt === null ? { state: "invalid" } : { state: "stale", staleSinceEpochMs: this.#staleSince });
      const backoff = Math.min(300_000, 10_000 * 2 ** Math.min(this.#failures++, 5));
      this.#notBefore = Math.max(this.#now() + backoff, error instanceof TwitchApiHttpError ? error.rateResetEpochMs ?? 0 : 0, this.#now() + (error instanceof TwitchApiHttpError ? error.retryAfterMs ?? 0 : 0));
      this.#schedule(this.#notBefore, epoch, broadcasterId);
      this.#report(error);
    } finally {
      if (this.#inFlightEpoch === epoch) this.#inFlightEpoch = null;
    }
  }
  async close(): Promise<void> { this.#closed = true; ++this.#epoch; clearTimeout(this.#timer); await Promise.allSettled(this.#work); }
  suspendForMaintenance(): void {
    this.#suspended = true; ++this.#epoch; clearTimeout(this.#timer);
    for (const value of this.dependencies.service.getState().values) if (value.source) this.dependencies.setStatus(value.id, { state: "invalid" });
    this.#status.follower.state = this.#status.follower.valueIds.length === 0 ? "unconfigured" : "invalid";
    this.#status.follower.updatedAt = null;
  }
  async resumeAfterMaintenance(): Promise<void> { this.#suspended = false; await this.connectionChanged(); }
}
