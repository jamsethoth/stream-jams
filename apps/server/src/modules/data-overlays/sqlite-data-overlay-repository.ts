import { dataOverlayStateSchema, type DataOverlayRepository, type DataOverlayState } from "@stream-jams/core";
import { runInTransaction, type StreamJamsDatabase } from "../db/database.js";
/** JSON stores typed presentation fields; all identity references are normalized FKs. */
export class SqliteDataOverlayRepository implements DataOverlayRepository {
  constructor(private readonly database: StreamJamsDatabase) {}
  read(): DataOverlayState {
    const db = this.database.connection;
    const documents = (table: string) => db.prepare(`SELECT document FROM ${table} ORDER BY rowid`).all().map(row => JSON.parse(String(row.document)) as unknown);
    return dataOverlayStateSchema.parse({ revision: db.prepare("SELECT revision FROM data_overlay_meta WHERE id=1").get()!.revision, values: documents("data_values"), goals: documents("data_goals"), resetGroups: documents("data_reset_groups"), canvases: documents("data_canvases"), pinnedValueIds: db.prepare("SELECT value_id FROM data_pins ORDER BY position").all().map(row => String(row.value_id)) });
  }
  mutate(work: (draft: DataOverlayState) => void): DataOverlayState {
    return runInTransaction(this.database.connection, () => {
      const state = this.read();
      work(state);
      const committed = dataOverlayStateSchema.parse(state);
      const db = this.database.connection;
      // Replace this bounded catalog inside the transaction in dependency order.
      db.exec("DELETE FROM data_element_refs; DELETE FROM data_pins; DELETE FROM data_goals; DELETE FROM data_values; DELETE FROM data_reset_groups; DELETE FROM data_canvases;");
      const key = (name: string) => name.trim().toLowerCase();
      for (const group of committed.resetGroups) db.prepare("INSERT INTO data_reset_groups VALUES (?,?,?)").run(group.id,key(group.name),JSON.stringify(group));
      for (const value of committed.values) db.prepare("INSERT INTO data_values VALUES (?,?,?,?)").run(value.id,key(value.name),value.resetGroupId,JSON.stringify(value));
      for (const goal of committed.goals) db.prepare("INSERT INTO data_goals VALUES (?,?,?,?)").run(goal.id,key(goal.name),goal.valueId,JSON.stringify(goal));
      for (const canvas of committed.canvases) {
        db.prepare("INSERT INTO data_canvases VALUES (?,?,?)").run(canvas.id,key(canvas.name),JSON.stringify(canvas));
        for (const element of canvas.elements) {
          const binding = element.kind === "text" ? element.binding : element.kind === "progress" ? { kind: "goal" as const, goalId: element.goalId } : null;
          db.prepare("INSERT INTO data_element_refs VALUES (?,?,?,?,?)").run(canvas.id,element.id,binding?.kind === "value" ? binding.valueId : null,binding?.kind === "goal" ? binding.goalId : null,element.kind === "image" ? element.assetId : null);
        }
      }
      committed.pinnedValueIds.forEach((id,index) => db.prepare("INSERT INTO data_pins VALUES (?,?)").run(id,index));
      db.prepare("UPDATE data_overlay_meta SET revision=? WHERE id=1").run(committed.revision);
      return committed;
    });
  }
}
