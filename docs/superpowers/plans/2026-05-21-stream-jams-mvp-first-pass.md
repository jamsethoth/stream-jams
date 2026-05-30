# Stream Jams MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local-first Stream Jams MVP as a modular overlay platform, with Twitch-driven alerts as the first usable overlay module rendered through secure browser-source URLs.

**Architecture:** Use a TypeScript local app with a backend service process, shared domain packages, and browser-based management and overlay frontends. Introduce an overlay module registry so alerts, and later widgets such as a music widget, can be configured, enabled, disabled, and rendered through either module-specific URLs or unified overlay URLs. Keep business logic in framework-independent service layers with explicit interfaces so module configuration, alert matching, queueing, provider integrations, security boundaries, and rendering instructions are unit testable without a browser or live Twitch connection.

**Tech Stack:** Mandatory stack is React, Vite, and TypeScript for browser UIs; Node.js, Fastify, and TypeScript for the local backend; SQLite behind typed repository interfaces for persistence; WebSocket for overlay transport; Zod or JSON Schema for runtime validation; Vitest, Testing Library, and Playwright for verification; and Electron as the eventual packaged desktop shell.

---

## Plan Status

This is a first-pass implementation plan derived from `docs/product-plan.md`. It is meant to establish feature slices, service boundaries, and test strategy before writing code.

The plan uses the locked TypeScript, Node/Fastify, React/Vite, SQLite, and Electron-compatible browser-source architecture. Questions at the end identify remaining product and implementation details that should be confirmed before converting each slice into low-level execution tasks.

## Planning Assumptions

- The app runs as a local Node.js process for the MVP.
- TypeScript is mandatory for frontend code, backend code, shared packages, and the future Electron shell.
- The backend uses Node.js and Fastify to serve the management UI, overlay UI, asset files, HTTP API, and WebSocket endpoints from one configurable localhost port.
- The frontend uses React and Vite for rich management UI workflows and browser-source overlay rendering.
- SQLite is the local data store for config, event logs, alert definitions, asset metadata, and playback logs, and it is accessed only through typed repository interfaces.
- Secrets are stored in the OS credential store when available, with a clearly marked development fallback that is not acceptable for production packaging.
- Twitch EventSub over WebSocket is the first live event provider.
- Browser source is the only output model.
- OBS WebSocket, native OBS plugins, cloud sync, and LAN overlay mode are outside MVP.
- The first implementation is a plain local app, with Electron documented as the selected packaged desktop shell after MVP stabilization.
- Windows, macOS, and Linux are local hosting goals where practical; Windows is the primary streamer platform target.
- Docker/cloud hosting is a nice-to-have future deployment mode, not the default MVP mode.
- Media import uses a hybrid approach: validate common browser-safe formats first, while designing the import pipeline for future import-time transcoding/normalization.
- Alerts are the first overlay module, not the whole long-term platform.
- The MVP includes the overlay module registry and composition foundation.
- Non-alert modules, including a future music widget, are not implemented in MVP.
- The overlay runtime supports module-specific URLs and unified overlay URLs.
- Each overlay module can be independently enabled, disabled, and configured through a wizard or form.
- Each module has one configurable canvas in the MVP.
- Each configured module canvas can be rendered through live and test browser-source variants.
- Test overlays receive only test-scoped events. Live overlays receive both test-scoped events and real provider events.
- Multiple alert collections can be active at once.
- All matching active alerts play sequentially for a single source event.
- Import/export is planned after MVP and should not shape MVP persistence beyond avoiding secret coupling.

## Resolved Product Decisions

- TTS targets Speaker.bot first.
- Management/configuration access replaces the earlier "admin" terminology.
- Management access does not require a password in the MVP, but management APIs remain separate from overlay routes.
- Alerts play sequentially.
- Each overlay module has one configurable canvas in the MVP.
- Each module canvas can produce live and test browser-source variants.
- Test overlays only show test-scoped events.
- Live overlays show both test-scoped events and real integrated provider events.
- MVP visual customization starts with placement, media, and text.
- Future font, color, animation, transition, and style controls are mandatory expansion paths, so the data model must leave room for presentation settings.
- Twitch ingestion starts with follow, subscription/resubscription, cheer, raid, and channel point redemption.
- Twitch gifts, community gifts, charity, goals, and Hype Train remain expansion events behind the same provider boundary.
- Logging is first-class with default `INFO` level, hourly rollover, 48-hour default retention, configurable settings, structured source metadata, correlation IDs, processing IDs, and secret redaction.
- The selected mandatory implementation stack is React, Vite, TypeScript, Node.js, Fastify, WebSocket, SQLite, Zod or JSON Schema, Vitest, Testing Library, Playwright, and Electron as the eventual desktop shell.
- The first implementation is a plain local app.
- Electron is the selected packaged desktop application path after the MVP stabilizes.
- Docker images are a nice-to-have future deployment target for self-hosted or cloud-hosted use.
- SQLite is the selected local data store and must be accessed through typed repository interfaces.
- Media import starts with validation-only support for common browser-safe formats, with import-time transcoding/normalization as the end state.

## Locked Technology Stack And Deferred Alternatives

The following technology choices are mandatory for implementation:

- React, Vite, and TypeScript for the management UI and browser-source overlay UI.
- Node.js, Fastify, and TypeScript for the local backend service.
- WebSocket for backend-to-overlay transport.
- SQLite behind typed repository interfaces for local persistence.
- Zod or JSON Schema for runtime validation at HTTP, WebSocket, provider, and persistence boundaries.
- Vitest, Testing Library, and Playwright for unit, component, integration, and browser verification.
- Electron as the selected packaged desktop shell after MVP stabilization.

### Selected Stack: TypeScript Full Stack

Frontend: React, Vite, and TypeScript.

Backend: Node.js, Fastify, TypeScript, WebSocket, and SQLite through typed repositories.

Pros:

- One language for management UI, overlay UI, service interfaces, tests, and provider adapters.
- Strong fit for browser-source overlay rendering.
- Fast iteration for a repo that is still defining its architecture.
- Shared TypeScript contracts reduce duplicated DTO work.
- Large ecosystem for WebSocket, Twitch API, asset handling, and UI testing.
- Lowest-friction path to Electron because the desktop shell, backend service, preload code, and browser UI can all remain in the TypeScript ecosystem.

Cons:

- Electron packaging, code signing, installer creation, and auto-update need extra decisions later.
- OS credential-store and SQLite adapters may involve native dependencies.
- Long-running local service discipline requires explicit process, logging, and shutdown design.

### Deferred Alternative: Tauri/Rust Local App

Frontend: React, Svelte, or another Vite frontend.

Backend: Rust with a local HTTP/WebSocket server and SQLite.

Pros:

- Strong packaged desktop story with small binaries.
- Rust is well suited to secure local services, concurrency, and file handling.
- Native desktop integration can be more controlled from the start.

Cons:

- More implementation complexity and a steeper contributor curve.
- Browser-source URLs still require a local HTTP/WebSocket server.
- Provider integrations and UI iteration may be slower than TypeScript.
- Shared type contracts between frontend and backend require generation or duplication discipline.

Tauri/Rust is not the selected implementation path. Reconsidering it later would be a major backend/runtime pivot, not a packaging-only change.

### Deferred Alternative: .NET Local Service

Frontend: React and Vite, or Blazor for management UI.

Backend: ASP.NET Core, SignalR/WebSockets, SQLite.

Pros:

- Strong local service, structured logging, configuration, and background-worker patterns.
- Good fit for Windows-heavy streamer environments.
- SignalR gives a mature real-time communication layer.
- Packaging can be robust once the product matures.

Cons:

- Browser overlay still benefits from JavaScript/TypeScript, so shared model types need generation or duplication.
- Twitch/TTS provider ecosystem may be less direct than Node's.
- Cross-platform packaging and native secret storage still need careful design.

.NET is not the selected implementation path. Reconsidering it later would require a separate service architecture decision and contract-generation strategy.

### Pivot And Packaging Impact

Pivoting from the selected TypeScript stack to Tauri/Rust or .NET later is possible, but it should be treated as a backend/runtime rewrite rather than a small refactor. The frontend can remain Vite-based, and the domain boundaries in `packages/core` can guide another implementation, but the Fastify HTTP server, WebSocket gateway, SQLite adapters, secret-store adapters, logging implementation, and provider clients would need equivalents. Keeping domain logic encapsulated, schemas explicit, and HTTP/WebSocket payloads stable reduces the migration risk.

Packaging the selected stack with Electron is the chosen desktop direction. The Electron shell can launch or supervise the Node/Fastify service and load the local management UI while preserving most TypeScript backend and frontend code. The key packaging risks are native dependencies, OS credential-store adapters, auto-update, installer signing/notarization, local port lifecycle, service shutdown behavior, and where user data/logs/assets live on each OS.

Supported platform target for the plain local app:

- Primary: Windows.
- Best-effort local hosting: macOS and Linux.
- Browser-source compatibility: OBS, Streamlabs Desktop, XSplit, vMix, and similar tools that support browser/webpage sources.

Docker image support is a future deployment mode. It should expose the same HTTP/WebSocket service, but it needs a different secret-storage strategy, explicit network binding, TLS/reverse-proxy guidance, persistent volumes for SQLite/assets/logs, and a clearer security model for remote access.

## Architectural Principles

