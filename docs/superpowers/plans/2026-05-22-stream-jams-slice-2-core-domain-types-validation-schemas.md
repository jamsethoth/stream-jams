# Stream Jams Slice 2 Core Domain Types And Validation Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the shared TypeScript domain language and runtime Zod validation schemas that every Stream Jams service, API, WebSocket message, repository, and UI workflow will build on.

**Architecture:** Slice 2 lives entirely in `packages/core` and introduces framework-independent type modules grouped by domain. Runtime schemas sit beside their matching type definitions and are exported from the core package only after all domain files compile. The work is split so multiple agents can implement independent files in parallel without editing each other's files.

**Tech Stack:** TypeScript strict mode, Node ESM package exports, Zod for runtime validation, Vitest for schema and type-focused unit tests, pnpm workspace scripts.

---

## Source Plan Reference

This plan decomposes **Slice 2: Core Domain Types And Validation Schemas** from `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`.

Original Slice 2 value:

- Define the shared language used by every service layer.
- Create core domain type files for events, alerts, assets, overlay modules, overlays, playback, TTS, and security.
- Add Zod schemas for HTTP and WebSocket boundary payloads.
- Unit test schema acceptance for valid follow, subscription, cheer, raid, and channel point event examples.
- Unit test schema rejection for missing required event identity, invalid event type, invalid alert duration, and invalid overlay purpose.

## Current Repository Baseline

Slice 1 is already merged into `origin/main`. The current `packages/core` package contains:

```text
packages/core/
  package.json
  tsconfig.json
  src/
    index.ts
    version.ts
    version.test.ts
```

The package currently has only `typescript` as a dev dependency. Slice 2 adds `zod` as a production dependency because the schemas are part of the runtime API boundary.

## Agentic Execution Model

Use branch `codex/slice-2-core-domain-types-validation-schemas`.

Execution order:

1. Run **Sub-Slice 2.0** first. It adds the shared runtime dependency and schema helper file.
2. Run **Sub-Slices 2.1 through 2.4** in parallel. Each worker owns disjoint files and must not edit `packages/core/src/index.ts`.
3. Run **Sub-Slice 2.5** last. It owns package barrel exports and whole-package verification.

Parallel worker rule:

- Workers are not alone in the codebase. Do not revert edits made by other workers. Stay inside the files listed for the assigned sub-slice.
- If another worker's file is needed for an import, import only the public file path already named in this plan.
- Only Sub-Slice 2.5 edits `packages/core/src/index.ts`.
- Keep commits small. Each sub-slice ends with its own commit.

## Scope Boundaries

### In Scope

- Core TypeScript types for MVP stream events, alerts, assets, overlay modules, overlays, playback, TTS, and security.
- Zod schemas for all data that crosses HTTP, WebSocket, provider-normalization, persistence, or UI form boundaries.
- Representative valid event fixtures for follow, subscription, cheer, raid, and channel point redemption.
- Invalid schema tests for missing event identity, unsupported event type, invalid alert duration, and invalid overlay purpose.
- A final barrel export that makes the domain contracts available from `@stream-jams/core`.

### Out Of Scope

- Fastify routes, WebSocket gateway implementation, SQLite repositories, Twitch OAuth, Twitch EventSub client code, management UI workflows, overlay rendering, asset file import, TTS provider calls, logging implementation, and Electron packaging.
- Any service implementation that consumes these types.
- Database migrations. Slice 8 owns persistence.

### Non-Negotiable Constraints

- Keep these modules pure TypeScript. They must not import Fastify, React, Vite, SQLite, filesystem APIs, or browser-only APIs.
- Use `readonly` properties in exported interfaces and inferred schema types where practical.
- Use Zod schemas at boundaries and export `z.infer` types when the runtime schema should be the source of truth.
- Keep event schemas discriminated by `type`.
- Keep overlay `purpose` constrained to `"live" | "test"`.
- Keep alert `durationMs` positive and bounded.
- Preserve existing `version.ts` and `version.test.ts`.
- All new direct dependencies must use exact versions.

## Target File Structure

```text
packages/core/
  package.json
  src/
    alerts/
      schemas.test.ts
      schemas.ts
      types.ts
    assets/
      schemas.ts
      types.ts
    events/
      schemas.test.ts
      schemas.ts
      types.ts
    overlay-modules/
      schemas.ts
      types.ts
    overlays/
      schemas.test.ts
      schemas.ts
      types.ts
    playback/
      schemas.ts
      types.ts
    security/
      schemas.ts
      types.ts
    shared/
      schemas.ts
    tts/
      schemas.ts
      types.ts
    index.ts
    version.ts
    version.test.ts
```

## Sub-Slice 2.0: Runtime Schema Foundation

**Purpose:** Add Zod as a runtime dependency and introduce shared schema primitives that domain slices can import without coordinating with each other.

**Files:**

- Modify: `packages/core/package.json`
- Create: `packages/core/src/shared/schemas.ts`

