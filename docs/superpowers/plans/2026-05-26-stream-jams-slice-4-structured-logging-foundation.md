# Stream Jams Slice 4 Structured Logging Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated logging settings, structured server log writing, and retention cleanup so every future runtime service can emit redacted, traceable diagnostics through dependency injection.

**Architecture:** Slice 4 adds pure `@stream-jams/core` logging contracts and settings schemas, then implements server-side services for logging configuration, structured JSONL log writes, and retention cleanup. Server services depend on injected config, redaction, clock, and filesystem abstractions so business logic can be unit tested without starting Fastify or touching real production logs.

**Tech Stack:** TypeScript strict mode, Node ESM, Zod, Vitest, existing `ConfigStore` and `Redactor` interfaces, pnpm workspace scripts.

---

## Source Plan Reference

This plan decomposes **Slice 4: Structured Logging Foundation** from `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`.

Original Slice 4 value:

- Make logging a first-class system capability before runtime services start emitting events.
- Define `Logger`, `LogContext`, `LogLevel`, `CorrelationId`, and `ProcessingId` types in `packages/core`.
- Implement structured server logging with timestamp, level, message, module/service name, source identifier, correlation ID, processing ID, and sanitized metadata.
- Use default log level `INFO`.
- Add configurable log level in app settings.
- Implement hourly log rollover.
- Implement configurable log retention with default deletion of files older than 48 hours.
- Ensure every log write passes through `Redactor`.
- Unit test level filtering, hourly rollover naming, 48-hour retention, redaction, and correlation ID propagation.

## Current Repository Baseline

Slice 3 is merged into `origin/main`. The current repository has:

```text
packages/core/src/
  config/
    config-store.ts
    schemas.ts
    types.ts
  security/
    secret-store.ts
  index.ts

apps/server/src/
  config/
    file-config-store.ts
  modules/security/
    redactor.ts
```

The existing `AppConfig` contains `server` and `storage`. Slice 4 extends it with `logging` settings and keeps older config files readable by defaulting missing logging settings during schema parse.

## Scope Boundaries

### In Scope

- Core logging contracts and runtime schemas.
- `AppConfig.logging` with default `INFO`, hourly rollover, and 48-hour retention.
- A server `LogConfigService` that reads and updates logging settings through `ConfigStore`.
- A structured logger that writes JSON Lines to hourly log files.
- A retention service that deletes Stream Jams log files older than configured retention.
- Unit tests for every behavior listed in the Slice 4 acceptance checks.

### Out Of Scope

- Fastify request logging integration.
- Diagnostics UI and export surfaces.
- SQLite-backed log repositories.
- Provider, playback, overlay, and management route log emission.
- User-facing settings routes for logging.
- Any change to branch protection, CI, or package dependencies.

## Sub-Slice 4.1: Core Logging Contracts And Config Schema

**Objective:** Add framework-independent logging types and schemas, then make logging settings part of app config with safe defaults.

**Files:**

- Create: `packages/core/src/diagnostics/logging.ts`
- Create: `packages/core/src/diagnostics/logging.test.ts`
- Modify: `packages/core/src/config/types.ts`
- Modify: `packages/core/src/config/schemas.ts`
- Modify: `packages/core/src/config/schemas.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing core logging tests**

Add tests that assert:

- `logLevelSchema` accepts only `DEBUG`, `INFO`, `WARN`, and `ERROR`.
- `logSettingsSchema.parse({})` returns `{ level: "INFO", rollover: "hourly", retentionHours: 48 }`.
- Invalid retention values such as `0`, negative numbers, fractional numbers, and values over `8760` are rejected.
- `appConfigSchema` backfills default logging settings when parsing an older config object with only `server` and `storage`.
- `appConfigUpdateSchema` accepts `logging.level` and `logging.retentionHours` while stripping secret-shaped extras.
- The new contracts and schemas are exported from `@stream-jams/core`.

Run:

```bash
pnpm test -- packages/core/src/diagnostics/logging.test.ts packages/core/src/config/schemas.test.ts
```

Expected before implementation: fail because `packages/core/src/diagnostics/logging.ts` does not exist.

- [x] **Step 2: Implement core logging contracts**

Create `packages/core/src/diagnostics/logging.ts` with:

```ts
import { z } from "zod";
import { metadataSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const logLevelSchema = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]);