- TypeScript strict mode is required across frontend, backend, shared packages, and future Electron shell code.
- Dependency resolution must be deterministic: all direct npm dependencies and dev dependencies are pinned to exact versions with no semver ranges, transitive dependencies are locked in the committed `pnpm-lock.yaml` with integrity data, and release/build automation installs from the committed lockfile using frozen-lockfile behavior.
- The app must not produce a different artifact or behavior without a repository change; dependency updates are explicit repo changes that update package manifests and the lockfile together.
- pnpm workspaces remain the MVP package-management and workspace-script orchestration layer.
- TypeScript project references define TypeScript package relationships so shared packages build and typecheck before dependent applications.
- Turborepo is a possible future task-orchestration and caching layer if workspace scale or CI runtime warrants it, but it is not required for MVP implementation.
- Domain logic lives outside HTTP handlers and React components.
- Service contracts are defined as TypeScript interfaces before concrete adapters.
- Fastify handlers delegate to service interfaces instead of owning business rules.
- SQLite access is isolated behind typed repositories with explicit row mapping and migration ownership.
- Every provider integration is behind an adapter interface.
- Data entering the system is validated at boundaries with schemas.
- Secret references are stored in app data; secret values are fetched through a `SecretStore`.
- Electron compatibility is a design constraint: browser UI code must not directly access filesystem, SQLite, OS credential stores, or Node-only APIs.
- Overlay and management authorization are separate.
- Overlay modules own their feature-specific logic and expose configuration/rendering through explicit module interfaces.
- Module-specific and unified overlay outputs share transport primitives but have separately scoped access keys.
- Browser rendering receives normalized playback instructions, not raw Twitch payloads.
- Unit tests target pure services first; integration tests cover adapters; Playwright covers only critical user and overlay flows.
- Feature slices must be independently deliverable and leave the app in a runnable state once the scaffold exists.

## Proposed Project Structure

```text
apps/
  server/
    src/
      index.ts
      app.ts
      config/
      http/
      websocket/
      modules/
        assets/
        auth/
        diagnostics/
        events/
        overlay-modules/
        overlays/
        playback/
        twitch/
        tts/
  web/
    src/
      management/
      overlay/
      shared/
packages/
  core/
    src/
      alerts/
      assets/
      auth/
      config/
      diagnostics/
      events/
      moderation/
      overlay-modules/
      overlays/
      playback/
      security/
      templates/
      tts/
  test-support/
    src/
docs/
  product-plan.md
  superpowers/
    plans/
```

Electron packaging is intentionally not part of the MVP scaffold. When desktop packaging begins, it should be added as an application shell boundary that launches or supervises the same Node/Fastify service and loads the same Vite-built management UI. Electron main/preload code must call typed service or IPC boundaries and must not become a second location for domain logic.

## Service Interfaces

These interfaces define the core boundaries. Concrete implementations can change without forcing the rest of the app to know about framework, database, provider, or browser details.

### Configuration And Secrets

```ts
export interface AppConfig {
  server: {
    host: "127.0.0.1";
    port: number;
  };
  storage: {
    dataDirectory: string;
    assetDirectory: string;
  };
}

export interface ConfigStore {
  readConfig(): Promise<AppConfig>;
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
}

export interface SecretStore {
  setSecret(ref: SecretRef, value: string): Promise<void>;
  getSecret(ref: SecretRef): Promise<string | null>;
  deleteSecret(ref: SecretRef): Promise<void>;
}

export interface SecretRef {
  namespace: "twitch" | "tts" | "management" | "overlay";
  accountId: string;
  name: string;
}
```

### Auth And Overlay Access

```ts
export interface OverlayAccessKey {
  id: string;
  overlayId: string;
  moduleId: string | null;
  purpose: "live" | "test";
  scope: "module" | "unified";
  keyHash: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface OverlayAccessService {
  createOverlayKey(input: CreateOverlayKeyInput): Promise<string>;
  verifyOverlayKey(rawKey: string): Promise<OverlayAccessKey | null>;
  revokeOverlayKey(keyId: string): Promise<void>;
}

export interface ManagementSessionService {
  createSession(): Promise<ManagementSession>;
  verifySession(sessionId: string): Promise<ManagementSession | null>;
  endSession(sessionId: string): Promise<void>;
}
```

### Overlay Modules

```ts
export interface OverlayModuleDefinition<TConfig = unknown> {
  id: string;
  displayName: string;
  version: string;
  defaultEnabled: boolean;
  configSchema: unknown;
  defaultConfig: TConfig;
  wizard: OverlayModuleWizardDefinition;
  renderer: OverlayModuleRendererDefinition;
}

export interface OverlayModuleRegistry {
  listModules(): OverlayModuleDefinition[];
  getModule(moduleId: string): OverlayModuleDefinition | null;
}

export interface OverlayModuleConfigService {
  getModuleConfig(moduleId: string): Promise<OverlayModuleConfig | null>;
  saveModuleConfig(config: OverlayModuleConfig): Promise<void>;
  setModuleEnabled(moduleId: string, enabled: boolean): Promise<void>;
}

export interface OverlayCompositionService {
  resolveModuleOutput(input: ModuleOutputRequest): Promise<OverlayComposition>;
  resolveUnifiedOutput(input: UnifiedOutputRequest): Promise<OverlayComposition>;
}

export interface OverlayModuleRuntime {
  getSnapshot(moduleId: string): Promise<OverlayModuleSnapshot>;
  handleWizardSubmit(input: OverlayModuleWizardSubmit): Promise<OverlayModuleConfig>;
}
```

### Event Providers

```ts
export interface EventProvider {
  id: string;
  displayName: string;
  connect(accountId: string): Promise<EventProviderConnection>;
  disconnect(accountId: string): Promise<void>;
  getStatus(accountId: string): Promise<EventProviderStatus>;
}

export interface EventProviderConnection {
  accountId: string;
  providerId: string;
  status: "connected" | "connecting" | "disconnected" | "error";
}

export interface EventProviderStatus {
  providerId: string;
  accountId: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  message: string | null;
}

export interface EventNormalizer<TProviderPayload> {
  normalize(payload: TProviderPayload): NormalizedStreamEvent;
}
```

### Alerts And Collections

```ts
export interface AlertRepository {
  listRules(): Promise<AlertRule[]>;
  getRule(ruleId: string): Promise<AlertRule | null>;
  saveRule(rule: AlertRule): Promise<void>;
  deleteRule(ruleId: string): Promise<void>;
  listCollections(): Promise<AlertCollection[]>;
  saveCollection(collection: AlertCollection): Promise<void>;
}

export interface AlertMatcher {
  findMatches(event: NormalizedStreamEvent, state: AlertActivationState): AlertMatch[];
}

export interface AlertResolver {
  resolve(match: AlertMatch, event: NormalizedStreamEvent): Promise<ResolvedAlert>;
}

export interface AlertActivationState {
  enabledCollectionIds: string[];
  disabledRuleIds: string[];
}
```

### Assets

```ts
export interface AssetStore {
  importAsset(input: AssetImportInput): Promise<AssetRecord>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  listAssets(): Promise<AssetRecord[]>;
  deleteAsset(assetId: string): Promise<void>;
  getAssetReadStream(assetId: string): Promise<NodeJS.ReadableStream>;
}

export interface AssetValidator {
  validate(input: AssetImportInput): Promise<AssetValidationResult>;
}
```

### Templates And Moderation

```ts
export interface TemplateRenderer {
  render(template: string, event: NormalizedStreamEvent): RenderedTemplate;
}

export interface ModerationService {
  moderateText(input: ModerationInput): ModerationResult;
}
```

### TTS

```ts
export interface TtsProvider {
  id: string;
  displayName: string;
  getCapabilities(): TtsProviderCapabilities;
  listVoices(configRef: TtsProviderConfigRef): Promise<TtsVoice[]>;
  test(input: TtsTestRequest): Promise<TtsPlaybackInstruction>;
  synthesize(input: TtsSynthesisRequest): Promise<TtsPlaybackInstruction>;
}

export interface TtsProviderCapabilities {
  supportsVoices: boolean;
  supportsRate: boolean;
  supportsPitch: boolean;
  supportsVolume: boolean;
  playbackMode: "audio-file" | "remote-trigger" | "browser-speech";
}
```

### Playback And Overlay Transport

```ts
export interface PlaybackQueue {
  enqueue(event: NormalizedStreamEvent, alerts: ResolvedAlert[]): Promise<PlaybackQueueSnapshot>;
  skipCurrent(): Promise<PlaybackQueueSnapshot>;
  replayRecent(playbackId: string): Promise<PlaybackQueueSnapshot>;
  pause(): Promise<PlaybackQueueSnapshot>;
  resume(): Promise<PlaybackQueueSnapshot>;
  mute(): Promise<PlaybackQueueSnapshot>;
  unmute(): Promise<PlaybackQueueSnapshot>;
  snapshot(): Promise<PlaybackQueueSnapshot>;
}

export interface OverlayGateway {
  registerClient(client: OverlayClient): void;
  unregisterClient(clientId: string): void;
  sendInstruction(overlayId: string, instruction: OverlayInstruction): Promise<void>;
  broadcastStatus(status: OverlayStatus): Promise<void>;
}
```

### Diagnostics

```ts
export interface DiagnosticsLogger {
  eventIngested(event: NormalizedStreamEvent): Promise<void>;
  alertMatched(record: AlertMatchLogRecord): Promise<void>;
  playbackChanged(snapshot: PlaybackQueueSnapshot): Promise<void>;
  providerError(error: ProviderErrorLogRecord): Promise<void>;
}

export interface Redactor {
  redact(input: unknown): unknown;
}

export interface Logger {
  debug(message: string, context: LogContext): void;
  info(message: string, context: LogContext): void;
  warn(message: string, context: LogContext): void;
  error(message: string, context: LogContext): void;
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  module: string;
  source: string;
  correlationId: string;
  processingId: string | null;
  metadata?: Record<string, unknown>;
}

export interface LogSettings {
  level: LogLevel;
  rollover: "hourly";
  retentionHours: number;
}
```