**Ownership:** Only this sub-slice edits `packages/core/package.json`.

- [ ] **Step 1: Add Zod as an exact runtime dependency**

Modify `packages/core/package.json` so it includes:

```json
{
  "name": "@stream-jams/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --emitDeclarationOnly false",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "3.24.1"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  }
}
```

- [ ] **Step 2: Install dependency and update lockfile**

Run:

```bash
pnpm install --filter @stream-jams/core...
pnpm install --frozen-lockfile
```

Expected:

- `pnpm-lock.yaml` changes to include `zod@3.24.1`.
- The frozen install exits with status 0.

- [ ] **Step 3: Create shared schema primitives**

Create `packages/core/src/shared/schemas.ts`:

```ts
import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const nonEmptyStringSchema = z.string().trim().min(1);

export const nullableNonEmptyStringSchema = nonEmptyStringSchema.nullable();

export const positiveIntegerSchema = z.number().int().positive();

export const nonNegativeIntegerSchema = z.number().int().min(0);

export const metadataSchema = z.record(z.unknown());

export const uuidLikeIdSchema = nonEmptyStringSchema;

export const overlayPurposeSchema = z.enum(["live", "test"]);

export const overlayScopeSchema = z.enum(["module", "unified"]);

export const overlayElementLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  zIndex: z.number().int()
});

export type OverlayPurpose = z.infer<typeof overlayPurposeSchema>;
export type OverlayScope = z.infer<typeof overlayScopeSchema>;
export type OverlayElementLayout = z.infer<typeof overlayElementLayoutSchema>;
```

- [ ] **Step 4: Verify the foundation compiles**

Run:

```bash
pnpm --filter @stream-jams/core typecheck
```

Expected:

