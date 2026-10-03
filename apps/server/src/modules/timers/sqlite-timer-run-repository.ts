import type { DatabaseSync } from "node:sqlite";
import { timerRunStateSchema, type TimerRunState } from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

export interface TimerRunRepository {
  list(): readonly TimerRunState[];
  replace(states: readonly TimerRunState[]): void;
}
export class SqliteTimerRunRepository implements TimerRunRepository {
  constructor(private readonly connection: DatabaseSync) {}
  list(): readonly TimerRunState[] {
    return this.connection.prepare("SELECT state_json FROM timer_run_recovery ORDER BY timer_id").all()
      .map(row => timerRunStateSchema.parse(JSON.parse(String(row.state_json))));
  }
  replace(states: readonly TimerRunState[]): void {
    const parsed = timerRunStateSchema.array().parse(states);
    runInTransaction(this.connection, () => {
      this.connection.prepare("DELETE FROM timer_run_recovery").run();
      const insert = this.connection.prepare("INSERT INTO timer_run_recovery(timer_id, state_json) VALUES (?, ?)");
      for (const state of parsed) insert.run(state.definitionId, JSON.stringify(state));
    });
  }
}