### Shared Type Shapes

The exact event-specific fields are defined in Slice 2, but these shapes lock the interface contract before implementation begins.

```ts
export interface ManagementSession {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreateOverlayKeyInput {
  overlayId: string;
  moduleId: string | null;
  purpose: "live" | "test";
  scope: "module" | "unified";
}

export interface OverlayModuleWizardDefinition {
  steps: OverlayModuleWizardStep[];
}

export interface OverlayModuleWizardStep {
  id: string;
  title: string;
  fields: OverlayModuleWizardField[];
}

export interface OverlayModuleWizardField {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "asset" | "color";
  required: boolean;
}

export interface OverlayModuleRendererDefinition {
  entryPoint: string;
  supportedOutputs: Array<"module" | "unified">;
}

export interface OverlayModuleConfig<TConfig = unknown> {
  moduleId: string;
  enabled: boolean;
  config: TConfig;
  updatedAt: string;
}

export interface ModuleOutputRequest {
  moduleId: string;
  overlayId: string;
  purpose: "live" | "test";
}

export interface UnifiedOutputRequest {
  overlayId: string;
  purpose: "live" | "test";
  enabledModuleIds: string[];
}

export interface OverlayComposition {
  overlayId: string;
  purpose: "live" | "test";
  scope: "module" | "unified";
  modules: OverlayModuleSnapshot[];
}

export interface OverlayModuleSnapshot {
  moduleId: string;
  enabled: boolean;
  instructions: OverlayInstruction[];
}

export interface OverlayModuleWizardSubmit {
  moduleId: string;
  values: Record<string, unknown>;
}

export interface NormalizedStreamEvent {
  id: string;
  providerId: "twitch";
  type: StreamEventType;
  occurredAt: string;
  actor: StreamEventActor;
  amount: number | null;
  message: string | null;
  metadata: Record<string, unknown>;
}

export type StreamEventType =
  | "follow"
  | "subscription"
  | "resubscription"
  | "gift_subscription"
  | "community_gift"
  | "cheer"
  | "raid"
  | "channel_point_redemption"
  | "hype_train_begin"
  | "hype_train_progress"
  | "hype_train_end"
  | "creator_goal"
  | "charity_donation";

export interface StreamEventActor {
  id: string | null;
  displayName: string;
}

export interface AlertCollection {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  eventType: StreamEventType;
  enabled: boolean;
  collectionIds: string[];
  conditions: AlertCondition[];
  variants: AlertVariant[];
  cooldownSeconds: number;
  priority: number;
}

export interface AlertVariant {
  id: string;
  name: string;
  enabled: boolean;
  weight: number;
  visualAssetId: string | null;
  audioAssetId: string | null;
  textTemplate: string;
  ttsConfig: AlertTtsConfig | null;
  durationMs: number;
  layout: OverlayElementLayout;
}

export interface AlertCondition {
  field: string;
  operator: "equals" | "min" | "max" | "range" | "includes";
  value: string | number | boolean | [number, number];
}

export interface AlertTtsConfig {
  enabled: boolean;
  providerId: string;
  voiceId: string | null;
  template: string;
  minimumAmount: number | null;
}

export interface OverlayElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface AlertMatch {
  rule: AlertRule;
  variant: AlertVariant;
}

export interface ResolvedAlert {
  id: string;
  sourceEventId: string;
  ruleId: string;
  variantId: string;
  overlayInstruction: OverlayInstruction;
}

export interface AssetImportInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  stream: NodeJS.ReadableStream;
}

export interface AssetValidationResult {
  accepted: boolean;
  reason: string | null;
  mediaType: "image" | "gif" | "video" | "audio" | null;
}

export interface AssetRecord {
  id: string;
  originalFileName: string;
  mediaType: "image" | "gif" | "video" | "audio";
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
}

export interface RenderedTemplate {
  text: string;
  usedVariables: string[];
}

export interface ModerationInput {
  text: string;
  channel: "visual" | "tts";
}

export interface ModerationResult {
  accepted: boolean;
  text: string;
  reasons: string[];
}

export interface TtsProviderConfigRef {
  providerId: string;
  accountId: string;
}

export interface TtsVoice {
  id: string;
  label: string;
}

export interface TtsTestRequest {
  configRef: TtsProviderConfigRef;
  text: string;
  voiceId: string | null;
}

export interface TtsSynthesisRequest extends TtsTestRequest {
  sourceEventId: string;
  alertId: string;
}

export interface OverlayInstruction {
  id: string;
  overlayId: string;
  moduleId: string;
  purpose: "live" | "test";
  scope: "module" | "unified";
  visual: OverlayVisualInstruction | null;
  audio: OverlayAudioInstruction | null;
  text: OverlayTextInstruction | null;
  tts: TtsPlaybackInstruction | null;
  durationMs: number;
}

export interface OverlayVisualInstruction {
  assetId: string;
  mediaType: "image" | "gif" | "video";
  layout: OverlayElementLayout;
}

export interface OverlayAudioInstruction {
  assetId: string;
  volume: number;
}

export interface OverlayTextInstruction {
  text: string;
  layout: OverlayElementLayout;
}

export interface TtsPlaybackInstruction {
  mode: "audio-file" | "remote-trigger" | "browser-speech";
  text: string;
  audioAssetId: string | null;
  providerPayload: Record<string, unknown> | null;
}

export interface PlaybackQueueSnapshot {
  current: ResolvedAlert | null;
  queued: ResolvedAlert[];
  paused: boolean;
  muted: boolean;
  doNotDisturb: boolean;
}

export interface OverlayClient {
  id: string;
  overlayId: string;
  moduleId: string | null;
  purpose: "live" | "test";
  scope: "module" | "unified";
}

export interface OverlayStatus {
  connectedClients: OverlayClient[];
}

export interface AlertMatchLogRecord {
  eventId: string;
  matchedRuleIds: string[];
  createdAt: string;
}

export interface ProviderErrorLogRecord {
  providerId: string;
  message: string;
  createdAt: string;
}
```

## Deliverable Slices

### Slice 1: Repository And Quality Foundation

**Category:** Engineering foundation.

**Status:** Complete. Implementation verified at branch commit `9eda2a5`.

**Value:** Establishes a runnable mandatory TypeScript workspace with React/Vite web packages, Node/Fastify server packages, and fast feedback standards.

**Files:**

- Create `package.json`
- Create `pnpm-workspace.yaml`
- Create `tsconfig.base.json`
- Create `apps/server/package.json`
- Create `apps/web/package.json`
- Create `packages/core/package.json`
- Create `packages/test-support/package.json`
- Create `vitest.config.ts`
- Create `.gitignore`
- Reference `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`

**Steps:**

- [x] Create the strict TypeScript workspace and package scripts for `dev`, `build`, `test`, `test:unit`, `test:e2e`, `lint`, and `typecheck`.
- [x] Configure the web package as a React and Vite TypeScript application shell.
- [x] Configure the server package as a Node.js and Fastify TypeScript application shell.
- [x] Configure Vitest for unit tests across `packages/core`, `apps/server`, and `apps/web`.
- [x] Add a sample core unit test proving the workspace test runner works.
- [x] Add a minimal server health test proving server modules can be tested without binding a real production port.
- [x] Add a minimal web test proving React components can render under the test runner.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- [x] Commit with message `chore: scaffold typescript workspace`.

**Acceptance Checks:**

- [x] `pnpm install --frozen-lockfile` completes after the lockfile has been intentionally updated for dependency changes.
- [x] Package manifests use exact dependency versions, and the committed lockfile is the source of truth for installs.
- [x] `pnpm test` passes with sample tests.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] TypeScript strict mode is enabled for all packages.
- [x] The scaffold uses React/Vite for web UI code and Node/Fastify for server code.
- [x] No app logic exists outside the intended packages.

**Completion Evidence:**

- Fresh Slice 1 verification passed with `corepack pnpm install --frozen-lockfile`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm test:e2e`, and `corepack pnpm build`.
- Package-specific builds passed for `@stream-jams/core`, `@stream-jams/server`, `@stream-jams/web`, and `@stream-jams/test-support`.
- Source file-list, exact dependency version, and out-of-scope behavior scans matched the Slice 1 repository-quality plan.
- No Slice 1 gaps were identified, so no additional carry-forward items were added to Slice 2.

### Slice 2: Core Domain Types And Validation Schemas

**Category:** Domain model.

**Value:** Defines the shared language used by every service layer.

**Files:**

- Create `packages/core/src/events/types.ts`
- Create `packages/core/src/alerts/types.ts`
- Create `packages/core/src/assets/types.ts`
- Create `packages/core/src/overlay-modules/types.ts`
- Create `packages/core/src/overlays/types.ts`
- Create `packages/core/src/playback/types.ts`
- Create `packages/core/src/tts/types.ts`
- Create `packages/core/src/security/types.ts`
- Create `packages/core/src/index.ts`
- Create `packages/core/src/**/*.test.ts`

**Steps:**

- [x] Define `NormalizedStreamEvent` as a discriminated union for the MVP Twitch event types.
- [x] Define `OverlayModuleDefinition`, `OverlayModuleConfig`, `OverlayComposition`, `ModuleOutputRequest`, and `UnifiedOutputRequest`.
- [x] Define `AlertRule`, `AlertVariant`, `AlertCollection`, `AlertCondition`, and `AlertActivationState`.
- [x] Define `ResolvedAlert`, `OverlayInstruction`, `PlaybackQueueItem`, and `PlaybackQueueSnapshot`.
- [x] Define `AssetRecord`, `TtsPlaybackInstruction`, `TtsProviderCapabilities`, `SecretRef`, and `OverlayAccessKey`.
- [x] Add Zod schemas for all HTTP/WebSocket boundary payloads owned by Slice 2 domain contracts.
- [x] Unit test schema acceptance for valid follow, subscription, cheer, raid, and channel point event examples.
- [x] Unit test schema rejection for missing required event identity, invalid event type, invalid alert duration, and invalid overlay purpose.
- [x] Commit with message `feat: define core domain types`.

**Acceptance Checks:**

- Event, overlay module, alert, asset, overlay, playback, TTS, and security types compile from `packages/core`.
- Boundary schemas reject malformed data before it reaches service logic.
- Unit tests cover representative valid and invalid payloads.

**Completion Evidence:**

- Slice 2 core contracts were implemented in `packages/core/src/events`, `alerts`, `assets`, `overlay-modules`, `overlays`, `playback`, `tts`, `security`, and `shared`.
- `@stream-jams/core` exports the Slice 2 types and Zod schemas from `packages/core/src/index.ts`.
- Fresh verification passed with `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- GitHub PR checks passed for `validate`, `build`, `codeql`, `CodeQL`, and `dependency-review`.
- Review reconciliation identified the `AppConfig` shared contract as a carry-forward planning gap and added it to Slice 3.

