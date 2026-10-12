import type { BusEvent, DataOverlayService, DataSourceStatus, TwitchDataSourceStatus } from "@stream-jams/core";
import { TwitchApiHttpError, TwitchApiResponseError, type TwitchDataApiClient } from "./twitch-api-client.js";
import type { TwitchAccount } from "./twitch-account-repository.js";
import type { TwitchEventSubStatus } from "./twitch-eventsub-client.js";
import { selectTwitchGoal, TwitchGoalSnapshotState, twitchGoalUnits } from "./twitch-goal-snapshot.js";

const requiredSubscriptions = ["channel.goal.begin", "channel.goal.progress", "channel.goal.end"];
export class TwitchGoalSourceRuntime {
  #epoch = 0;
  #account: TwitchAccount | null = null;
  #ready = false;
  #session = "";
  #closed = false;
  #inFlight = false;
  #failures = 0;
  #staleSince: number | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #expiry: ReturnType<typeof setTimeout> | undefined;
  readonly #snapshot = new TwitchGoalSnapshotState();
  readonly #work = new Set<Promise<void>>();
  #status: TwitchDataSourceStatus["goals"] = { state: "disconnected", missingScopes: [], broadcasterId: null, updatedAt: null, activeGoals: [], bindings: [] };
  constructor(private readonly dependencies: {
    service: DataOverlayService; apiClient: TwitchDataApiClient; clientId: string;
    getAccessToken(broadcasterId: string): Promise<string | null>;
    setStatus(id: string, status: DataSourceStatus | null): void;
    now(): number; onError(error: unknown): void;
  }) {}
  getStatus(): TwitchDataSourceStatus["goals"] { return structuredClone(this.#status); }
  configure(account: TwitchAccount | null): void {
    const accountChanged = account?.accountId !== this.#account?.accountId;
    if (accountChanged) { this.#ready = false; this.#session = ""; }
    this.#invalidate(accountChanged); this.#account = account;
    this.#status = { state: !account ? "disconnected" : !account.scopes.includes("channel:read:goals") ? "reauthorization-required" : "waiting", missingScopes: account && !account.scopes.includes("channel:read:goals") ? ["channel:read:goals"] : [], broadcasterId: account?.accountId ?? null, updatedAt: null, activeGoals: [], bindings: [] };
    this.reconcile();
    if (this.#ready && account?.scopes.includes("channel:read:goals")) this.#launchSnapshot();
  }
  statusChanged(status: TwitchEventSubStatus): void {
    const ready = status.state === "connected" && requiredSubscriptions.every(type => status.subscriptionTypes.includes(type));
    const session = `${status.sessionId ?? ""}:${status.state}:${ready}:${status.goalSubscriptionFailure ?? ""}`;
    if (session === this.#session || this.#closed) return;
    this.#session = session; this.#ready = ready;
    this.#invalidate();
    if (!this.#account || !this.#account.scopes.includes("channel:read:goals")) return;
    if (ready) { this.#status.state = "waiting"; this.reconcile(); this.#launchSnapshot(); }
    else { this.#markUnavailable(status.goalSubscriptionFailure === "reauthorization-required" ? "reauthorization-required" : status.state === "connected" ? this.#status.updatedAt === null ? "error" : "stale" : "disconnected"); }
  }
  reconcile(): void {
    const values = this.dependencies.service.getState().values.filter(value => value.source?.kind === "creator-goal");
    const goals = this.dependencies.service.getState().goals;
    const updates: { valueId: string; currentAmount: number; targetAmount: number }[] = [];
    const statuses: { id: string; status: DataSourceStatus }[] = [];
    this.#status.activeGoals = this.#snapshot.list();
    this.#status.bindings = values.flatMap(value => {
      if (value.source?.kind !== "creator-goal") return [];
      const goal = goals.find(candidate => candidate.valueId === value.id && candidate.source?.kind === "creator-goal");
      if (!goal) { this.dependencies.setStatus(value.id, { state: "invalid" }); return []; }
      const invalid = value.source.invalidated || value.source.broadcasterId !== this.#account?.accountId;
      const selected = invalid ? null : selectTwitchGoal(this.#status.activeGoals, value.source.binding);
      const state = invalid ? "invalid" : this.#status.state === "current" ? selected ? "current" : "ended" : this.#status.state === "stale" && !selected ? "ended" : this.#status.state;
      if (selected && state === "current" && (value.content !== selected.current_amount || goal.mode !== "fixed-target" || goal.target !== selected.target_amount)) updates.push({ valueId: value.id, currentAmount: selected.current_amount, targetAmount: selected.target_amount });
      const output: DataSourceStatus = state === "current" ? { state: "current" } : state === "stale" && this.#staleSince !== null ? { state: "stale", staleSinceEpochMs: this.#staleSince } : state === "ended" ? { state: "ended" } : { state: "invalid" };
      statuses.push({ id: value.id, status: output });
      return [{ goalId: goal.id, valueId: value.id, selectedGoalId: selected?.id ?? null, state, units: selected ? twitchGoalUnits(selected.type) : value.source.binding.mode === "active-type" ? twitchGoalUnits(value.source.binding.type) : "unsupported" as const }];
    });
    if (updates.length && this.#account) this.dependencies.service.applyTwitchCreatorGoals(this.#account.accountId, updates);
    for (const { id, status } of statuses) this.dependencies.setStatus(id, status);
  }
  handle(event: BusEvent): boolean {
    if (this.#closed || !this.#ready || !this.#account || event.kind !== "canonical" || event.sourceKind !== "twitch") return false;
    const goal = event.event;
    if (goal.type !== "goal_begin" && goal.type !== "goal_progress" && goal.type !== "goal_end") return false;
    if (goal.broadcasterId !== this.#account.accountId) return false;
    const occurredAtEpochMs = Date.parse(goal.occurredAt);
    this.#snapshot.update(this.#snapshot.epoch, goal.type === "goal_end" ? { kind: "end", goalId: goal.goalId, occurredAtEpochMs } : { kind: "upsert", occurredAtEpochMs, goal: { id: goal.goalId, broadcaster_id: goal.broadcasterId, broadcaster_name: this.#account.displayName, broadcaster_login: this.#account.login, type: goal.goalType, description: goal.description, current_amount: goal.currentAmount, target_amount: goal.targetAmount, started_at: goal.startedAt } });
    if ((!this.#inFlight || goal.type === "goal_end") && this.#status.updatedAt !== null) this.reconcile();
    return true;
  }
  #invalidate(clear = false): void { ++this.#epoch; clearTimeout(this.#timer); clearTimeout(this.#expiry); this.#snapshot.invalidate(clear); this.#inFlight = false; this.#failures = 0; }
  #launchSnapshot(): void {
    if (this.#closed || !this.#ready || this.#inFlight || !this.#account?.scopes.includes("channel:read:goals")) return;
    const work = this.#refresh(this.#epoch, this.#account);
    this.#work.add(work); void work.finally(() => this.#work.delete(work));
  }
  #schedule(deadline: number, epoch: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (this.#closed || epoch !== this.#epoch) return;
      if (this.dependencies.now() < deadline) this.#schedule(deadline, epoch); else this.#launchSnapshot();
    }, Math.min(2_147_483_647, Math.max(0, deadline - this.dependencies.now())));
    this.#timer.unref();
  }
  async #refresh(epoch: number, account: TwitchAccount): Promise<void> {
    this.#inFlight = true;
    const snapshotEpoch = this.#snapshot.beginSnapshot(this.dependencies.now());
    try {
      const accessToken = await this.dependencies.getAccessToken(account.accountId);
      if (epoch !== this.#epoch || this.#closed) return;
      if (!accessToken) throw new TypeError("Twitch access token unavailable");
      const result = await this.dependencies.apiClient.getCreatorGoals({ broadcasterId: account.accountId, accessToken, clientId: this.dependencies.clientId });
      if (epoch !== this.#epoch || this.#closed) return;
      if (result.goals.some(goal => goal.broadcaster_id !== account.accountId)) throw new TwitchApiResponseError();
      if (this.#snapshot.finishSnapshot(snapshotEpoch, result.goals) === "resnapshot-required") { this.#schedule(Math.max(this.dependencies.now(), result.rateResetEpochMs ?? 0), epoch); return; }
      this.#status.state = "current"; this.#status.missingScopes = []; this.#status.updatedAt = new Date(this.dependencies.now()).toISOString();
      this.#staleSince = null; this.#failures = 0; clearTimeout(this.#expiry); this.reconcile();
    } catch (error) {
      if (epoch !== this.#epoch || this.#closed) return;
      this.#snapshot.cancelSnapshot(snapshotEpoch);
      this.#markUnavailable(error instanceof TwitchApiHttpError && (error.status === 401 || error.status === 403) ? "reauthorization-required" : this.#status.updatedAt === null ? "error" : "stale");
      this.dependencies.onError(error);
      const delay = Math.min(300_000, 10_000 * 2 ** Math.min(this.#failures++, 5));
      this.#schedule(Math.max(this.dependencies.now() + delay, error instanceof TwitchApiHttpError ? error.rateResetEpochMs ?? 0 : 0, this.dependencies.now() + (error instanceof TwitchApiHttpError ? error.retryAfterMs ?? 0 : 0)), epoch);
    } finally { if (epoch === this.#epoch) this.#inFlight = false; }
  }
  #markUnavailable(state: TwitchDataSourceStatus["goals"]["state"]): void {
    this.#status.state = state;
    this.#status.missingScopes = state === "reauthorization-required" ? ["channel:read:goals"] : [];
    if (state === "stale") {
      this.#staleSince ??= this.dependencies.now();
      clearTimeout(this.#expiry);
      this.#expiry = setTimeout(() => { this.#status.state = "error"; this.reconcile(); }, Math.max(0, this.#staleSince + 600_001 - this.dependencies.now())); this.#expiry.unref();
    }
    this.reconcile();
  }
  suspend(): void { this.#ready = false; this.#session = ""; this.configure(null); }
  async close(): Promise<void> { this.#closed = true; this.#invalidate(); await Promise.allSettled(this.#work); }
}
