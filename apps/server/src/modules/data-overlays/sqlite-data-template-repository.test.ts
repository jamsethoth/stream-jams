import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataOverlayService, DataTemplateService, bundledDataTemplates, type DataTemplate } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, openStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteDataOverlayRepository } from "./sqlite-data-overlay-repository.js";
import { SqliteDataTemplateRepository } from "./sqlite-data-template-repository.js";
import { SqliteConfigurationSnapshotRepository } from "../backup/sqlite-configuration-snapshot-repository.js";

const databases: StreamJamsDatabase[] = []; afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture(database = createInMemoryStreamJamsDatabase()) {
  databases.push(database); let id = 0; const publish = vi.fn();
  if (!database.connection.prepare("SELECT id FROM alert_collections LIMIT 1").get()) database.connection.prepare("INSERT INTO alert_collections VALUES (?,?,?)").run("default","Default",1);
  const options = { generateId: () => `id-${++id}`, now: () => "2026-10-08T00:00:00Z", publish, resolveImageAsset: (id: string) => database.connection.prepare("SELECT media_type FROM asset_metadata WHERE id=?").get(id)?.media_type === "image" };
  const overlays = new DataOverlayService(new SqliteDataOverlayRepository(database), options);
  const repository = new SqliteDataTemplateRepository(database); const service = new DataTemplateService(repository, overlays, options);
  return { database, overlays, repository, service, publish };
}
const input = { name: "Canvas", enabled: true, order: 0, outputs: { browser: true, desktop: false }, mappings: [{slotId:"count",mapping:{kind:"new-value" as const,definition:{name:"Count",kind:"integer" as const,resetDefault:0,resetGroupId:null}}}] };

describe("durable data templates and backup", () => {
  it("persists user templates across reopen and rejects duplicate names atomically", () => {
    const folder = mkdtempSync(join(tmpdir(), "data-templates-")); const path = join(folder,"data.sqlite");
    try {
      const first = fixture(openStreamJamsDatabase(path)); const state = first.service.instantiate("counter-badge", input);
      const saved = first.service.save({ name: "Saved", canvasId: state.canvases[0]!.id });
      expect(() => first.service.save({ name: " saved ", canvasId: state.canvases[0]!.id })).toThrow("name");
      first.database.close(); databases.splice(databases.indexOf(first.database),1);
      const second = fixture(openStreamJamsDatabase(path)); expect(second.service.getCatalog()).toEqual(saved); expect(second.overlays.getState()).toEqual(state);
      second.database.close(); databases.splice(databases.indexOf(second.database),1);
    } finally { rmSync(folder,{recursive:true,force:true}); }
  });
  it("rolls back new value+goal if SQL reference or canvas validation fails", () => {
    const { overlays, service, publish } = fixture(); const before = overlays.getState();
    expect(() => service.instantiate("counter-badge", { ...input, mappings: [{ ...input.mappings[0]!, mapping: {kind:"new-value",definition:{...input.mappings[0]!.mapping.definition,resetGroupId:"gone"}}}] })).toThrow();
    expect(overlays.getState()).toEqual(before); expect(publish).not.toHaveBeenCalled();
  });
  it("allows removed template asset metadata, preserves a flagged element with null normalized FK and backup roundtrip", () => {
    const f = fixture(); const db = f.database.connection;
    db.prepare("INSERT INTO asset_metadata (id,original_file_name,media_type,mime_type,size_bytes,checksum,storage_path,duration_ms) VALUES (?,?,?,?,?,?,?,?)").run("removed","tiny.png","image","image/png",8,`sha256:${"a".repeat(64)}`,"tiny.png",null);
    const state = f.overlays.createCanvas({name:"Original",enabled:true,order:0,targetProfileId:"landscape",outputs:{browser:true,desktop:false},elements:[{id:"original-image",kind:"image",assetId:"removed",fit:"contain",order:0,x:0,y:0,width:10,height:10,visible:true,stalePolicy:"retain-last"}]});
    const saved = f.service.save({name:"Image template",canvasId:state.canvases[0]!.id}).templates.find(t=>t.origin==="user")!;
    f.overlays.deleteCanvas(state.canvases[0]!.id); db.prepare("DELETE FROM asset_metadata WHERE id=?").run("removed");
    const copied = f.service.instantiate(saved.id,{...input,name:"Missing",mappings:[]});
    expect(copied.canvases[0]!.elements[0]).toMatchObject({kind:"missing-image",sourceAssetId:"removed"});
    expect(db.prepare("SELECT asset_id FROM data_element_refs").get()?.asset_id).toBeNull();
    const backup = new SqliteConfigurationSnapshotRepository(db); const snapshot = backup.snapshot();
    expect(snapshot.tables.data_templates).toHaveLength(1); expect(JSON.stringify(snapshot.tables.data_templates)).not.toContain("counter-badge");
    expect(backup.validate({appConfig:{},...snapshot})).toEqual([]);
    const point = backup.captureRestorePoint(); f.service.delete(saved.id); backup.replace({tables:snapshot.tables,assets:[]});
    expect(f.repository.read()).toEqual([saved]); expect(f.overlays.getState().canvases[0]?.enabled).toBe(false);
    expect(f.overlays.getState().canvases[0]?.elements).toEqual(copied.canvases[0]?.elements);
    backup.restoreRestorePoint(point); expect(f.overlays.getState()).toEqual(copied); expect(f.repository.read()).toEqual([saved]);
    const { data_templates: _templates, ...legacy } = snapshot.tables; expect(_templates).toHaveLength(1); backup.replace({tables:legacy,assets:[]}); expect(f.repository.read()).toEqual([]);
  });
  it("rejects bundled/secret-bearing/inconsistent template backup rows without altering saved data", () => {
    const f = fixture(); const backup = new SqliteConfigurationSnapshotRepository(f.database.connection); const snapshot = backup.snapshot();
    const valid: DataTemplate = {...structuredClone(bundledDataTemplates[0]!),id:"saved",origin:"user",name:"Saved"};
    for (const document of [bundledDataTemplates[0]!,{...valid,content:37},{...valid,slots:[{...valid.slots[0],requiredSource:{provider:"twitch",kind:"follower-total",broadcasterId:"private"}}]}]) {
      const tables = {...snapshot.tables,data_templates:[{id:"saved",name_key:"saved",document:JSON.stringify(document)}]};
      expect(backup.validate({appConfig:{},...snapshot,tables}).some(error=>error.includes("template"))).toBe(true);
      expect(() => backup.replace({tables,assets:[]})).toThrow(); expect(f.repository.read()).toEqual([]);
    }
  });
});