### Cross-Cutting Gate: GitHub Actions CI

**Category:** Repository quality and merge protection.

**Value:** Prevents unvalidated changes from merging into `main` before feature work continues.

**Files:**

- Create `.github/workflows/ci.yml`
- Create `.github/workflows/dependency-audit.yml`

**Steps:**

- [x] Add a GitHub Actions workflow with required `validate`, `build`, `codeql`, and `dependency-review` jobs.
- [x] Trigger the workflow on pull requests targeting `main`, new commits to open pull requests, pushes to `main`, and manual dispatch.
- [x] Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` in `validate`.
- [x] Run `pnpm build` in a separate `build` job.
- [x] Run CodeQL JavaScript/TypeScript analysis with security and quality queries.
- [x] Run dependency review on pull requests and fail if a dependency change introduces high-severity or worse vulnerabilities.
- [x] Add a non-blocking scheduled dependency audit workflow that runs `pnpm audit --audit-level high` and uploads the audit report.
- [x] Configure `main` branch protection so all required CI checks must pass before merge.
- [x] Verify a pull request cannot merge while any required CI check is failing or pending.

**Acceptance Checks:**

- Every pull request targeting `main` gets `validate`, `build`, `codeql`, and `dependency-review` status checks.
- Every new commit pushed to a branch with an open pull request targeting `main` reruns required CI checks.
- Every merge or direct push to `main` runs `validate`, `build`, and `codeql`.
- `pnpm audit` runs on a weekly schedule and manual dispatch without blocking unrelated pull requests.
- `main` requires all required CI checks before pull requests can merge.

**Completion Evidence:**

- `.github/workflows/ci.yml` defines separate `validate`, `build`, `codeql`, and `dependency-review` jobs.
- `.github/workflows/dependency-audit.yml` defines the non-blocking scheduled/manual `pnpm-audit` workflow.
- GitHub PR checks passed for `validate`, `build`, `codeql`, `CodeQL`, and `dependency-review`.
- `main` branch protection readback requires `validate`, `build`, `codeql`, `CodeQL`, and `dependency-review`, with strict status checks, pull request review, conversation resolution, linear history, no force pushes, and no deletion.
- `pnpm audit --audit-level high --json` was run once and confirmed the current known high/critical dependency baseline, so `pnpm-audit` intentionally remains non-blocking.

### Slice 3: Local Config And Secret Storage Boundary

**Category:** Security and persistence.

**Value:** Separates non-secret local config from secret values before provider work begins.

**Files:**

- Create `packages/core/src/config/types.ts`
- Create `packages/core/src/config/schemas.ts`
- Create `packages/core/src/config/config-store.ts`
- Create `packages/core/src/security/secret-store.ts`
- Create `apps/server/src/config/file-config-store.ts`
- Create `apps/server/src/modules/security/os-secret-store.ts`
- Create `apps/server/src/modules/security/dev-secret-store.ts`
- Create `apps/server/src/modules/security/redactor.ts`
- Create tests for each config/security module.

**Steps:**

- [x] Define `AppConfig` and an `appConfigSchema` in `packages/core` for host, port, data directory, and asset directory.
- [x] Define `ConfigStore`, `SecretStore`, and `Redactor` interfaces in `packages/core`.
- [x] Ensure `SecretStore` uses the Slice 2 `SecretRef` type and `secretRefSchema` instead of redefining secret identity fields.
- [x] Implement file-backed config storage for non-secret values including host, port, data directory, and asset directory.
- [x] Implement an OS credential-store adapter behind `SecretStore`.
- [x] Implement a development secret-store adapter that is explicitly gated to development mode.
- [x] Implement redaction for OAuth tokens, API keys, overlay keys, auth headers, signed URLs, and configured secret names.
- [x] Unit test that raw secrets are not written to config data.
- [x] Unit test redaction for nested objects, arrays, headers, and URLs.
- [x] Commit with message `feat: add config and secret storage boundary`.

**Acceptance Checks:**

- `AppConfig` is exported from `@stream-jams/core` and validates persisted config data before server code consumes it.
- Config can be read and updated without exposing secret values.
- Secret lookup always goes through `SecretStore`.
- Redactor can be used by logs and diagnostics without knowing provider details.

**Completion Evidence:**

- Slice 3 detailed execution plan was added at `docs/superpowers/plans/2026-05-23-stream-jams-slice-3-local-config-secret-storage-boundary.md`.
- `@stream-jams/core` exports `AppConfig`, `appConfigSchema`, `appConfigUpdateSchema`, `ConfigStore`, `SecretStore`, and `Redactor`.
- `apps/server/src/config/file-config-store.ts` validates config reads and updates through core schemas and strips secret-shaped patch fields before persisting JSON.
- `apps/server/src/modules/security/os-secret-store.ts` wraps an injected credential backend behind `SecretStore`, using the existing `SecretRef` and `secretRefSchema`.
- `apps/server/src/modules/security/dev-secret-store.ts` provides a development-only in-memory fallback and refuses construction in `test` or `production` modes.
- `apps/server/src/modules/security/redactor.ts` redacts nested objects, arrays, auth headers, OAuth/API/overlay keys, signed URL query parameters, and configured secret names without mutating inputs.
- Focused Slice 3 tests passed for config schemas, file config storage, OS secret storage, development secret storage, and redaction: 5 test files and 14 tests.
- Full repository validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- No Slice 3 carry-forward gaps were identified.

### Slice 4: Structured Logging Foundation

**Category:** Observability and operations.

**Status:** Complete. Implementation verified on branch `codex/slice-4-development`.

**Value:** Makes logging a first-class system capability before runtime services start emitting events.

**Files:**

- Create `packages/core/src/diagnostics/logging.ts`
- Create `apps/server/src/modules/diagnostics/logger.ts`
- Create `apps/server/src/modules/diagnostics/log-config-service.ts`
- Create `apps/server/src/modules/diagnostics/log-retention-service.ts`
- Create logging tests.

**Steps:**

- [x] Define `Logger`, `LogContext`, `LogLevel`, `CorrelationId`, and `ProcessingId` types in `packages/core`.
- [x] Implement structured server logging with timestamp, level, message, module/service name, source identifier, correlation ID, processing ID, and sanitized metadata.
- [x] Set default log level to `INFO`.
- [x] Add configurable log level in app settings.
- [x] Implement hourly log rollover by default.
- [x] Implement configurable log retention with a default of deleting files older than 48 hours.
- [x] Ensure every log write passes through `Redactor`.
- [x] Unit test level filtering, hourly rollover naming, 48-hour retention, redaction, and correlation ID propagation.
- [x] Commit Slice 4 work in validated sub-slice commits.

**Acceptance Checks:**

- Every service can receive a logger through dependency injection.
- Log lines include enough source and correlation data to trace runtime behavior.
- Logging configuration is user-configurable without exposing secrets.

**Completion Evidence:**

- Slice 4 detailed execution plan was added at `docs/superpowers/plans/2026-05-26-stream-jams-slice-4-structured-logging-foundation.md`.
- `@stream-jams/core` exports logging contracts and schemas for `Logger`, `LogContext`, `LogLevel`, `LogSettings`, `LogSettingsUpdate`, `CorrelationId`, and `ProcessingId`.
- App config now includes defaulted logging settings with `INFO` level, hourly rollover, and 48-hour retention, while older config files without `logging` are backfilled during validation.
- `apps/server/src/modules/diagnostics/log-config-service.ts` reads and updates logging settings through `ConfigStore`.
- `apps/server/src/modules/diagnostics/logger.ts` writes redacted structured JSONL records to UTC hourly log files through an injectable sink.
- `apps/server/src/modules/diagnostics/log-retention-service.ts` deletes only Stream Jams log files older than the configured retention window and treats missing log directories as empty.
- Focused Slice 4 tests passed for logging contracts, config schemas, file config behavior, log config service, structured logger, and retention service: 16 test files and 43 tests.
- Full repository validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. The local environment emitted the expected Node engine warning because it is running Node v26.2.0 while the repo pins Node 24.16.0.
- No Slice 4 carry-forward gaps were identified.

### Slice 5: Local Server Shell And Configurable Port

**Category:** Local hosting.

**Status:** Complete. Implementation verified on branch `codex/slice-5-local-server-shell`.

**Value:** Establishes the local app process and makes port collisions visible and recoverable.

**Files:**

- Create `apps/server/src/index.ts`
- Create `apps/server/src/app.ts`
- Create `apps/server/src/config/server-config.ts`
- Create `apps/server/src/http/routes/health.ts`
- Create `apps/server/src/http/routes/config.ts`
- Create server tests.

**Steps:**

- [x] Build a Fastify app factory that accepts dependencies instead of constructing them internally.
- [x] Add `GET /health` returning app status and version.
- [x] Add read/update endpoints for non-secret server config.
- [x] Validate port updates before saving.
- [x] Bind to `127.0.0.1` by default.
- [x] Detect occupied ports at startup and return a structured startup error listing the configured port and suggested alternates.
- [x] Unit test config update behavior.
- [x] Integration test health route and port collision detection.
- [x] Commit with message `feat: add local server shell`.

**Acceptance Checks:**

- The server can run on a configured localhost port.
- Port collision returns a clear actionable error.
- HTTP route handlers remain thin and delegate to services.

**Completion Evidence:**

- Slice 5 detailed execution plan was added at `docs/superpowers/plans/2026-05-28-stream-jams-slice-5-local-server-shell.md`.
- `apps/server/src/app.ts` now builds a Fastify app from injected metadata and optional server-config services, with health and config routes registered through route modules.
- `apps/server/src/http/routes/health.ts` owns `GET /health`, returning app status and injected version metadata without requiring the process to bind a port.
- `apps/server/src/config/server-config-service.ts` reads non-secret server config, validates server config patches through the core app-config schema, strips extra fields, checks changed ports before persistence, and rejects unavailable ports.
- `apps/server/src/http/routes/config.ts` exposes `GET /config/server` and `PATCH /config/server` while returning structured `400` validation responses and `409` unavailable-port responses.
- `apps/server/src/config/default-config.ts` centralizes the MVP default host `127.0.0.1`, default port `39187`, local data paths, and config-file override behavior.
- Default config path construction is covered for POSIX and Windows path semantics, and repository text checkout/writeback is normalized through `.gitattributes` and `.editorconfig`.
- `apps/server/src/server/port-availability.ts` provides injectable port availability checks and alternate-port suggestions.
- `apps/server/src/server/start-server.ts` reads persisted config, starts the app on the configured localhost port, and returns a structured `PORT_IN_USE_AT_STARTUP` result with suggested alternates for startup port collisions.
- Focused Slice 5 tests passed for health routing, default config, server config service behavior, config HTTP routes, port suggestions, startup collision handling, cross-platform config paths, and UTF-8 config persistence: 6 test files and 19 tests.
- TypeScript validation passed with `pnpm typecheck`. The local environment emitted the expected Node engine warning because it is running Node v26.2.0 while the repo pins Node 24.16.0.
- Gap analysis found no remaining in-scope Slice 5 behavior gaps. Future Slice 6 still owns management sessions and overlay route keys; future Slice 8 still owns SQLite-backed persistence.
- Independent review of the GitHub Advanced Security `js/missing-rate-limiting` comment on `GET /config/server` found a technically accurate but low-impact local filesystem-access warning. Slice 6 should decide whether management routes use shared local rate limiting, another request-throttling control, or an explicit documented suppression for bounded non-secret config reads.

### Slice 6: Management Session And Overlay Route Keys

**Category:** Local authorization.

**Status:** Complete after first-pass implementation and gap closure on branch `codex/slice-6-implementation`; pending final PR review workflow.

**Value:** Creates separate security boundaries for management/configuration operations and overlay output.

**Files:**

- Create `packages/core/src/auth/management-session-service.ts`
- Create `packages/core/src/overlays/overlay-access-service.ts`
- Create `apps/server/src/modules/auth/management-session-service.ts`
- Create `apps/server/src/modules/overlays/overlay-access-service.ts`
- Create `apps/server/src/http/middleware/management-auth.ts`
- Create `apps/server/src/http/middleware/overlay-auth.ts`
- Create or explicitly reject a shared local management rate-limit middleware for filesystem-backed and mutation-capable management routes.
- Create a rate-limited no-password MVP management session issuance route so protected management routes have a coherent local session source.
- Create auth and overlay access tests.

**Steps:**

- [x] Implement management sessions with opaque random session IDs and expiry.
- [x] Implement overlay route keys with opaque random raw keys and stored hashes.
- [x] Add separate live and test overlay key generation.
- [x] Scope overlay keys to either one module-specific output or one unified output.
- [x] Add overlay key verification by route segment, not query string.
- [x] Add key revocation.
- [x] Revisit the Slice 5 GitHub Advanced Security `js/missing-rate-limiting` warning for `GET /config/server`, and either add a shared local rate-limit/throttling control to management routes or document why the bounded local non-secret config read remains an accepted low-risk exception.
- [x] Unit test that a test key cannot authorize live overlay access.
- [x] Unit test that revoked keys fail verification.
- [x] Unit test that stored overlay keys are hashes, not raw keys.
- [x] If rate limiting is added, unit test that repeated unauthenticated or unauthorized requests to management routes are rejected before repeated filesystem-backed work.
- [ ] Commit with message `feat: add local auth boundaries`.

**Acceptance Checks:**

- Management credentials and overlay route keys are separate.
- Overlay route keys cannot mutate app config.
- Module-specific overlay keys cannot authorize unified overlay output, and unified overlay keys cannot authorize module-specific output.
- Overlay keys are redacted from logs.
- Management/config routes have an explicit request-throttling decision before they become broader user-facing APIs: either shared local rate limiting with tests, or a documented exception for bounded localhost-only non-secret reads.

**Completion Evidence And Gap Analysis:**

- Slice 6 detailed execution plan was added at `docs/superpowers/plans/2026-05-29-stream-jams-slice-6-management-session-overlay-route-keys.md`.
- Core authorization contracts were added in `packages/core/src/auth/management-session-service.ts` and `packages/core/src/overlays/overlay-access-service.ts`, with explicit authorized/denied result unions.
- `apps/server/src/modules/auth/management-session-service.ts` implements `mgmt_` management sessions with injectable clocks/id generation, expiry, revocation, and an in-memory MVP repository.
- `apps/server/src/http/routes/management-session.ts` issues no-password MVP management sessions through the shared local rate limiter.
- `apps/server/src/modules/overlays/overlay-access-service.ts` generates `ovl_` raw route keys, stores only `sha256:` hashes, verifies live/test and module/unified scope boundaries, and revokes keys.
- `apps/server/src/http/middleware/management-auth.ts` protects management routes with bearer sessions, and `apps/server/src/http/middleware/overlay-auth.ts` verifies overlay route keys from path segments through injected route-shape resolvers.
- `apps/server/src/http/middleware/local-management-rate-limit.ts` resolves the Slice 5 missing-rate-limiting warning by applying a fixed-window local throttle before management route handlers can perform filesystem-backed reads or writes.
- `apps/server/src/http/routes/config.ts` now runs local throttling and management auth before `GET /config/server` and `PATCH /config/server`.
- Tests cover test-key rejection for live overlay output, revoked key rejection, hash-only overlay key storage, module/unified scope isolation in both directions, query-string overlay key rejection, overlay keys failing config mutation, generated-style overlay key redaction, and repeated unauthenticated or over-limit management requests not reaching the config store.
- First-pass gap analysis found one runtime coherence gap: protected management routes needed an HTTP session issuance source. The gap was closed with `POST /auth/management/sessions` and route tests.
- Focused validation after gap closure passed: `pnpm test -- apps/server/src/http/routes/management-session.test.ts apps/server/src/http/routes/config.test.ts apps/server/src/app.test.ts` reported 27 test files and 83 tests passing; `pnpm test -- apps/server/src/http/routes/config.test.ts apps/server/src/http/middleware/overlay-auth.test.ts` reported 26 test files and 81 tests passing.
- Full validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test` (27 test files and 83 tests), `pnpm test:e2e` (existing Playwright placeholder), `pnpm build`, and `git diff --check`. The local environment emitted the expected Node engine warning because it is running Node v26.2.0 while the repo pins Node 24.16.0.
- Gap analysis found no remaining in-scope Slice 6 behavior gaps before final validation.

