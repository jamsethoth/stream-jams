#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [repoArgument, outputArgument] = process.argv.slice(2);
if (repoArgument === undefined || outputArgument === undefined) {
  throw new Error("Usage: node generate-stream-jams-schema-explorer.mjs <repo-root> <output-html>");
}

const repoRoot = resolve(repoArgument);
const outputPath = resolve(outputArgument);
const migrationDirectory = resolve(repoRoot, "apps/server/src/modules/db/migrations");

const tableMetadata = {
  alert_collections: ["Alerts", "Defines named alert sets and identifies the single active set."],
  alert_rules: ["Alerts", "Stores event-level alert definitions shared across sets and variants."],
  alert_rule_collections: ["Alerts", "Maps alert rules to alert sets."],
  alert_rule_conditions: ["Alerts", "Stores ordered conditions that determine whether a rule matches an event."],
  alert_variants: ["Alerts", "Stores selectable visual, audio, text, TTS, layout, and condition variants."],
  alert_set_metadata: ["Alerts", "Stores starter review and landscape/vertical readiness for each alert set."],
  alert_rule_management_metadata: ["Alerts", "Stores provider, review state, and target profiles used by management UI."],
  alert_editor_documents: ["Alerts", "Stores the complete focused-editor document for either a rule or variant."],
  asset_metadata: ["Assets", "Stores immutable file identity, validation metadata, checksum, and storage path."],
  asset_library_metadata: ["Assets", "Adds user-editable names and tags to stored assets."],
  overlay_module_config: ["Outputs & config", "Stores per-module enablement and module-specific configuration."],
  overlay_keys: ["Outputs & config", "Stores scoped browser-source authorization without retaining raw route keys."],
  twitch_accounts: ["Providers", "Stores connected Twitch account identity and granted scopes."],
  provider_registrations: ["Providers", "Stores event-source and TTS provider configuration, validation, and state."],
  event_logs: ["Diagnostics", "Records normalized event ingestion status and processing context."],
  alert_match_logs: ["Diagnostics", "Records which rule and variant matched each source event."],
  playback_logs: ["Diagnostics", "Records queue and overlay playback outcomes for resolved alerts."],
  schema_migrations: ["System", "Tracks ordered schema migrations already applied."]
};

const columnNotes = {
  "overlay_module_config.config_json": "Module configuration JSON",
  "alert_rule_conditions.value_json": "JSON condition operand",
  "alert_variants.visual_asset_id": "Nullable logical asset reference; no foreign key",
  "alert_variants.audio_asset_id": "Nullable logical asset reference; no foreign key",
  "alert_variants.tts_config_json": "Nullable TTS configuration JSON",
  "alert_variants.layout_json": "Layout JSON",
  "alert_variants.conditions_json": "Condition array JSON",
  "overlay_keys.key_hash": "Hash only; raw route key is not stored",
  "overlay_keys.route_key_secret_ref_json": "Nullable secret-reference JSON",
  "event_logs.event_json": "Normalized event JSON",
  "playback_logs.alert_ids_json": "Resolved alert ID array JSON",
  "twitch_accounts.scopes_json": "Granted scope array JSON",
  "provider_registrations.non_secret_config_json": "Non-secret provider configuration JSON",
  "provider_registrations.secret_ref_json": "Nullable secret-reference JSON",
  "provider_registrations.error_json": "Nullable actionable-error JSON",
  "provider_registrations.available_voices_json": "Available voice array JSON",
  "provider_registrations.tts_safety_json": "Nullable TTS safety settings JSON",
  "alert_rule_management_metadata.target_profile_ids_json": "Target-profile ID array JSON",
  "asset_library_metadata.tags_json": "Tag array JSON",
  "alert_editor_documents.alert_id": "Trigger-validated rule XOR variant owner",
  "alert_editor_documents.document_json": "Complete editor document: layers, profiles, layouts, conditions, and samples"
};