- TypeScript exits with status 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/package.json packages/core/src/shared/schemas.ts pnpm-lock.yaml
git commit -m "chore: add core schema foundation"
```

## Sub-Slice 2.1: Event Domain Types And Schemas

**Purpose:** Define normalized stream events as the canonical provider-independent event contract for Twitch MVP events.

**Files:**

- Create: `packages/core/src/events/types.ts`
- Create: `packages/core/src/events/schemas.ts`
- Create: `packages/core/src/events/schemas.test.ts`

**Ownership:** This worker owns only `packages/core/src/events/**`.

- [ ] **Step 1: Create event types**

Create `packages/core/src/events/types.ts`:

```ts
export type StreamEventType =
  | "follow"
  | "subscription"
  | "resubscription"
  | "cheer"
  | "raid"
  | "channel_point_redemption";

export interface StreamEventActor {
  readonly id: string | null;
  readonly displayName: string;
}

export interface BaseNormalizedStreamEvent {
  readonly id: string;
  readonly providerId: "twitch";
  readonly occurredAt: string;
  readonly actor: StreamEventActor;
  readonly message: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface FollowEvent extends BaseNormalizedStreamEvent {
  readonly type: "follow";
  readonly amount: null;
}

export interface SubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "subscription";
  readonly amount: number;
  readonly tier: "1000" | "2000" | "3000" | "prime";
}

export interface ResubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "resubscription";
  readonly amount: number;
  readonly tier: "1000" | "2000" | "3000" | "prime";
  readonly streakMonths: number | null;
}

export interface CheerEvent extends BaseNormalizedStreamEvent {
  readonly type: "cheer";
  readonly amount: number;
}

export interface RaidEvent extends BaseNormalizedStreamEvent {
  readonly type: "raid";
  readonly amount: number;
}

export interface ChannelPointRedemptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "channel_point_redemption";
  readonly amount: null;
  readonly rewardId: string;
  readonly rewardTitle: string;
  readonly userInput: string | null;
}

export type NormalizedStreamEvent =
  | FollowEvent
  | SubscriptionEvent
  | ResubscriptionEvent
  | CheerEvent
  | RaidEvent
  | ChannelPointRedemptionEvent;
```

- [ ] **Step 2: Create event schemas**

Create `packages/core/src/events/schemas.ts`:

```ts
import { z } from "zod";
import {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "../shared/schemas.js";

const streamEventActorSchema = z.object({
  id: nullableNonEmptyStringSchema,
  displayName: nonEmptyStringSchema
});

const baseEventSchema = z.object({
  id: uuidLikeIdSchema,
  providerId: z.literal("twitch"),
  occurredAt: isoDateTimeSchema,
  actor: streamEventActorSchema,
  message: z.string().nullable(),
  metadata: metadataSchema
});

export const followEventSchema = baseEventSchema.extend({
  type: z.literal("follow"),
  amount: z.null()
});

export const subscriptionTierSchema = z.enum(["1000", "2000", "3000", "prime"]);

export const subscriptionEventSchema = baseEventSchema.extend({
  type: z.literal("subscription"),
  amount: positiveIntegerSchema,
  tier: subscriptionTierSchema
});

export const resubscriptionEventSchema = baseEventSchema.extend({
  type: z.literal("resubscription"),
  amount: positiveIntegerSchema,
  tier: subscriptionTierSchema,
  streakMonths: positiveIntegerSchema.nullable()
});

export const cheerEventSchema = baseEventSchema.extend({
  type: z.literal("cheer"),
  amount: positiveIntegerSchema
});

export const raidEventSchema = baseEventSchema.extend({
  type: z.literal("raid"),
  amount: positiveIntegerSchema
});

export const channelPointRedemptionEventSchema = baseEventSchema.extend({
  type: z.literal("channel_point_redemption"),
  amount: z.null(),
  rewardId: nonEmptyStringSchema,
  rewardTitle: nonEmptyStringSchema,
  userInput: z.string().nullable()
});

export const normalizedStreamEventSchema = z.discriminatedUnion("type", [
  followEventSchema,
  subscriptionEventSchema,
  resubscriptionEventSchema,
  cheerEventSchema,
  raidEventSchema,
  channelPointRedemptionEventSchema
]);

export type NormalizedStreamEventInput = z.infer<typeof normalizedStreamEventSchema>;
```

- [ ] **Step 3: Test valid and invalid event payloads**

Create `packages/core/src/events/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizedStreamEventSchema } from "./schemas.js";

const baseEvent = {
  id: "evt-1",
  providerId: "twitch",
  occurredAt: "2026-05-22T12:34:56.000Z",
  actor: {
    id: "user-1",
    displayName: "JamSeth"
  },
  message: null,
  metadata: {}
} as const;

describe("normalizedStreamEventSchema", () => {
  it("accepts representative MVP event payloads", () => {
    const payloads = [
      { ...baseEvent, type: "follow", amount: null },
      { ...baseEvent, id: "evt-2", type: "subscription", amount: 1, tier: "1000" },
      { ...baseEvent, id: "evt-3", type: "cheer", amount: 500, message: "great stream" },
      { ...baseEvent, id: "evt-4", type: "raid", amount: 42 },
      {
        ...baseEvent,
        id: "evt-5",
        type: "channel_point_redemption",
        amount: null,
        rewardId: "reward-1",
        rewardTitle: "Hydrate",
        userInput: "please drink water"
      }
    ];

    for (const payload of payloads) {
      expect(normalizedStreamEventSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects missing required event identity", () => {
    const { id: _id, ...payloadWithoutId } = {
      ...baseEvent,
      type: "follow",
      amount: null
    };

    expect(normalizedStreamEventSchema.safeParse(payloadWithoutId).success).toBe(false);
  });

  it("rejects unsupported event types", () => {
    const payload = {
      ...baseEvent,
      type: "hype_train_begin",
      amount: null
    };

    expect(normalizedStreamEventSchema.safeParse(payload).success).toBe(false);
  });
});
```

- [ ] **Step 4: Verify event tests**

Run:

```bash
pnpm test -- packages/core/src/events/schemas.test.ts
pnpm --filter @stream-jams/core typecheck
```

Expected:

- Event schema tests pass.
- TypeScript exits with status 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src/events
git commit -m "feat: define normalized stream events"
```

## Sub-Slice 2.2: Overlay Module And Overlay Contracts

**Purpose:** Define overlay module configuration, renderer metadata, composition requests, and overlay playback instructions.

**Files:**

- Create: `packages/core/src/overlay-modules/types.ts`
- Create: `packages/core/src/overlay-modules/schemas.ts`
- Create: `packages/core/src/overlays/types.ts`
- Create: `packages/core/src/overlays/schemas.ts`
- Create: `packages/core/src/overlays/schemas.test.ts`

**Ownership:** This worker owns only `packages/core/src/overlay-modules/**` and `packages/core/src/overlays/**`.

- [ ] **Step 1: Create overlay module types**

Create `packages/core/src/overlay-modules/types.ts`:

```ts
import type { OverlayInstruction } from "../overlays/types.js";

export interface OverlayModuleWizardField {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean" | "select" | "asset" | "color";
  readonly required: boolean;
}

export interface OverlayModuleWizardStep {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly OverlayModuleWizardField[];
}

export interface OverlayModuleWizardDefinition {
  readonly steps: readonly OverlayModuleWizardStep[];
}

export interface OverlayModuleRendererDefinition {
  readonly entryPoint: string;
  readonly supportedOutputs: readonly Array<"module" | "unified">;
}

export interface OverlayModuleDefinition<TConfig = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly defaultEnabled: boolean;
  readonly configSchemaVersion: number;
  readonly defaultConfig: TConfig;
  readonly wizard: OverlayModuleWizardDefinition;
  readonly renderer: OverlayModuleRendererDefinition;
}

export interface OverlayModuleConfig<TConfig = unknown> {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: TConfig;
  readonly updatedAt: string;
}

export interface OverlayModuleSnapshot {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly instructions: readonly OverlayInstruction[];
}
```

- [ ] **Step 2: Create overlay types**

Create `packages/core/src/overlays/types.ts`:

```ts
import type { OverlayElementLayout, OverlayPurpose, OverlayScope } from "../shared/schemas.js";
import type { TtsPlaybackInstruction } from "../tts/types.js";
import type { OverlayModuleSnapshot } from "../overlay-modules/types.js";

export type { OverlayElementLayout, OverlayPurpose, OverlayScope };

export interface ModuleOutputRequest {
  readonly moduleId: string;
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
}

export interface UnifiedOutputRequest {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly enabledModuleIds: readonly string[];
}

export interface OverlayComposition {
  readonly overlayId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly modules: readonly OverlayModuleSnapshot[];
}

export interface OverlayVisualInstruction {
  readonly assetId: string;
  readonly mediaType: "image" | "gif" | "video";
  readonly layout: OverlayElementLayout;
}

export interface OverlayAudioInstruction {
  readonly assetId: string;
  readonly volume: number;
}

export interface OverlayTextInstruction {
  readonly text: string;
  readonly layout: OverlayElementLayout;
}

export interface OverlayInstruction {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly visual: OverlayVisualInstruction | null;
  readonly audio: OverlayAudioInstruction | null;
  readonly text: OverlayTextInstruction | null;
  readonly tts: TtsPlaybackInstruction | null;
  readonly durationMs: number;
}
```

- [ ] **Step 3: Create overlay module schemas**

Create `packages/core/src/overlay-modules/schemas.ts`:

```ts
import { z } from "zod";
import { isoDateTimeSchema, nonEmptyStringSchema, nonNegativeIntegerSchema } from "../shared/schemas.js";

export const overlayModuleWizardFieldSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  type: z.enum(["text", "number", "boolean", "select", "asset", "color"]),
  required: z.boolean()
});

export const overlayModuleWizardStepSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  fields: z.array(overlayModuleWizardFieldSchema)
});

export const overlayModuleWizardDefinitionSchema = z.object({
  steps: z.array(overlayModuleWizardStepSchema).min(1)
});

export const overlayModuleRendererDefinitionSchema = z.object({
  entryPoint: nonEmptyStringSchema,
  supportedOutputs: z.array(z.enum(["module", "unified"])).min(1)
});

export const overlayModuleDefinitionSchema = z.object({
  id: nonEmptyStringSchema,
  displayName: nonEmptyStringSchema,
  version: nonEmptyStringSchema,
  defaultEnabled: z.boolean(),
  configSchemaVersion: nonNegativeIntegerSchema,
  defaultConfig: z.unknown(),
  wizard: overlayModuleWizardDefinitionSchema,
  renderer: overlayModuleRendererDefinitionSchema
});

export const overlayModuleConfigSchema = z.object({
  moduleId: nonEmptyStringSchema,
  enabled: z.boolean(),
  config: z.unknown(),
  updatedAt: isoDateTimeSchema
});
```

- [ ] **Step 4: Create overlay schemas**

Create `packages/core/src/overlays/schemas.ts`:

```ts
import { z } from "zod";
import {
  nonEmptyStringSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";

export const moduleOutputRequestSchema = z.object({
  moduleId: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema
});

export const unifiedOutputRequestSchema = z.object({
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  enabledModuleIds: z.array(nonEmptyStringSchema)
});

export const overlayVisualInstructionSchema = z.object({
  assetId: nonEmptyStringSchema,
  mediaType: z.enum(["image", "gif", "video"]),
  layout: overlayElementLayoutSchema
});

export const overlayAudioInstructionSchema = z.object({
  assetId: nonEmptyStringSchema,
  volume: z.number().min(0).max(1)
});

export const overlayTextInstructionSchema = z.object({
  text: z.string(),
  layout: overlayElementLayoutSchema
});

export const overlayInstructionSchema = z.object({
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  visual: overlayVisualInstructionSchema.nullable(),
  audio: overlayAudioInstructionSchema.nullable(),
  text: overlayTextInstructionSchema.nullable(),
  tts: z.unknown().nullable(),
  durationMs: positiveIntegerSchema.max(120_000)
});

export const overlayModuleSnapshotSchema = z.object({
  moduleId: nonEmptyStringSchema,
  enabled: z.boolean(),
  instructions: z.array(overlayInstructionSchema)
});

export const overlayCompositionSchema = z.object({
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  modules: z.array(overlayModuleSnapshotSchema)
});
```

- [ ] **Step 5: Test overlay boundary rejection**

Create `packages/core/src/overlays/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { moduleOutputRequestSchema, overlayInstructionSchema } from "./schemas.js";

const layout = {
  x: 10,
  y: 20,
  width: 300,
  height: 120,
  zIndex: 1
};

describe("overlay schemas", () => {
  it("rejects invalid overlay purpose", () => {
    expect(
      moduleOutputRequestSchema.safeParse({
        moduleId: "alerts",
        overlayId: "main",
        purpose: "preview"
      }).success
    ).toBe(false);
  });

  it("accepts valid overlay instructions", () => {
    expect(
      overlayInstructionSchema.safeParse({
        id: "instruction-1",
        overlayId: "main",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        visual: {
          assetId: "asset-1",
          mediaType: "image",
          layout
        },
        audio: null,
        text: {
          text: "Thanks for the follow",
          layout
        },
        tts: null,
        durationMs: 5000
      }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 6: Verify overlay tests**

Run:

```bash
pnpm test -- packages/core/src/overlays/schemas.test.ts
pnpm --filter @stream-jams/core typecheck
```

Expected:

- Overlay schema tests pass.
- TypeScript exits with status 0.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/core/src/overlay-modules packages/core/src/overlays
git commit -m "feat: define overlay contracts"
```

## Sub-Slice 2.3: Alert And Asset Contracts

**Purpose:** Define alert collections, rules, variants, matching state, and asset metadata used by later alert CRUD, matching, and import slices.

**Files:**

- Create: `packages/core/src/alerts/types.ts`
- Create: `packages/core/src/alerts/schemas.ts`
- Create: `packages/core/src/alerts/schemas.test.ts`
- Create: `packages/core/src/assets/types.ts`
- Create: `packages/core/src/assets/schemas.ts`

**Ownership:** This worker owns only `packages/core/src/alerts/**` and `packages/core/src/assets/**`.

- [ ] **Step 1: Create asset types and schemas**

Create `packages/core/src/assets/types.ts`:

```ts
export type AssetMediaType = "image" | "gif" | "video" | "audio";

export interface AssetRecord {
  readonly id: string;
  readonly originalFileName: string;
  readonly mediaType: AssetMediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly storagePath: string;
}

export interface AssetValidationResult {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly mediaType: AssetMediaType | null;
}
```

Create `packages/core/src/assets/schemas.ts`:

```ts
import { z } from "zod";
import { nonEmptyStringSchema, positiveIntegerSchema } from "../shared/schemas.js";

export const assetMediaTypeSchema = z.enum(["image", "gif", "video", "audio"]);

export const assetRecordSchema = z.object({
  id: nonEmptyStringSchema,
  originalFileName: nonEmptyStringSchema,
  mediaType: assetMediaTypeSchema,
  mimeType: nonEmptyStringSchema,
  sizeBytes: positiveIntegerSchema,
  checksum: nonEmptyStringSchema,
  storagePath: nonEmptyStringSchema
});

export const assetValidationResultSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  mediaType: assetMediaTypeSchema.nullable()
});
```

- [ ] **Step 2: Create alert types**

Create `packages/core/src/alerts/types.ts`:

```ts
import type { StreamEventType } from "../events/types.js";
import type { OverlayElementLayout } from "../overlays/types.js";

export interface AlertCollection {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface AlertCondition {
  readonly field: string;
  readonly operator: "equals" | "min" | "max" | "range" | "includes";
  readonly value: string | number | boolean | readonly [number, number];
}

export interface AlertTtsConfig {
  readonly enabled: boolean;
  readonly providerId: string;
  readonly voiceId: string | null;
  readonly template: string;
  readonly minimumAmount: number | null;
}

export interface AlertVariant {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly visualAssetId: string | null;
  readonly audioAssetId: string | null;
  readonly textTemplate: string;
  readonly ttsConfig: AlertTtsConfig | null;
  readonly durationMs: number;
  readonly layout: OverlayElementLayout;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly eventType: StreamEventType;
  readonly enabled: boolean;
  readonly collectionIds: readonly string[];
  readonly conditions: readonly AlertCondition[];
  readonly variants: readonly AlertVariant[];
  readonly cooldownSeconds: number;
  readonly priority: number;
}

export interface AlertActivationState {
  readonly enabledCollectionIds: readonly string[];
  readonly disabledRuleIds: readonly string[];
}
```

- [ ] **Step 3: Create alert schemas**

Create `packages/core/src/alerts/schemas.ts`:

```ts
import { z } from "zod";
import { overlayElementLayoutSchema, nonEmptyStringSchema, nonNegativeIntegerSchema, positiveIntegerSchema } from "../shared/schemas.js";

export const alertCollectionSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean()
});

export const alertConditionSchema = z.object({
  field: nonEmptyStringSchema,
  operator: z.enum(["equals", "min", "max", "range", "includes"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.tuple([z.number(), z.number()])
  ])
});

export const alertTtsConfigSchema = z.object({
  enabled: z.boolean(),
  providerId: nonEmptyStringSchema,
  voiceId: nonEmptyStringSchema.nullable(),
  template: z.string(),
  minimumAmount: positiveIntegerSchema.nullable()
});

export const alertVariantSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean(),
  weight: positiveIntegerSchema,
  visualAssetId: nonEmptyStringSchema.nullable(),
  audioAssetId: nonEmptyStringSchema.nullable(),
  textTemplate: z.string(),
  ttsConfig: alertTtsConfigSchema.nullable(),
  durationMs: positiveIntegerSchema.max(120_000),
  layout: overlayElementLayoutSchema
});

export const streamEventTypeSchema = z.enum([
  "follow",
  "subscription",
  "resubscription",
  "cheer",
  "raid",
  "channel_point_redemption"
]);

export const alertRuleSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  eventType: streamEventTypeSchema,
  enabled: z.boolean(),
  collectionIds: z.array(nonEmptyStringSchema),
  conditions: z.array(alertConditionSchema),
  variants: z.array(alertVariantSchema).min(1),
  cooldownSeconds: nonNegativeIntegerSchema,
  priority: z.number().int()
});

export const alertActivationStateSchema = z.object({
  enabledCollectionIds: z.array(nonEmptyStringSchema),
  disabledRuleIds: z.array(nonEmptyStringSchema)
});
```

- [ ] **Step 4: Test alert duration rejection**

Create `packages/core/src/alerts/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { alertRuleSchema } from "./schemas.js";

const validRule = {
  id: "rule-1",
  name: "Follow alert",
  eventType: "follow",
  enabled: true,
  collectionIds: ["default"],
  conditions: [],
  variants: [
    {
      id: "variant-1",
      name: "Default",
      enabled: true,
      weight: 1,
      visualAssetId: null,
      audioAssetId: null,
      textTemplate: "Thanks {actor.displayName}",
      ttsConfig: null,
      durationMs: 5000,
      layout: {
        x: 0,
        y: 0,
        width: 400,
        height: 180,
        zIndex: 1
      }
    }
  ],
  cooldownSeconds: 0,
  priority: 0
} as const;

describe("alertRuleSchema", () => {
  it("accepts a valid alert rule", () => {
    expect(alertRuleSchema.safeParse(validRule).success).toBe(true);
  });

  it("rejects invalid alert duration", () => {
    const invalidRule = {
      ...validRule,
      variants: [
        {
          ...validRule.variants[0],
          durationMs: 0
        }
      ]
    };

    expect(alertRuleSchema.safeParse(invalidRule).success).toBe(false);
  });
});
```

- [ ] **Step 5: Verify alert and asset tests**

Run:

```bash
pnpm test -- packages/core/src/alerts/schemas.test.ts
pnpm --filter @stream-jams/core typecheck
```

Expected:

- Alert schema tests pass.
- TypeScript exits with status 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/core/src/alerts packages/core/src/assets
git commit -m "feat: define alert and asset contracts"
```

## Sub-Slice 2.4: Playback, TTS, And Security Contracts

**Purpose:** Define resolved alert playback state, TTS playback metadata, and security/session/key contracts used by later auth and playback slices.

**Files:**

- Create: `packages/core/src/playback/types.ts`
- Create: `packages/core/src/playback/schemas.ts`
- Create: `packages/core/src/tts/types.ts`
- Create: `packages/core/src/tts/schemas.ts`
- Create: `packages/core/src/security/types.ts`
- Create: `packages/core/src/security/schemas.ts`

**Ownership:** This worker owns only `packages/core/src/playback/**`, `packages/core/src/tts/**`, and `packages/core/src/security/**`.

- [ ] **Step 1: Create TTS types and schemas**

Create `packages/core/src/tts/types.ts`:

```ts
export interface TtsPlaybackInstruction {
  readonly mode: "audio-file" | "remote-trigger" | "browser-speech";
  readonly text: string;
  readonly audioAssetId: string | null;
  readonly providerPayload: Record<string, unknown> | null;
}

export interface TtsProviderCapabilities {
  readonly supportsVoices: boolean;
  readonly supportsRate: boolean;
  readonly supportsPitch: boolean;
  readonly supportsVolume: boolean;
  readonly playbackMode: "audio-file" | "remote-trigger" | "browser-speech";
}

export interface TtsProviderConfigRef {
  readonly providerId: string;
  readonly accountId: string;
}

export interface TtsVoice {
  readonly id: string;
  readonly label: string;
}
```

Create `packages/core/src/tts/schemas.ts`:

```ts
import { z } from "zod";
import { metadataSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const ttsPlaybackModeSchema = z.enum(["audio-file", "remote-trigger", "browser-speech"]);

export const ttsPlaybackInstructionSchema = z.object({
  mode: ttsPlaybackModeSchema,
  text: z.string(),
  audioAssetId: nonEmptyStringSchema.nullable(),
  providerPayload: metadataSchema.nullable()
});

export const ttsProviderCapabilitiesSchema = z.object({
  supportsVoices: z.boolean(),
  supportsRate: z.boolean(),
  supportsPitch: z.boolean(),
  supportsVolume: z.boolean(),
  playbackMode: ttsPlaybackModeSchema
});

export const ttsProviderConfigRefSchema = z.object({
  providerId: nonEmptyStringSchema,
  accountId: nonEmptyStringSchema
});

export const ttsVoiceSchema = z.object({
  id: nonEmptyStringSchema,
  label: nonEmptyStringSchema
});
```

- [ ] **Step 2: Create playback types and schemas**

Create `packages/core/src/playback/types.ts`:

```ts
import type { NormalizedStreamEvent } from "../events/types.js";
import type { OverlayInstruction } from "../overlays/types.js";

export interface ResolvedAlert {
  readonly id: string;
  readonly sourceEventId: string;
  readonly ruleId: string;
  readonly variantId: string;
  readonly overlayInstruction: OverlayInstruction;
}

export interface PlaybackQueueItem {
  readonly id: string;
  readonly sourceEvent: NormalizedStreamEvent;
  readonly alerts: readonly ResolvedAlert[];
  readonly status: "queued" | "playing" | "completed" | "skipped";
  readonly enqueuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface PlaybackQueueSnapshot {
  readonly current: PlaybackQueueItem | null;
  readonly queued: readonly PlaybackQueueItem[];
  readonly recent: readonly PlaybackQueueItem[];
  readonly paused: boolean;
  readonly muted: boolean;
}
```

Create `packages/core/src/playback/schemas.ts`:

```ts
import { z } from "zod";
import { normalizedStreamEventSchema } from "../events/schemas.js";
import { overlayInstructionSchema } from "../overlays/schemas.js";
import { isoDateTimeSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const resolvedAlertSchema = z.object({
  id: nonEmptyStringSchema,
  sourceEventId: nonEmptyStringSchema,
  ruleId: nonEmptyStringSchema,
  variantId: nonEmptyStringSchema,
  overlayInstruction: overlayInstructionSchema
});

export const playbackQueueItemSchema = z.object({
  id: nonEmptyStringSchema,
  sourceEvent: normalizedStreamEventSchema,
  alerts: z.array(resolvedAlertSchema),
  status: z.enum(["queued", "playing", "completed", "skipped"]),
  enqueuedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable()
});

export const playbackQueueSnapshotSchema = z.object({
  current: playbackQueueItemSchema.nullable(),
  queued: z.array(playbackQueueItemSchema),
  recent: z.array(playbackQueueItemSchema),
  paused: z.boolean(),
  muted: z.boolean()
});
```

- [ ] **Step 3: Create security types and schemas**

Create `packages/core/src/security/types.ts`:

```ts
import type { OverlayPurpose, OverlayScope } from "../shared/schemas.js";

export interface SecretRef {
  readonly namespace: "twitch" | "tts" | "management" | "overlay";
  readonly accountId: string;
  readonly name: string;
}

export interface OverlayAccessKey {
  readonly id: string;
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
  readonly keyHash: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface ManagementSession {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CreateOverlayKeyInput {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: OverlayPurpose;
  readonly scope: OverlayScope;
}
```

Create `packages/core/src/security/schemas.ts`:

```ts
import { z } from "zod";
import { isoDateTimeSchema, nonEmptyStringSchema, overlayPurposeSchema, overlayScopeSchema } from "../shared/schemas.js";

export const secretRefSchema = z.object({
  namespace: z.enum(["twitch", "tts", "management", "overlay"]),
  accountId: nonEmptyStringSchema,
  name: nonEmptyStringSchema
});

export const overlayAccessKeySchema = z.object({
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  keyHash: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable()
});

export const managementSessionSchema = z.object({
  id: nonEmptyStringSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema
});

export const createOverlayKeyInputSchema = z.object({
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema.nullable(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema
});
```

- [ ] **Step 4: Verify playback, TTS, and security compilation**

Run:

```bash
pnpm --filter @stream-jams/core typecheck
```

Expected:

- TypeScript exits with status 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src/playback packages/core/src/tts packages/core/src/security
git commit -m "feat: define playback tts and security contracts"
```

## Sub-Slice 2.5: Core Barrel Exports And Whole-Package Verification

**Purpose:** Integrate all Slice 2 modules into the public core package API, run the full quality gate, and leave the branch ready for implementation review.

**Files:**

- Modify: `packages/core/src/index.ts`

**Ownership:** Only this sub-slice edits `packages/core/src/index.ts`.

- [ ] **Step 1: Replace the package barrel exports**

Modify `packages/core/src/index.ts`:

```ts
export type { AppVersion } from "./version.js";
export { createAppVersion } from "./version.js";

export type * from "./alerts/types.js";
export {
  alertActivationStateSchema,
  alertCollectionSchema,
  alertConditionSchema,
  alertRuleSchema,
  alertTtsConfigSchema,
  alertVariantSchema,
  streamEventTypeSchema
} from "./alerts/schemas.js";

export type * from "./assets/types.js";
export { assetMediaTypeSchema, assetRecordSchema, assetValidationResultSchema } from "./assets/schemas.js";

export type * from "./events/types.js";
export {
  channelPointRedemptionEventSchema,
  cheerEventSchema,
  followEventSchema,
  normalizedStreamEventSchema,
  raidEventSchema,
  resubscriptionEventSchema,
  subscriptionEventSchema,
  subscriptionTierSchema
} from "./events/schemas.js";

export type * from "./overlay-modules/types.js";
export {
  overlayModuleConfigSchema,
  overlayModuleDefinitionSchema,
  overlayModuleRendererDefinitionSchema,
  overlayModuleWizardDefinitionSchema,
  overlayModuleWizardFieldSchema,
  overlayModuleWizardStepSchema
} from "./overlay-modules/schemas.js";

export type * from "./overlays/types.js";
export {
  moduleOutputRequestSchema,
  overlayAudioInstructionSchema,
  overlayCompositionSchema,
  overlayInstructionSchema,
  overlayModuleSnapshotSchema,
  overlayTextInstructionSchema,
  overlayVisualInstructionSchema,
  unifiedOutputRequestSchema
} from "./overlays/schemas.js";

export type * from "./playback/types.js";
export { playbackQueueItemSchema, playbackQueueSnapshotSchema, resolvedAlertSchema } from "./playback/schemas.js";

export type * from "./security/types.js";
export {
  createOverlayKeyInputSchema,
  managementSessionSchema,
  overlayAccessKeySchema,
  secretRefSchema
} from "./security/schemas.js";

export {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  nullableNonEmptyStringSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "./shared/schemas.js";

export type * from "./tts/types.js";
export {
  ttsPlaybackInstructionSchema,
  ttsPlaybackModeSchema,
  ttsProviderCapabilitiesSchema,
  ttsProviderConfigRefSchema,
  ttsVoiceSchema
} from "./tts/schemas.js";
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm install --frozen-lockfile
```

Expected:

- All tests pass, including existing Slice 1 tests and new Slice 2 schema tests.
- TypeScript exits with status 0 for every package.
- Build exits with status 0 for every package.
- ESLint exits with status 0.
- Frozen install exits with status 0.

- [ ] **Step 3: Confirm no out-of-scope files changed**

Run:

```bash
git status --short
git diff --name-only origin/main...HEAD
```

Expected changed files are limited to:

```text
packages/core/package.json
pnpm-lock.yaml
packages/core/src/index.ts
packages/core/src/alerts/schemas.test.ts
packages/core/src/alerts/schemas.ts
packages/core/src/alerts/types.ts
packages/core/src/assets/schemas.ts
packages/core/src/assets/types.ts
packages/core/src/events/schemas.test.ts
packages/core/src/events/schemas.ts
packages/core/src/events/types.ts
packages/core/src/overlay-modules/schemas.ts
packages/core/src/overlay-modules/types.ts
packages/core/src/overlays/schemas.test.ts
packages/core/src/overlays/schemas.ts
packages/core/src/overlays/types.ts
packages/core/src/playback/schemas.ts
packages/core/src/playback/types.ts
packages/core/src/security/schemas.ts
packages/core/src/security/types.ts
packages/core/src/shared/schemas.ts
packages/core/src/tts/schemas.ts
packages/core/src/tts/types.ts
```

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/core/src/index.ts
git commit -m "feat: export core domain contracts"
```

## Acceptance Checks

- `@stream-jams/core` exports event, overlay module, alert, asset, overlay, playback, TTS, and security types.
- `@stream-jams/core` exports Zod schemas for runtime boundary validation.
- `normalizedStreamEventSchema` accepts valid follow, subscription, cheer, raid, and channel point redemption examples.
- `normalizedStreamEventSchema` rejects missing event identity and unsupported event type.
- `alertRuleSchema` rejects invalid alert duration.
- `moduleOutputRequestSchema` rejects invalid overlay purpose.
- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- `pnpm lint` passes.
- `pnpm install --frozen-lockfile` passes.

## Self-Review Notes For Executor

- The MVP plan names future event types such as gifts, charity, goals, and Hype Train as expansion events. This Slice 2 plan intentionally limits schemas to the MVP Twitch event types listed in Slice 2 acceptance checks.
- `OverlayInstruction.tts` is typed through `TtsPlaybackInstruction` in TypeScript and starts as `z.unknown().nullable()` in the overlay schema to avoid a circular runtime import between `overlays/schemas.ts` and `tts/schemas.ts`. Validate full TTS payloads at the TTS boundary with `ttsPlaybackInstructionSchema`.
- `zod@3.24.1` is pinned exactly to preserve deterministic dependency behavior from Slice 1.
- If execution discovers a compile-time import cycle in type-only imports, keep the files in the same ownership boundaries and fix with `import type`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-stream-jams-slice-2-core-domain-types-validation-schemas.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh worker per sub-slice, review between sub-slices, and run Sub-Slices 2.1 through 2.4 in parallel after 2.0 lands.
2. **Inline Execution** - Execute the sub-slices in this session using executing-plans, with a checkpoint after each commit.