### Slice 7: Overlay Module Registry And Composition Model

**Category:** Overlay platform foundation.

**Status:** Complete. Implementation verified on branch `codex/slice-7-overlay-module-registry`.

**Value:** Makes alerts the first module in a broader overlay platform instead of hard-coding the app around alert-only output.

**Files:**

- Create `packages/core/src/overlay-modules/module-definition.ts`
- Create `packages/core/src/overlay-modules/module-registry.ts`
- Create `packages/core/src/overlay-modules/module-config-service.ts`
- Create `packages/core/src/overlay-modules/overlay-composition-service.ts`
- Create `apps/server/src/modules/overlay-modules/static-module-registry.ts`
- Create `apps/server/src/modules/overlay-modules/in-memory-module-config-repository.ts`
- Create `apps/server/src/http/routes/overlay-modules.ts`
- Create overlay module tests.

**Steps:**

- [x] Implement `OverlayModuleRegistry` with static registration for the Alerts module.
- [x] Implement `OverlayModuleConfigService` with enabled/disabled state per module.
- [x] Implement wizard/form metadata support using `OverlayModuleWizardDefinition`.
- [x] Implement `OverlayCompositionService.resolveModuleOutput` for one module-specific overlay.
- [x] Implement `OverlayCompositionService.resolveUnifiedOutput` for all enabled modules selected for a unified overlay.
- [x] Add HTTP routes for listing modules, reading module config, saving module config, and toggling module enabled state.
- [x] Unit test module registration, unknown module lookup, module enable/disable, and wizard schema validation.
- [x] Unit test that disabled modules are excluded from module-specific and unified overlay composition.
- [x] Commit with message `feat: add overlay module registry`.

**Acceptance Checks:**

- Alerts are registered as an overlay module.
- Module enable/disable is independent from alert rule enable/disable.
- The composition service can resolve both module-specific and unified overlay outputs without importing alert internals.