export const logSettingsSchema = z.object({
  level: logLevelSchema.default("INFO"),
  rollover: z.literal("hourly").default("hourly"),
  retentionHours: z.number().int().min(1).max(8_760).default(48)
});

export const defaultLogSettings = logSettingsSchema.parse({});

export const logSettingsUpdateSchema = logSettingsSchema.partial();

export const logContextSchema = z.object({
  module: nonEmptyStringSchema,
  source: nonEmptyStringSchema,
  correlationId: nonEmptyStringSchema,
  processingId: nonEmptyStringSchema.nullable(),
  metadata: metadataSchema.optional()
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogSettings = z.infer<typeof logSettingsSchema>;
export type LogSettingsUpdate = z.infer<typeof logSettingsUpdateSchema>;
export type LogContext = z.infer<typeof logContextSchema>;
export type CorrelationId = string;
export type ProcessingId = string;

export interface Logger {
  debug(message: string, context: LogContext): Promise<void>;
  info(message: string, context: LogContext): Promise<void>;
  warn(message: string, context: LogContext): Promise<void>;
  error(message: string, context: LogContext): Promise<void>;
}
```

- [x] **Step 3: Extend app config with logging settings**

Modify `packages/core/src/config/types.ts` so `AppConfig` has `readonly logging: LogSettings`, and `AppConfigUpdate` has `readonly logging?: LogSettingsUpdate`.

Modify `packages/core/src/config/schemas.ts` so `appConfigSchema` includes `logging: logSettingsSchema.default(defaultLogSettings)` and `appConfigUpdateSchema` includes `logging: logSettingsUpdateSchema.optional()`.

- [x] **Step 4: Export diagnostics contracts**

Modify `packages/core/src/index.ts` to export `Logger`, `LogContext`, `LogLevel`, `LogSettings`, `LogSettingsUpdate`, `CorrelationId`, `ProcessingId`, `logContextSchema`, `logLevelSchema`, `logSettingsSchema`, and `logSettingsUpdateSchema`.

- [x] **Step 5: Verify and commit Sub-Slice 4.1**

Run:

```bash
pnpm test -- packages/core/src/diagnostics/logging.test.ts packages/core/src/config/schemas.test.ts
pnpm --filter @stream-jams/core typecheck
```

Expected after implementation: all commands exit with status 0.

Commit:

```bash
git add packages/core/src/diagnostics/logging.ts packages/core/src/diagnostics/logging.test.ts packages/core/src/config/types.ts packages/core/src/config/schemas.ts packages/core/src/config/schemas.test.ts packages/core/src/index.ts
git commit -m "feat: add logging config contracts"
```

## Sub-Slice 4.2: Log Config Service

**Objective:** Provide a server service for reading and updating log settings through the existing config boundary.

**Files:**

- Modify: `apps/server/src/config/file-config-store.test.ts`
- Create: `apps/server/src/modules/diagnostics/log-config-service.ts`
- Create: `apps/server/src/modules/diagnostics/log-config-service.test.ts`

- [x] **Step 1: Write failing log config service tests**

Add tests that assert:

- `getSettings()` returns the `logging` section from `ConfigStore.readConfig()`.
- `updateSettings({ level: "DEBUG" })` delegates to `ConfigStore.updateConfig({ logging: { level: "DEBUG" } })` and returns the updated settings.
- Invalid settings such as `{ level: "TRACE" }` are rejected before reaching the store.
- Updating retention preserves the hourly rollover setting.

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/log-config-service.test.ts
```

Expected before implementation: fail because `log-config-service.ts` does not exist.

- [x] **Step 2: Extend file config store tests for logging defaults**

Update `apps/server/src/config/file-config-store.test.ts` so `defaultConfig` includes:

```ts
logging: {
  level: "INFO",
  rollover: "hourly",
  retentionHours: 48
}
```

Add assertions that an older persisted config without `logging` reads back with default logging settings, and that log settings updates are persisted without writing secret-shaped fields.

- [x] **Step 3: Implement `LogConfigService`**

Create `apps/server/src/modules/diagnostics/log-config-service.ts`:

```ts
import { logSettingsUpdateSchema, type ConfigStore, type LogSettings, type LogSettingsUpdate } from "@stream-jams/core";

export class LogConfigService {
  readonly #configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.#configStore = configStore;
  }

  async getSettings(): Promise<LogSettings> {
    const config = await this.#configStore.readConfig();
    return config.logging;
  }

  async updateSettings(patch: LogSettingsUpdate): Promise<LogSettings> {
    const parsedPatch = logSettingsUpdateSchema.parse(patch);
    const config = await this.#configStore.updateConfig({ logging: parsedPatch });
    return config.logging;
  }
}
```

- [x] **Step 4: Verify and commit Sub-Slice 4.2**

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/log-config-service.test.ts apps/server/src/config/file-config-store.test.ts
pnpm --filter @stream-jams/server typecheck
```

Expected after implementation: all commands exit with status 0.

Commit:

```bash
git add apps/server/src/modules/diagnostics/log-config-service.ts apps/server/src/modules/diagnostics/log-config-service.test.ts apps/server/src/config/file-config-store.test.ts
git commit -m "feat: add log config service"
```

## Sub-Slice 4.3: Structured Server Logger

**Objective:** Write redacted structured JSONL records to hourly log files with level filtering and trace context.

**Files:**

- Create: `apps/server/src/modules/diagnostics/logger.ts`
- Create: `apps/server/src/modules/diagnostics/logger.test.ts`

- [ ] **Step 1: Write failing structured logger tests**

Add tests that assert:

- With `level: "INFO"`, `debug()` does not write and `info()` does write.
- Log records include ISO timestamp, level, message, module, source, correlation ID, processing ID, and redacted metadata.
- Secret values are redacted from both message text and metadata.
- Writes at `2026-05-26T14:15:30.000Z` target `stream-jams-2026-05-26-14.log`, while writes at `2026-05-26T15:00:00.000Z` target `stream-jams-2026-05-26-15.log`.
- Passed correlation and processing IDs are preserved exactly in the JSON record.

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/logger.test.ts
```

Expected before implementation: fail because `logger.ts` does not exist.

- [ ] **Step 2: Implement logger sink and helpers**

Create:

```ts
export interface StructuredLogSink {
  appendLine(filePath: string, line: string): Promise<void>;
}

export interface StructuredLoggerOptions {
  readonly logDirectory: string;
  readonly settings: LogSettings;
  readonly redactor: Redactor;
  readonly sink?: StructuredLogSink;
  readonly clock?: () => Date;
}

export function createStructuredLogger(options: StructuredLoggerOptions): Logger;
export function resolveHourlyLogFilePath(logDirectory: string, timestamp: Date): string;
export function shouldLogLevel(candidate: LogLevel, configured: LogLevel): boolean;
```

The default sink uses `node:fs/promises.appendFile`, creates the target directory with `mkdir`, and appends one newline-delimited JSON record per write.

- [ ] **Step 3: Implement structured log writes**

Each emitted record must be shaped as:

```ts
{
  timestamp: string;
  level: LogLevel;
  message: string;
  module: string;
  source: string;
  correlationId: string;
  processingId: string | null;
  metadata: Record<string, unknown>;
}
```

Before serializing, call `redactor.redactText(message)` and `redactor.redact(context.metadata ?? {})`. Do not mutate the caller's metadata object.

- [ ] **Step 4: Verify and commit Sub-Slice 4.3**

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/logger.test.ts
pnpm --filter @stream-jams/server typecheck
```

Expected after implementation: all commands exit with status 0.

Commit:

```bash
git add apps/server/src/modules/diagnostics/logger.ts apps/server/src/modules/diagnostics/logger.test.ts
git commit -m "feat: add structured server logger"
```

## Sub-Slice 4.4: Log Retention Service

**Objective:** Delete only Stream Jams log files older than the configured retention window.

**Files:**

- Create: `apps/server/src/modules/diagnostics/log-retention-service.ts`
- Create: `apps/server/src/modules/diagnostics/log-retention-service.test.ts`

- [ ] **Step 1: Write failing retention tests**

Add tests that assert:

- Default retention deletes `stream-jams-*.log` files older than 48 hours.
- Files exactly at the 48-hour boundary are retained.
- A custom retention such as 12 hours changes the deletion threshold.
- Non-Stream-Jams files and directories are ignored even when old.
- Missing log directories are treated as an empty cleanup, not a failure.

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/log-retention-service.test.ts
```

Expected before implementation: fail because `log-retention-service.ts` does not exist.

- [ ] **Step 2: Implement injectable retention filesystem**

Create:

```ts
export interface LogFileEntry {
  readonly name: string;
  readonly filePath: string;
  readonly modifiedAt: Date;
  readonly isFile: boolean;
}

export interface LogRetentionFileSystem {
  listFiles(logDirectory: string): Promise<readonly LogFileEntry[]>;
  deleteFile(filePath: string): Promise<void>;
}
```

The default filesystem uses `node:fs/promises.readdir`, `stat`, and `unlink`.

- [ ] **Step 3: Implement `LogRetentionService`**

`cleanupExpiredLogs()` accepts `logDirectory`, optional `settings`, and optional `now`. It uses default log settings when settings are omitted, deletes only files whose names match `stream-jams-*.log`, and treats a missing directory as zero deleted files.

Return:

```ts
export interface LogRetentionResult {
  readonly deletedFilePaths: readonly string[];
  readonly retainedFilePaths: readonly string[];
}
```

- [ ] **Step 4: Verify and commit Sub-Slice 4.4**

Run:

```bash
pnpm test -- apps/server/src/modules/diagnostics/log-retention-service.test.ts
pnpm --filter @stream-jams/server typecheck
```

Expected after implementation: all commands exit with status 0.

Commit:

```bash
git add apps/server/src/modules/diagnostics/log-retention-service.ts apps/server/src/modules/diagnostics/log-retention-service.test.ts
git commit -m "feat: add log retention service"
```

## Sub-Slice 4.5: Reconciliation And Full Validation

**Objective:** Confirm Slice 4 is complete, scoped, exported, and ready for review.

**Files:**

- Modify: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- Modify: this plan file with final checkboxes and validation evidence.

- [ ] **Step 1: Run focused Slice 4 tests**

Run:

```bash
pnpm test -- packages/core/src/diagnostics/logging.test.ts packages/core/src/config/schemas.test.ts apps/server/src/config/file-config-store.test.ts apps/server/src/modules/diagnostics/log-config-service.test.ts apps/server/src/modules/diagnostics/logger.test.ts apps/server/src/modules/diagnostics/log-retention-service.test.ts
```

- [ ] **Step 2: Run repository validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

- [ ] **Step 3: Reconcile the MVP plan**

Mark Slice 4 complete only after implementation and validation pass. Record files changed, validation evidence, and any deferred work.

- [ ] **Step 4: Commit final reconciliation**

Commit:

```bash
git add docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md docs/superpowers/plans/2026-05-26-stream-jams-slice-4-structured-logging-foundation.md
git commit -m "docs: reconcile slice 4 logging foundation"
```

## Validation Evidence

Record fresh command output after each sub-slice is implemented.

- Baseline validation before implementation: `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed. The environment emitted the expected Node engine warning because it is running Node v26.2.0 while the repo pins Node 24.16.0.
- Sub-Slice 4.1 focused tests and typecheck: `pnpm test -- packages/core/src/diagnostics/logging.test.ts packages/core/src/config/schemas.test.ts` passed with 13 test files and 31 tests; `pnpm --filter @stream-jams/core typecheck` passed.
- Sub-Slice 4.2 focused tests and typecheck: `pnpm test -- apps/server/src/modules/diagnostics/log-config-service.test.ts apps/server/src/config/file-config-store.test.ts` passed with 14 test files and 36 tests; `pnpm --filter @stream-jams/server typecheck` passed.
- Sub-Slice 4.3 focused tests and typecheck: pending execution.
- Sub-Slice 4.4 focused tests and typecheck: pending execution.
- Full repository validation: pending execution.

## Reconciliation Checklist

- [x] Define `Logger`, `LogContext`, `LogLevel`, `CorrelationId`, and `ProcessingId` in `packages/core`.
- [ ] Implement structured server logging with timestamp, level, message, module/service name, source identifier, correlation ID, processing ID, and sanitized metadata.
- [x] Set default log level to `INFO`.
- [x] Add configurable log level in app settings.
- [ ] Implement hourly log rollover by default.
- [ ] Implement configurable log retention with a default of deleting files older than 48 hours.
- [ ] Ensure every log write passes through `Redactor`.
- [ ] Unit test level filtering.
- [ ] Unit test hourly rollover naming.
- [ ] Unit test 48-hour retention.
- [ ] Unit test redaction.
- [ ] Unit test correlation ID propagation.
