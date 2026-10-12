import type { TwitchCreatorGoal } from "./twitch-api-client.js";

export type TwitchGoalBinding = { mode: "active-type"; type: string } | { mode: "pinned"; goalId: string };
const supportedTypes = ["follower", "subscription", "subscription_count", "new_subscription", "new_subscription_count"];
export function twitchGoalUnits(type: string): "followers" | "sub points" | "subscriptions" | "unsupported" {
  if (type === "follower") return "followers";
  if (type === "subscription" || type === "new_subscription") return "sub points";
  if (type === "subscription_count" || type === "new_subscription_count") return "subscriptions";
  return "unsupported";
}
export function selectTwitchGoal(goals: readonly TwitchCreatorGoal[], binding: TwitchGoalBinding): TwitchCreatorGoal | null {
  const matches = goals.filter(goal => supportedTypes.includes(goal.type) && (binding.mode === "pinned" ? goal.id === binding.goalId : goal.type === binding.type));
  return [...matches].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || a.id.localeCompare(b.id))[0] ?? null;
}
export type TwitchGoalSnapshotUpdate = { kind: "upsert"; goal: TwitchCreatorGoal; occurredAtEpochMs: number } | { kind: "end"; goalId: string; occurredAtEpochMs: number };

/** Reconciles live updates with authoritative snapshots and ignores journal replay. */
export class TwitchGoalSnapshotState {
  #epoch = 0;
  #snapshotAt: number | null = null;
  #buffer: TwitchGoalSnapshotUpdate[] = [];
  #overflow = false;
  #goals = new Map<string, TwitchCreatorGoal>();
  #lastEvent = new Map<string, number>();
  #watermark = -Infinity;
  #ended = new Set<string>();
  beginSnapshot(startedAtEpochMs: number): number {
    ++this.#epoch; this.#snapshotAt = startedAtEpochMs; this.#buffer = []; this.#overflow = false;
    return this.#epoch;
  }
  invalidate(clear = true): void {
    ++this.#epoch; this.#snapshotAt = null; this.#buffer = [];
    if (clear) { this.#goals.clear(); this.#lastEvent.clear(); this.#ended.clear(); this.#watermark = -Infinity; }
  }
  get epoch(): number { return this.#epoch; }
  cancelSnapshot(epoch: number): void {
    if (epoch !== this.#epoch) return;
    this.#snapshotAt = null;
    for (const update of this.#buffer.sort((a, b) => a.occurredAtEpochMs - b.occurredAtEpochMs)) this.#apply(update);
    this.#buffer = [];
  }
  update(epoch: number, update: TwitchGoalSnapshotUpdate): void {
    if (epoch !== this.#epoch || !Number.isFinite(update.occurredAtEpochMs)) return;
    // Ends must hide immediately, even while a snapshot is pending or its buffer is full.
    if (update.kind === "end") this.#apply(update);
    if (this.#snapshotAt !== null) {
      if (this.#buffer.length >= 100) { this.#overflow = true; return; }
      this.#buffer.push(structuredClone(update));
    } else this.#apply(update);
  }
  finishSnapshot(epoch: number, goals: readonly TwitchCreatorGoal[]): "applied" | "obsolete" | "resnapshot-required" {
    if (epoch !== this.#epoch || this.#snapshotAt === null) return "obsolete";
    if (this.#overflow) return "resnapshot-required";
    const snapshotAt = this.#snapshotAt;
    this.#goals = new Map(goals.filter(goal => !this.#ended.has(goal.id)).map(goal => [goal.id, structuredClone(goal)]));
    this.#watermark = Math.max(this.#watermark, snapshotAt);
    this.#snapshotAt = null;
    // Equal timestamps cannot safely prove an event is older than the response.
    for (const update of this.#buffer.filter(update => update.occurredAtEpochMs >= snapshotAt).sort((a, b) => a.occurredAtEpochMs - b.occurredAtEpochMs)) this.#apply(update);
    this.#buffer = [];
    return "applied";
  }
  #apply(update: TwitchGoalSnapshotUpdate): void {
    const id = update.kind === "upsert" ? update.goal.id : update.goalId;
    if (update.occurredAtEpochMs < this.#watermark || (update.kind === "upsert" && this.#ended.has(id))) return;
    if ((this.#lastEvent.get(id) ?? -Infinity) > update.occurredAtEpochMs) return;
    this.#lastEvent.set(id, update.occurredAtEpochMs);
    if (update.kind === "end") { this.#ended.add(id); this.#goals.delete(id); }
    else this.#goals.set(id, structuredClone(update.goal));
  }
  list(): TwitchCreatorGoal[] { return structuredClone([...this.#goals.values()]); }
}