**Completion Evidence:**

- Slice 7 detailed execution plan was added at `docs/superpowers/plans/2026-05-30-stream-jams-slice-7-overlay-module-registry-composition.md`.
- `@stream-jams/core` now exports the built-in Alerts module definition, static overlay module registry, module config service, and overlay composition service.
- Alerts is registered as the first built-in overlay module with module-specific and unified output support, default canvas config, and wizard metadata.
- Module config defaults, saves, and enabled-state toggles are handled through a typed service and repository boundary; the MVP server uses an in-memory repository until Slice 8 adds SQLite.
- Overlay composition resolves module-specific and unified outputs through a runtime snapshot interface, excludes disabled modules, rejects unknown module ids, and validates mismatched runtime snapshots without importing alert internals.
- Management-protected overlay module routes list modules, read config, save config, and toggle enabled state through thin Fastify handlers.
- Focused Slice 7 tests passed for registry, schemas, module config, composition, HTTP routes, and app route guards: 32 test files and 113 tests.
- Full repository validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`.

### Slice 8: Persistence Layer And Repositories

**Category:** Data storage.

**Value:** Provides isolated repository interfaces for app data without leaking SQL into domain logic.

**Files:**

- Create `apps/server/src/modules/db/database.ts`
- Create `apps/server/src/modules/db/migrations/`
- Create `apps/server/src/modules/overlay-modules/sqlite-module-config-repository.ts`
- Create `apps/server/src/modules/overlays/sqlite-overlay-access-key-repository.ts`
- Create `apps/server/src/modules/alerts/sqlite-alert-repository.ts`
- Create `apps/server/src/modules/assets/sqlite-asset-repository.ts`
- Create `apps/server/src/modules/diagnostics/sqlite-log-repository.ts`
- Create core repository contracts for alerts, assets, and diagnostic logs.
- Create repository tests.

**Steps:**

- [x] Add SQLite database initialization and migration runner.
- [x] Create tables for overlay module config, alert collections, alert rules, alert variants, asset metadata, overlay keys, event logs, alert match logs, and playback logs.
- [x] Implement typed repositories behind core interfaces, with explicit row mappers between SQLite rows and domain types.
- [x] Use transaction boundaries for alert rule plus variant writes.
- [x] Unit test repositories against isolated temporary databases.
- [x] Unit test that deleted alert collections do not leave rules in an impossible activation state.
- [x] Commit with message `feat: add sqlite repositories`.

**Acceptance Checks:**

- Repository tests do not require the full server to run.
- Domain services depend on repository interfaces, not SQLite modules.
- No React component, Fastify route handler, overlay renderer, or domain service imports a SQLite implementation directly.
- Data migrations are deterministic.

**Completion Evidence:**

- Slice 8 detailed execution plan was added at `docs/superpowers/plans/2026-05-30-stream-jams-slice-8-sqlite-repositories.md`.
- SQLite setup uses Node `node:sqlite` with foreign-key enforcement, deterministic migration records, defensive defaults, and a transaction helper.
- Initial migration creates tables for module config, overlay keys, alert collections/rules/collection links/conditions/variants, asset metadata, event logs, alert match logs, and playback logs.
- SQLite adapters persist existing overlay module config and overlay access key interfaces plus new core alert, asset, and diagnostics repository contracts.
- Alert rule writes persist rule rows, collection links, conditions, and variants in one transaction; rollback coverage verifies failed variant writes leave the previous rule intact.
- Deleted alert collections cascade through rule collection links, and repository reads return remaining valid collection IDs rather than stale references.
- Focused repository tests and full validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (38 test files and 127 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- Architecture scan found SQLite imports only in server database/repository modules and their tests, not in core domain services, route handlers, overlay renderers, React code, or app wiring.

### Slice 9: Asset Import And Serving

**Category:** Media assets.

**Value:** Lets users add local media safely before alert playback exists.

**Files:**

- Create `packages/core/src/assets/asset-validator.ts`
- Create `packages/core/src/assets/media-import-pipeline.ts`
- Create `apps/server/src/modules/assets/local-asset-store.ts`
- Create `apps/server/src/http/routes/assets.ts`
- Create `apps/web/src/management/assets/`
- Create asset tests.

**Steps:**

- [x] Implement `AssetValidator` with allowed MIME types, file extensions, and size limits for common browser-safe formats.
- [x] Define `MediaImportPipeline` with validation and future transcoding stages, but make the MVP transcoding stage a no-op.
- [x] Copy imported files into the configured asset directory using generated file names.
- [x] Store original file name, normalized media type, size, checksum, and relative storage path.
- [x] Serve assets through authenticated local routes that prevent path traversal.
- [x] Add management UI for listing and importing assets.
- [x] Unit test file type, file size, extension mismatch, path traversal attempts, and missing file behavior.
- [x] Integration test asset import and asset serving.
- [x] Commit with message `feat: add asset management`.

**Acceptance Checks:**

- Asset files are not served by arbitrary filesystem path.
- Invalid media files are rejected before storage.
- Import-time transcoding can be added later by replacing the no-op transcoding stage without changing alert, module, or asset repository contracts.
- Missing assets produce a user-visible diagnostic.

**Completion Evidence:**

- Slice 9 detailed execution plan was added at `docs/superpowers/plans/2026-05-30-stream-jams-slice-9-asset-management.md`.
- Core asset validation accepts common browser-safe image, GIF, video, and audio MIME/extension/signature combinations and rejects unsupported media, extension mismatches, signature mismatches, empty files, and over-limit files before storage.
- Media import orchestration validates first, runs an MVP no-op transcoder, computes checksums, writes generated storage paths, and persists typed asset metadata.
- Local asset storage writes generated media-type paths and rejects absolute paths, backslash paths, and `..` traversal before filesystem reads.
- Management-protected asset routes list assets, import octet-stream file bytes with explicit file metadata headers and a body limit aligned to the largest allowed asset policy, serve assets by asset ID with `X-Content-Type-Options: nosniff`, and return structured diagnostics for invalid imports, missing records, missing files, and invalid storage paths.
- The web management shell includes an asset panel for listing assets, selecting a file, importing, refreshing the list, and showing import diagnostics.
- Focused tests and full validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (43 test files and 151 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- Architecture scans found no Node-only imports or direct `@stream-jams/core` imports in web UI code; filesystem and SQLite concrete implementations are confined to server module/runtime boundaries.

### Slice 10: Alerts Module Configuration: Collections, Rules, And Variants CRUD

**Category:** Alerts module configuration.

**Value:** Enables users to configure the Alerts module catalog before live event ingestion while keeping alert-specific state behind the module boundary.

**Files:**

- Create `packages/core/src/alerts/alert-service.ts`
- Create `apps/server/src/http/routes/alerts.ts`
- Create `apps/server/src/http/routes/collections.ts`
- Create `apps/web/src/management/alerts/`
- Create `apps/web/src/management/collections/`
- Create `apps/web/src/management/modules/alerts/`
- Create alert configuration tests.

**Steps:**

- [x] Implement `AlertService` with collection, rule, and variant operations.
- [x] Register the Alerts module configuration wizard with the overlay module registry.
- [x] Enforce that an alert can be individually disabled.
- [x] Enforce that multiple collections can be enabled at once.
- [x] Enforce that an alert in multiple active collections is considered once per event.
- [x] Add management UI lists for rules and collections.
- [x] Add management UI toggles for individual alert enabled state and collection active state.
- [x] Unit test collection activation and individual rule disable precedence.
- [x] Integration test alert CRUD routes.
- [x] Commit with message `feat: add alert configuration`.

**Acceptance Checks:**

- Collection toggles and individual alert toggles are independent.
- Disabled alert rules do not match even when their collection is active.
- Alert configuration is accessible through services, not direct database calls from routes.
- Alert configuration is owned by the Alerts module and exposed to the management shell through module routes and API clients.

**Completion Evidence:**

- Slice 10 detailed execution plan was added at `docs/superpowers/plans/2026-05-30-stream-jams-slice-10-alert-configuration.md`.
- `DefaultAlertService` provides collection, rule, and variant operations over `AlertRepository`, plus activation state, active-rule filtering for multiple active collections, disabled-rule precedence, duplicate suppression, and service-level duplicate/cross-rule variant ID conflict checks.
- Alerts module wizard metadata now exposes canvas, collections, rules, and variants steps through the overlay module registry.
- Management-protected alert routes expose collection CRUD/toggles, rule CRUD/toggles, variant upsert/delete, and activation state through `AlertService` rather than direct database calls, with structured errors for missing collection references and variant ID conflicts.
- The web management shell includes an Alerts panel for listing collections/rules and toggling collection active state and individual rule enabled state through an API client.
- Focused tests and full validation passed: `pnpm lint`, `pnpm typecheck`, `pnpm test` (47 test files and 171 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- Architecture scans found no core/server/Node/SQLite imports in web UI code and no direct SQLite access in production alert HTTP routes.

### Slice 11: Alert Matching And Resolution Engine

**Category:** Alert logic.

**Value:** Converts normalized events into one or more playable alert instructions.

**Files:**

- Create `packages/core/src/alerts/alert-matcher.ts`
- Create `packages/core/src/alerts/condition-evaluator.ts`
- Create `packages/core/src/alerts/alert-resolver.ts`
- Create `packages/core/src/templates/template-renderer.ts`
- Create matcher and resolver tests.

**Steps:**

- [x] Implement condition evaluation for exact, minimum, maximum, range, tier, tenure, gift count, raid viewers, cheer amount, and channel point reward.
- [x] Implement `AlertMatcher.findMatches`.
- [x] Implement variant selection by condition, priority, and weighted random selection.
- [x] Implement template rendering with event variables.
- [x] Implement HTML escaping for rendered alert text by default.
- [x] Unit test multiple matching alerts for one event.
- [x] Unit test duplicate suppression for rules present in multiple active collections.
- [x] Unit test template rendering and escaping.
- [x] Commit with message `feat: add alert matching engine`.

**Acceptance Checks:**

- Matching is deterministic except where weighted random selection is explicitly configured.
- The matcher returns all active matching alerts.
- Alert resolution returns overlay-ready instructions without raw provider payloads.

**Completion Evidence (2026-05-30):**

- Added pure core alert condition evaluation, alert matching, alert resolution, and safe template rendering APIs exported from `@stream-jams/core`.
- Matcher tests cover multiple matching alerts, deterministic priority ordering, disabled/mismatched/failing rules, and duplicate rule-ID suppression across active collection expansion.
- Resolver tests cover priority ordering, injected weighted randomness, disabled variant exclusion, all-disabled fail-closed behavior, escaped text/TTS rendering, visual/audio/TTS instructions, and no raw provider payload leakage.
- Added a safe root `.env.example` documenting `STREAM_JAMS_CONFIG_PATH` without committing secrets.
- Architecture import scan found no SQLite, Fastify, React, Twitch, server/web package, or Node runtime imports in the new core matcher/resolver/template files.
- Full validation passed with `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 test files and 186 tests), `pnpm test:e2e`, `pnpm build`, and `git diff --check`.