const extraRelationships = [
  relation("alert_rules", "alert_editor_documents", "1", "0..1", "TRIGGER", "Polymorphic document owner", "Owner must be a rule XOR variant; validation and cleanup use triggers."),
  relation("alert_variants", "alert_editor_documents", "1", "0..1", "TRIGGER", "Polymorphic document owner", "Owner must be a rule XOR variant; validation and cleanup use triggers."),
  relation("asset_metadata", "alert_variants", "1", "many", "LOGICAL", "Variant media", "visual_asset_id and audio_asset_id are application references without foreign keys."),
  relation("overlay_module_config", "overlay_keys", "1", "many", "LOGICAL", "Module output keys", "module_id is an application reference without a foreign key."),
  relation("event_logs", "alert_match_logs", "1", "many", "LOGICAL", "Event match history", "source_event_id is retained without a foreign key."),
  relation("event_logs", "playback_logs", "1", "many", "LOGICAL", "Event playback history", "source_event_id is retained without a foreign key."),
  relation("alert_rules", "alert_match_logs", "1", "many", "LOGICAL", "Matched rule history", "rule_id is retained without a foreign key."),
  relation("alert_variants", "alert_match_logs", "1", "many", "LOGICAL", "Matched variant history", "variant_id is retained without a foreign key.")
];

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d{3}-.+\.ts$/u.test(name))
  .sort();
if (migrationFiles.length === 0) {
  throw new Error(`No migrations found in ${migrationDirectory}`);
}

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
database.exec(`
  CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )
`);

for (const migrationFile of migrationFiles) {
  const source = await readFile(resolve(migrationDirectory, migrationFile), "utf8");
  const match = /\bsql:\s*`([\s\S]*?)`\s*\n/u.exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`Could not extract SQL from ${migrationFile}`);
  }
  if (match[1].includes("${")) {
    throw new Error(`${migrationFile} contains interpolated SQL; update generator to import migrations safely.`);
  }
  database.exec(match[1]);
}