### Slice 12: Playback Queue Service

**Category:** Runtime orchestration.

**Value:** Controls alert sequencing, pause/mute state, replay, skip, cooldowns, and duplicate protection.

**Files:**

- Create `packages/core/src/playback/playback-queue.ts`
- Create `packages/core/src/playback/cooldown-service.ts`
- Create `packages/core/src/playback/dedupe-service.ts`
- Create `apps/server/src/modules/playback/playback-coordinator.ts`
- Create `apps/server/src/http/routes/playback.ts`
- Create playback tests.

**Steps:**

- [ ] Implement queue enqueue behavior for all resolved alerts from one event.
- [ ] Implement priority ordering within an event and across queued items.
- [ ] Implement cooldown checks by rule ID and event type.
- [ ] Implement duplicate event protection using provider event IDs.
- [ ] Implement skip, replay recent, pause, resume, mute, unmute, and do-not-disturb.
- [ ] Unit test sequential playback snapshots.
- [ ] Unit test cooldown and dedupe behavior.
- [ ] Integration test playback control routes.
- [ ] Commit with message `feat: add playback queue`.

**Acceptance Checks:**

- Queue logic is testable without WebSocket clients.
- Queue snapshots are serializable for management UI and overlay clients.
- Playback controls do not require direct mutation of queue internals.

### Slice 13: Overlay WebSocket Gateway And Browser Overlay Shell

**Category:** Browser-source runtime.

**Value:** Creates the browser-source paths and live transport needed to render module-specific overlays and unified overlays.

**Files:**

- Create `apps/server/src/websocket/overlay-gateway.ts`
- Create `apps/server/src/http/routes/overlays.ts`
- Create `apps/web/src/overlay/OverlayApp.tsx`
- Create `apps/web/src/overlay/overlay-client.ts`
- Create `apps/web/src/overlay/components/`
- Create overlay gateway and component tests.

**Steps:**

- [ ] Add live and test overlay HTTP routes using route keys.
- [ ] Add module-specific overlay HTTP routes using module-scoped route keys.
- [ ] Add unified overlay HTTP routes using unified route keys.
- [ ] Add authenticated overlay WebSocket connections.
- [ ] Register overlay clients with overlay ID, module ID, purpose, and output scope.
- [ ] Deliver playback instructions only to matching module-specific or unified overlay clients.
- [ ] Render transparent fullscreen overlay root.
- [ ] Render module snapshots from `OverlayCompositionService`.
- [ ] Render image, GIF, video, text, and audio playback instructions.
- [ ] Report playback start, completion, and failure to the server.
- [ ] Unit test gateway client registration and authorization.
- [ ] Component test overlay rendering for image, video, text, and audio instruction shapes.
- [ ] Playwright test that a test overlay renders a test alert.
- [ ] Commit with message `feat: add browser source overlay`.

**Acceptance Checks:**

- Live and test overlays are isolated.
- Module-specific and unified overlays are isolated.
- Disabled modules do not render in either output mode.
- Overlay can reconnect without requiring a server restart.
- Overlay does not receive management-only data.

### Slice 14: Management UI Shell And Core Workflows

**Category:** Management user experience.

**Value:** Provides the practical UI needed to configure and operate the MVP.

**Files:**

- Create `apps/web/src/management/ManagementApp.tsx`
- Create `apps/web/src/management/navigation/`
- Create `apps/web/src/management/dashboard/`
- Create `apps/web/src/management/settings/`
- Create `apps/web/src/management/modules/`
- Create `apps/web/src/management/overlays/`
- Create `apps/web/src/management/playback/`
- Create management UI tests.

**Steps:**

- [ ] Add dashboard with Twitch status, overlay status, queue status, and recent errors.
- [ ] Add settings screen for local port display and update.
- [ ] Add module management screen listing available modules and enabled state.
- [ ] Add module wizard/form host that renders module-provided configuration steps.
- [ ] Add overlay screen with copyable module-specific and unified live and test URLs.
- [ ] Add playback controls for pause, resume, skip, replay, mute, unmute, and do-not-disturb.
- [ ] Add connected overlay client list with live and test labels.
- [ ] Add route-level management session handling.
- [ ] Component test each management panel.
- [ ] Playwright test core management navigation and copyable overlay URL display.
- [ ] Commit with message `feat: add management shell`.

**Acceptance Checks:**

- Management UI can operate against mocked API responses in component tests.
- Management actions call API clients rather than importing server logic.
- Module screens are driven by module definitions rather than hard-coded per-module shell logic.
- Test output remains visibly separate from live output.

### Slice 15: Moderation And Text Template Safety

**Category:** Security and content safety.

**Value:** Protects the overlay and TTS providers from unsafe viewer-controlled text.

**Files:**

- Create `packages/core/src/moderation/moderation-service.ts`
- Create `packages/core/src/moderation/default-rules.ts`
- Create `packages/core/src/templates/safe-template-renderer.ts`
- Create `apps/server/src/http/routes/moderation.ts`
- Create moderation tests.

**Steps:**

- [ ] Implement max length controls for rendered alert text and TTS text.
- [ ] Implement blocked terms with case-insensitive matching.
- [ ] Implement URL stripping option for TTS and rendered messages.
- [ ] Implement HTML escaping as the default rendering behavior.
- [ ] Add management UI for basic blocked terms and URL stripping settings.
- [ ] Unit test XSS-like strings, long messages, URL stripping, and blocked term replacement.
- [ ] Commit with message `feat: add moderation safeguards`.

**Acceptance Checks:**

- Viewer-controlled text cannot render raw HTML.
- TTS text is moderated before any provider receives it.
- Moderation results are inspectable in diagnostics without exposing secrets.

### Slice 16: TTS Provider Abstraction And First Provider

**Category:** TTS.

**Value:** Adds TTS without coupling alert logic to one provider.

**Files:**

- Create `packages/core/src/tts/tts-provider.ts`
- Create `packages/core/src/tts/tts-service.ts`
- Create `apps/server/src/modules/tts/tts-provider-registry.ts`
- Create `apps/server/src/modules/tts/browser-speech-tts-provider.ts`
- Create `apps/server/src/http/routes/tts.ts`
- Create `apps/web/src/management/tts/`
- Create TTS tests.

**Steps:**

- [ ] Implement `TtsProvider` and provider registry.
- [ ] Implement `TtsService` that applies moderation and provider capability checks.
- [ ] Add Speaker.bot as the first MVP TTS provider.
- [ ] Add provider capability display in the management UI.
- [ ] Add TTS test action using sample event data.
- [ ] Integrate TTS instructions into `AlertResolver`.
- [ ] Unit test capability checks for unsupported voice, rate, pitch, and volume options.
- [ ] Unit test provider failure behavior.
- [ ] Commit with message `feat: add tts abstraction`.

**Acceptance Checks:**

- Alert resolution can include TTS without knowing provider details.
- Provider-specific unsupported controls are rejected or hidden.
- TTS failure does not crash visual alert playback.

### Slice 17: Twitch OAuth And Account Connection

**Category:** Twitch integration.

**Value:** Lets the app securely connect a Twitch account and store provider secrets outside plain config.

**Files:**

- Create `apps/server/src/modules/twitch/twitch-oauth-service.ts`
- Create `apps/server/src/modules/twitch/twitch-api-client.ts`
- Create `apps/server/src/http/routes/twitch-auth.ts`
- Create `apps/web/src/management/twitch/`
- Create Twitch OAuth tests.

**Steps:**

- [ ] Implement Twitch OAuth authorization URL generation with required scopes.
- [ ] Implement OAuth callback handling.
- [ ] Store access and refresh tokens through `SecretStore`.
- [ ] Store non-secret account metadata in SQLite.
- [ ] Implement token refresh through a Twitch API client adapter.
- [ ] Add management UI connection status and disconnect action.
- [ ] Unit test scope generation and secret references.
- [ ] Integration test OAuth callback with mocked Twitch responses.
- [ ] Commit with message `feat: add twitch account connection`.

**Acceptance Checks:**

- Twitch tokens never appear in app config or logs.
- OAuth code paths are testable with mocked HTTP.
- Disconnect removes stored secret references and provider account metadata.

### Slice 18: Twitch EventSub WebSocket Provider

**Category:** Twitch integration.

**Value:** Ingests live Twitch events through a provider adapter.