const tableRows = database.prepare(`
  SELECT name, sql
  FROM sqlite_schema
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

const tables = tableRows.map((row) => inspectTable(database, String(row.name), String(row.sql)));
const tableNames = new Set(tables.map((table) => table.id));
const relationships = [
  ...tables.flatMap((table) => foreignKeyRelationships(table)),
  ...extraRelationships.filter((item) => tableNames.has(item.from) && tableNames.has(item.to))
];
const model = { migrationCount: migrationFiles.length, tables, relationships };

const fragment = renderFragment(model).replaceAll("\r\n", "\n");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, fragment, "utf8");
database.close();
console.log(`Generated ${outputPath} from ${migrationFiles.length} migrations and ${tables.length} tables.`);

function inspectTable(connection, tableName, createSql) {
  const columns = connection.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
  const foreignKeys = connection.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all();
  const indexes = connection.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all()
    .filter((row) => !String(row.name).startsWith("sqlite_autoindex"))
    .map((row) => {
      const name = String(row.name);
      const definition = connection.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(name);
      return {
        name,
        unique: Number(row.unique) === 1,
        partial: Number(row.partial) === 1,
        columns: connection.prepare(`PRAGMA index_info(${quoteIdentifier(name)})`).all().map((item) => String(item.name)),
        sql: definition?.sql === null || definition?.sql === undefined ? null : String(definition.sql)
      };
    });
  const triggers = connection.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ? ORDER BY name")
    .all(tableName)
    .map((row) => ({ name: String(row.name), sql: String(row.sql) }));
  const metadata = tableMetadata[tableName] ?? ["Other", "Persisted application data."];
  const primaryKeyColumnCount = columns.filter((column) => Number(column.pk) > 0).length;

  return {
    id: tableName,
    domain: metadata[0],
    purpose: metadata[1],
    createSql,
    columns: columns.map((column) => {
      const name = String(column.name);
      const matchingForeignKeys = foreignKeys.filter((foreignKey) => String(foreignKey.from) === name);
      const keys = [];
      if (Number(column.pk) > 0) keys.push("PK");
      if (matchingForeignKeys.length > 0) keys.push("FK");
      const details = [];
      if (Number(column.notnull) === 1) details.push("required");
      if (column.dflt_value !== null) details.push(`default ${String(column.dflt_value)}`);
      for (const foreignKey of matchingForeignKeys) {
        details.push(`references ${String(foreignKey.table)}.${String(foreignKey.to)}; on delete ${String(foreignKey.on_delete)}`);
      }
      const note = columnNotes[`${tableName}.${name}`];
      if (note !== undefined) details.push(note);
      return {
        name,
        type: String(column.type),
        key: keys.join(" + ") || "—",
        detail: details.join("; ") || "—",
        primaryKeyPosition: Number(column.pk),
        unique: isColumnUnique(name, columns, indexes, primaryKeyColumnCount)
      };
    }),
    foreignKeys: foreignKeys.map((foreignKey) => ({
      column: String(foreignKey.from),
      targetTable: String(foreignKey.table),
      targetColumn: String(foreignKey.to),
      onDelete: String(foreignKey.on_delete)
    })),
    indexes,
    triggers
  };
}

function foreignKeyRelationships(table) {
  return table.foreignKeys.map((foreignKey) => {
    const sourceColumn = table.columns.find((column) => column.name === foreignKey.column);
    return relation(
      foreignKey.targetTable,
      table.id,
      "1",
      sourceColumn?.unique === true ? "0..1" : "many",
      "FK",
      `${table.id}.${foreignKey.column} → ${foreignKey.targetTable}.${foreignKey.targetColumn}`,
      `Database-enforced; ON DELETE ${foreignKey.onDelete}.`
    );
  });
}

function isColumnUnique(columnName, columns, indexes, primaryKeyColumnCount) {
  const column = columns.find((candidate) => String(candidate.name) === columnName);
  if (primaryKeyColumnCount === 1 && Number(column?.pk) > 0) return true;
  return indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0] === columnName);
}

function relation(from, to, fromCardinality, toCardinality, enforcement, label, detail) {
  return { from, to, fromCardinality, toCardinality, enforcement, label, detail };
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function renderFragment(schemaModel) {
  const serializedModel = JSON.stringify(schemaModel, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `
<div id="stream-jams-schema-explorer">
  <p class="text-muted" id="sj-schema-context"></p>
  <div class="viz-controls" aria-label="Schema filters">
    <label class="form-label" for="sj-schema-search">Search<input class="form-control" id="sj-schema-search" placeholder="Table, column, or purpose" type="search"></label>
    <label class="form-label" for="sj-schema-domain">Domain<select class="form-select" id="sj-schema-domain"><option value="all">All domains</option></select></label>
  </div>
  <output class="text-muted" id="sj-schema-result-count" aria-live="polite"></output>
  <div class="sj-schema-layout">
    <nav aria-label="Database tables" id="sj-schema-table-list"></nav>
    <section class="card sj-schema-detail" id="sj-schema-detail" aria-live="polite"></section>
  </div>
</div>

<style>
  #stream-jams-schema-explorer { display: grid; gap: 1rem; width: 100%; }
  #stream-jams-schema-explorer .sj-schema-layout { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr); gap: 1rem; align-items: start; }
  #stream-jams-schema-explorer #sj-schema-table-list,
  #stream-jams-schema-explorer .sj-schema-domain,
  #stream-jams-schema-explorer .sj-schema-detail,
  #stream-jams-schema-explorer .sj-schema-detail-section,
  #stream-jams-schema-explorer .sj-schema-relationship { display: grid; gap: 0.75rem; }
  #stream-jams-schema-explorer .sj-schema-domain + .sj-schema-domain { margin-top: 1rem; }
  #stream-jams-schema-explorer .sj-schema-domain-heading,
  #stream-jams-schema-explorer .sj-schema-detail-heading,
  #stream-jams-schema-explorer .sj-schema-relationship-line { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  #stream-jams-schema-explorer .sj-schema-domain-heading h3,
  #stream-jams-schema-explorer .sj-schema-detail-heading h2,
  #stream-jams-schema-explorer .sj-schema-detail-section h3,
  #stream-jams-schema-explorer .sj-schema-detail p,
  #stream-jams-schema-explorer .sj-schema-detail ul { margin: 0; }
  #stream-jams-schema-explorer .sj-schema-relationship-list,
  #stream-jams-schema-explorer .sj-schema-index-list,
  #stream-jams-schema-explorer .sj-schema-trigger-list { display: grid; gap: 0.75rem; padding-left: 1.25rem; }
  #stream-jams-schema-explorer .sj-schema-related-button { justify-self: start; }
  #stream-jams-schema-explorer .sj-schema-ddl { white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (max-width: 640px) { #stream-jams-schema-explorer .sj-schema-layout { grid-template-columns: 1fr; } }
</style>

<script>
(function () {
  const model = __SCHEMA_MODEL__;
  const root = document.getElementById("stream-jams-schema-explorer");
  const context = root.querySelector("#sj-schema-context");
  const searchInput = root.querySelector("#sj-schema-search");
  const domainSelect = root.querySelector("#sj-schema-domain");
  const resultCount = root.querySelector("#sj-schema-result-count");
  const tableList = root.querySelector("#sj-schema-table-list");
  const detail = root.querySelector("#sj-schema-detail");
  const tableMap = new Map(model.tables.map(function (table) { return [table.id, table]; }));
  const domains = Array.from(new Set(model.tables.map(function (table) { return table.domain; })));
  let selectedTableId = tableMap.has("alert_rules") ? "alert_rules" : model.tables[0].id;

  context.textContent = "SQLite schema version " + model.migrationCount + " · " + model.tables.length + " tables · select a table to inspect columns, relationships, indexes, triggers, and DDL.";
  domains.forEach(function (domain) {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    domainSelect.append(option);
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function matchingTables() {
    const terms = searchInput.value.trim().toLowerCase().split(/\\s+/u).filter(Boolean);
    return model.tables.filter(function (table) {
      if (domainSelect.value !== "all" && table.domain !== domainSelect.value) return false;
      const searchable = [table.id, table.domain, table.purpose].concat(table.columns.flatMap(function (column) { return [column.name, column.type, column.detail]; })).join(" ").toLowerCase();
      return terms.every(function (term) { return searchable.includes(term); });
    });
  }

  function renderTableList() {
    const matches = matchingTables();
    resultCount.textContent = matches.length + " of " + model.tables.length + " tables shown";
    tableList.replaceChildren();
    domains.forEach(function (domain) {
      const domainTables = matches.filter(function (table) { return table.domain === domain; });
      if (domainTables.length === 0) return;
      const section = element("section", "sj-schema-domain");
      const heading = element("div", "sj-schema-domain-heading");
      heading.append(element("h3", "", domain), element("span", "text-muted", String(domainTables.length)));
      const grid = element("div", "viz-grid");
      domainTables.forEach(function (table) {
        const button = element("button", "btn viz-tile", table.id);
        button.type = "button";
        button.setAttribute("aria-label", table.id + ": " + table.purpose);
        button.setAttribute("aria-pressed", String(table.id === selectedTableId));
        button.addEventListener("click", function () { selectTable(table.id); });
        grid.append(button);
      });
      section.append(heading, grid);
      tableList.append(section);
    });
    if (matches.length === 0) tableList.append(element("p", "", "No tables match these filters."));
  }

  function renderColumns(table) {
    const wrapper = element("div", "table-responsive");
    const tableElement = element("table", "table table-sm");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Column", "Type", "Key", "Constraint or meaning"].forEach(function (label) {
      const cell = element("th", "", label);
      cell.scope = "col";
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    table.columns.forEach(function (column) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("th");
      nameCell.scope = "row";
      nameCell.append(element("code", "", column.name));
      row.append(nameCell, element("td", "", column.type), element("td", "text-nowrap", column.key), element("td", "", column.detail));
      body.append(row);
    });
    tableElement.append(head, body);
    wrapper.append(tableElement);
    return wrapper;
  }

  function renderRelationships(table) {
    const list = element("ul", "sj-schema-relationship-list");
    const direct = model.relationships.filter(function (item) { return item.from === table.id || item.to === table.id; });
    if (direct.length === 0) return element("p", "", "No direct schema relationships.");
    direct.forEach(function (item) {
      const otherId = item.from === table.id ? item.to : item.from;
      const row = element("li", "sj-schema-relationship");
      const line = element("div", "sj-schema-relationship-line");
      line.append(
        element("span", "viz-badge", item.enforcement),
        element("code", "", item.from),
        element("span", "", item.fromCardinality),
        element("span", "", "→"),
        element("span", "", item.toCardinality),
        element("code", "", item.to)
      );
      const description = element("p");
      const strong = element("strong", "", item.label + ". ");
      description.append(strong, document.createTextNode(item.detail));
      const button = element("button", "btn btn-ghost sj-schema-related-button", "Open " + otherId);
      button.type = "button";
      button.addEventListener("click", function () {
        searchInput.value = "";
        domainSelect.value = "all";
        selectTable(otherId);
      });
      row.append(line, description, button);
      list.append(row);
    });
    return list;
  }

  function renderNamedSql(items, emptyText, className, describe) {
    if (items.length === 0) return element("p", "", emptyText);
    const list = element("ul", className);
    items.forEach(function (item) {
      const row = document.createElement("li");
      row.append(element("code", "", item.name), document.createElement("br"), document.createTextNode(describe(item)));
      list.append(row);
    });
    return list;
  }

  function section(title, content) {
    const node = element("section", "sj-schema-detail-section");
    node.append(element("h3", "", title), content);
    return node;
  }

  function renderDetail(table) {
    detail.replaceChildren();
    const heading = element("div", "sj-schema-detail-heading");
    const title = document.createElement("h2");
    title.append(element("code", "", table.id));
    heading.append(title, element("span", "viz-badge", table.domain));
    const indexes = renderNamedSql(table.indexes, "No secondary indexes.", "sj-schema-index-list", function (item) {
      return (item.unique ? "Unique" : "Non-unique") + (item.partial ? ", partial" : "") + " · " + (item.columns.join(", ") || "expression index");
    });
    const triggers = renderNamedSql(table.triggers, "No table triggers.", "sj-schema-trigger-list", function () { return "SQLite trigger"; });
    const ddl = document.createElement("details");
    const summary = element("summary", "", "Show CREATE TABLE SQL");
    const pre = element("pre", "sj-schema-ddl");
    pre.append(element("code", "", table.createSql));
    ddl.append(summary, pre);
    detail.append(
      heading,
      element("p", "", table.purpose),
      section("Columns", renderColumns(table)),
      section("Direct relationships", renderRelationships(table)),
      section("Secondary indexes", indexes),
      section("Triggers", triggers),
      section("DDL", ddl)
    );
  }

  function selectTable(tableId) {
    const table = tableMap.get(tableId);
    if (!table) return;
    selectedTableId = tableId;
    renderTableList();
    renderDetail(table);
  }

  searchInput.addEventListener("input", renderTableList);
  domainSelect.addEventListener("change", renderTableList);
  selectTable(selectedTableId);
})();
</script>
`.replace("__SCHEMA_MODEL__", serializedModel).trimStart();
}