**Files:**

- Create `apps/server/src/modules/twitch/twitch-eventsub-client.ts`
- Create `apps/server/src/modules/twitch/twitch-event-normalizer.ts`
- Create `apps/server/src/modules/events/event-ingestion-service.ts`
- Create Twitch EventSub tests.

**Steps:**

- [ ] Implement EventSub WebSocket session lifecycle.
- [ ] Register subscriptions for MVP Twitch event types based on granted scopes.
- [ ] Normalize Twitch EventSub messages into `NormalizedStreamEvent`.
- [ ] Reconnect with backoff on WebSocket disconnect.
- [ ] Surface provider status to diagnostics and management UI.
- [ ] Unit test each Twitch event normalizer.
- [ ] Integration test reconnect behavior with a mocked EventSub WebSocket server.
- [ ] Commit with message `feat: add twitch eventsub ingestion`.

**Acceptance Checks:**

- Event ingestion depends on `EventProvider` and normalizer interfaces.
- Twitch payloads do not leak into alert matching.
- Provider failures are visible but do not stop the local server.

### Slice 19: Event-To-Playback Pipeline

**Category:** End-to-end alert runtime.

**Value:** Connects Twitch event ingestion to the Alerts module, then dispatches resolved alert output through module-specific and unified overlay outputs.

**Files:**

- Create `apps/server/src/modules/events/event-pipeline.ts`
- Modify playback coordinator and overlay gateway wiring.
- Create event pipeline tests.

**Steps:**

- [ ] Wire normalized events into the alert matcher.
- [ ] Resolve each match into visual, audio, text, and TTS instructions.
- [ ] Enqueue all resolved alerts for the source event.
- [ ] Dispatch queue state and playback instructions to authorized Alerts module overlay clients.
- [ ] Dispatch the same resolved Alerts module snapshot to unified overlay clients when the Alerts module is enabled.
- [ ] Write event ingestion, alert match, and playback log records.
- [ ] Unit test pipeline behavior with mocked repositories, matcher, resolver, queue, gateway, and logger.
- [ ] Integration test a synthetic Twitch follow event reaching test overlay playback.
- [ ] Commit with message `feat: wire event playback pipeline`.

**Acceptance Checks:**

- Pipeline orchestration is tested without a real Twitch connection.
- A synthetic event can produce multiple alert playback instructions.
- Module-specific, unified, live, and test dispatch remain isolated.

### Slice 20: Diagnostics And Redacted Export

**Category:** Observability.

**Value:** Makes the local app supportable without leaking secrets.

**Files:**

- Create `apps/server/src/modules/diagnostics/diagnostics-service.ts`
- Create `apps/server/src/http/routes/diagnostics.ts`
- Create `apps/web/src/management/diagnostics/`
- Create diagnostics tests.

**Steps:**

- [ ] Add event ingestion log view.
- [ ] Add alert match log view.
- [ ] Add playback log view.
- [ ] Add provider error log view.
- [ ] Add redacted diagnostic export endpoint.
- [ ] Add management UI for diagnostics filters.
- [ ] Unit test redacted exports with representative sensitive data.
- [ ] Integration test diagnostics endpoints.
- [ ] Commit with message `feat: add diagnostics`.

**Acceptance Checks:**

- Diagnostic exports include useful operational data.
- Diagnostic exports never include OAuth tokens, overlay keys, auth headers, or signed URLs.

### Slice 21: MVP Hardening And End-To-End Verification

**Category:** Release readiness.

**Value:** Confirms the MVP works as a cohesive local app.

**Files:**

- Create `tests/e2e/management-alerts.spec.ts`
- Create `tests/e2e/overlay-playback.spec.ts`
- Create `tests/e2e/security-boundaries.spec.ts`
- Create `docs/mvp-runbook.md`

**Steps:**

- [ ] Add E2E test for management UI creating a collection, alert rule, variant, and test alert.
- [ ] Add E2E test for live overlay receiving a synthetic event.
- [ ] Add E2E test for module-specific Alerts overlay receiving a synthetic event.
- [ ] Add E2E test for unified overlay rendering enabled modules and excluding disabled modules.
- [ ] Add E2E test that test overlay does not receive real provider events.
- [ ] Add E2E test that a revoked overlay key cannot connect.
- [ ] Add E2E test that port update persists and invalid ports are rejected.
- [ ] Add runbook covering startup, port changes, overlay URLs, Twitch connection, and diagnostics export.
- [ ] Run full verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
- [ ] Commit with message `test: harden mvp flows`.

**Acceptance Checks:**

- MVP critical flows pass in automated tests.
- Security boundaries are covered by tests.
- The runbook gives a streamer enough information to run the local app.

## Feature Slice Order

1. Repository and quality foundation.
2. Core domain types.
3. Config and secret storage.
4. Structured logging foundation.
5. Local server shell and configurable port.
6. Management session and overlay route keys.
7. Overlay module registry and composition model.
8. Persistence layer and repositories.
9. Asset import and serving.
10. Alerts module configuration: collections, rules, and variants CRUD.
11. Alert matching and resolution engine.
12. Playback queue service.
13. Overlay WebSocket gateway and browser overlay shell.
14. Management UI shell and core workflows.
15. Moderation and text template safety.
16. TTS provider abstraction and first provider.
17. Twitch OAuth and account connection.
18. Twitch EventSub WebSocket provider.
19. Event-to-playback pipeline.
20. Diagnostics and redacted export.
21. MVP hardening and end-to-end verification.

This order front-loads the domain, security, and overlay module boundaries, then builds local hosting, module configuration, alert logic, runtime transport, UI workflows, provider integrations, and final hardening.

## Unit Test Strategy

- Core package tests cover pure domain logic: event schemas, module composition, alert matching, variant selection, template rendering, moderation, cooldowns, dedupe, queue state, and TTS capability handling.
- Server module tests cover adapters: config file store, secret store, redactor, structured logger, log retention, repositories, module registry, OAuth service, Twitch API client, EventSub client, asset store, overlay gateway, and diagnostics export.
- Web component tests cover management screens and overlay renderers with mocked API and WebSocket clients.
- E2E tests cover only critical workflows that prove the pieces work together.
- Provider tests use mocked HTTP and WebSocket servers; no unit or CI test should require real Twitch credentials.

## Mandatory Encapsulation Rules

- React components may call API clients, not repositories or server services.
- HTTP route handlers may validate requests and call services, but they must not contain alert matching, queueing, provider, or persistence logic.
- Management shell components may render module wizard definitions, but they must not import module-specific business logic.
- Overlay shell components may render module snapshots, but they must not decide module enablement or compose module state directly.
- Provider adapters may translate provider payloads, but they must not decide alert behavior.
- Overlay module composition must not know about alert matching internals, Twitch, TTS providers, SQLite, Fastify, or React.
- Alert matching must not know about Twitch, Speaker.bot, Tangia, Streamlabs, SQLite, Fastify, React, or future modules such as a music widget.
- Playback queue must not know about WebSocket transport details.
- TTS providers must not receive unmoderated viewer-controlled text.
- Logging and diagnostics must pass through `Redactor` before write, export, or display.

## First-Pass Self Review

### Coverage Confirmed

- Browser-source-only output is represented by overlay routes and the overlay gateway slices.
- Module-specific and unified overlay outputs are represented by the overlay module registry, composition service, and overlay gateway slices.
- Configurable port handling is represented by the server shell slice.
- Structured logging is represented by the logging foundation slice and diagnostics slice.
- Unguessable overlay route keys are represented by the local authorization slice.
- Independent overlay module enable/disable is represented by the overlay module registry and config service slice.
- Twitch MVP ingestion is represented by OAuth and EventSub slices.
- Alerts as the first module, alert collections, and all-matching behavior are represented by the Alerts module configuration and matching slices.
- TTS provider abstraction is represented by the TTS slice and service interfaces.
- Security at rest and in flight is represented by secret storage, authorization, redaction, local communication, and diagnostics slices.
- Unit-testable service logic is represented by core package boundaries and mandatory encapsulation rules.

### Gaps Or Risks

- Electron is selected as the desktop packaging path after MVP stabilization, but installer, signing, auto-update, and service lifecycle details remain unresolved.
- Speaker.bot is the first target TTS provider.
- The exact Twitch OAuth scope set needs a dedicated scope matrix before implementation.
- Asset size limits and supported media formats need explicit product decisions.
- Management access design is intentionally local and lightweight; packaging may change how sessions are initialized.
- SQLite driver choice and native dependency handling need validation against local development and future Electron packaging.
- Docker/cloud hosting changes security, networking, and secret-storage assumptions and needs a separate deployment-mode design.
- Overlay animation capabilities are listed as runtime requirements but need a design pass for animation presets and timing controls.
- Future external module support is not designed; the MVP assumes modules are shipped with the app and registered statically.
- The relationship between the future `stream-jams-music-widget` project and this app needs a technical integration decision.

## Remaining Questions For Further Elaboration

1. Which Electron packaging, signing, installer, auto-update, and service lifecycle toolchain should be used after MVP stabilization?

2. What exact file formats and size limits should the MVP validation-only media importer accept before transcoding is added?

3. Should future overlay modules be shipped only as internal app modules, or should the long-term design allow external/plugin-style modules?

4. For `stream-jams-music-widget`, should the intended future integration be a code migration into this app, a shared package consumed by both projects, or a separate local service that Stream Jams embeds through a module adapter?

5. For unified overlay URLs, should users choose exactly which modules appear in the unified output, or should the unified output always include every enabled module?

6. Should module-specific overlay URLs target a module type, such as `alerts`, or a module instance, such as `alerts-main`?

7. What minimum Docker/cloud-hosting security posture is required before publishing an official image?
