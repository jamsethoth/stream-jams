import { describe, expect, it } from "vitest";
import type { ExternalAlertEvent, FollowEvent } from "../events/types.js";
import { DefaultModerationService } from "../moderation/moderation-service.js";
import { DefaultAlertMatcher } from "./alert-matcher.js";
import { DefaultAlertResolver, createAlertTemplateContext } from "./alert-resolver.js";
import { DefaultAlertService } from "./alert-service.js";
import { DefaultAlertConditionEvaluator } from "./condition-evaluator.js";
import type { AlertRepository } from "./repository.js";
import { alertRuleExternalIdentityIssue, externalAlertEventSchema } from "./schemas.js";
import type { AlertCollection, AlertRule } from "./types.js";
import { createNormalizedAlertSampleEvent } from "./variation-authoring.js";

const identity = { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" } as const;

describe("external event alerts", () => {
  it("match only rules with the exact external identity", () => {
    const matcher = new DefaultAlertMatcher();
    const rules = [
      externalRule("exact"),
      externalRule("other-type", { ...identity, eventType: "Other" }),
      externalRule("other-source", { ...identity, sourceKey: "general" }),
      { ...externalRule("follow"), eventType: "follow" as const, externalIdentity: undefined }
    ];

    expect(matcher.findMatches({ event: externalEvent(), rules }).map((match) => match.rule.id)).toEqual(["exact"]);
  });

  it("never match canonical events, and canonical rules never match external events", () => {
    const matcher = new DefaultAlertMatcher();
    const follow: FollowEvent = {
      id: "follow-1", type: "follow", amount: null, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch",
      occurredAt: "2026-10-08T12:00:00.000Z", actor: { id: "viewer", displayName: "Viewer" }, message: null, metadata: {}
    };
    const malformed = { ...externalRule("canonical-with-identity"), eventType: "follow" as const };

    expect(matcher.findMatches({ event: follow, rules: [externalRule("external"), malformed] })).toEqual([]);
  });

  it("never satisfy conditions from payload content", () => {
    const evaluator = new DefaultAlertConditionEvaluator();
    expect(evaluator.evaluate({ field: "summary", operator: "equals", value: "Custom event" }, externalEvent())).toBe(false);
    expect(evaluator.evaluate({ field: "userName", operator: "includes", value: "Viewer" }, externalEvent())).toBe(false);
  });

  it("offer only summary, userName, and eventType to templates", () => {
    expect(createAlertTemplateContext(externalEvent())).toEqual({ summary: "Custom event", userName: "Viewer", eventType: "Custom" });
    expect(createAlertTemplateContext({
      eventType: "external_event",
      samplePayload: { summary: "Sample", userName: "Sampler", eventType: "Custom", url: "https://example.invalid", file: "C:/secret" }
    })).toEqual({ summary: "Sample", userName: "Sampler", eventType: "Custom" });
  });

  it("render payload-free templates and apply moderation to viewer-controlled summary text", () => {
    const resolver = new DefaultAlertResolver({
      generateId: (kind) => `${kind}-1`,
      random: () => 0,
      moderationService: new DefaultModerationService({
        settings: {
          renderedText: { maxLength: 200, blockedTerms: ["badword"], stripUrls: true },
          ttsText: { maxLength: 200, blockedTerms: ["badword"], stripUrls: true }
        }
      })
    });
    const rule = externalRule("external", identity, "{userName}: {summary} {eventType} {url} {file}");
    const event = externalEvent({ summary: "badword https://example.invalid/x" });

    const [alert] = resolver.resolveMatches({
      matches: [{ event, rule }],
      target: { overlayId: "default", moduleId: "alerts", purpose: "live", scope: "unified" }
    });

    // Non-allowlisted placeholders render empty rather than reading payload fields.
    expect(alert?.overlayInstruction.text?.text).toBe("Viewer: [moderated] [link removed] Custom  ");
  });

  it("build bounded editor samples for the rule identity", () => {
    const sample = createNormalizedAlertSampleEvent({
      eventType: "external_event",
      ingestProvider: "streamerbot",
      payload: { summary: "x".repeat(400), userName: "", url: "https://example.invalid" },
      id: "sample",
      occurredAt: "2026-10-08T12:00:00.000Z",
      externalIdentity: identity
    });

    expect(externalAlertEventSchema.parse(sample)).toMatchObject({ identity, userName: "", actor: { displayName: "Streamer.bot" } });
    expect(JSON.stringify(sample)).not.toContain("example.invalid");
  });

  it("require an identity and no conditions exactly for external rules", () => {
    expect(alertRuleExternalIdentityIssue(externalRule("ok"))).toBeNull();
    expect(alertRuleExternalIdentityIssue({ ...externalRule("missing"), externalIdentity: undefined })).toMatch(/must select/u);
    expect(alertRuleExternalIdentityIssue({ ...externalRule("canonical"), eventType: "follow" })).toMatch(/Only external/u);
    expect(alertRuleExternalIdentityIssue({ ...externalRule("conditions"), conditions: [{ field: "amount", operator: "min", value: 1 }] }))
      .toMatch(/cannot have conditions/u);
    const variantConditions = externalRule("variant-conditions");
    expect(alertRuleExternalIdentityIssue({
      ...variantConditions,
      variants: [{ ...variantConditions.variants[0]!, conditions: [{ field: "amount", operator: "min", value: 1 }] }]
    })).toMatch(/cannot have conditions/u);
  });

  it("reject invalid external rules in the alert service", async () => {
    const service = new DefaultAlertService({ repository: new MemoryRepository(), generateId: (kind) => `${kind}-${Math.random()}` });
    const input = { ...externalRule("input"), collectionIds: ["set"], variants: externalRule("input").variants.map((variant) => { const input: { -readonly [K in keyof typeof variant]?: (typeof variant)[K] } = { ...variant }; delete input.id; return input as Omit<typeof variant, "id">; }) };

    await expect(service.createRule({ ...input, externalIdentity: undefined })).rejects.toThrow(/must select an external identity/u);
    await expect(service.createRule({ ...input, externalIdentity: { ...identity, eventType: "\u0085" } })).rejects.toThrow();
    await expect(service.createRule(input)).resolves.toMatchObject({ eventType: "external_event", externalIdentity: identity });
  });
});

function externalEvent(overrides: Partial<ExternalAlertEvent> = {}): ExternalAlertEvent {
  return {
    id: "external:event-1",
    type: "external_event",
    providerId: "streamerbot",
    ingestProvider: "streamerbot",
    occurredAt: "2026-10-08T12:00:00.000Z",
    actor: { id: null, displayName: "Viewer" },
    message: null,
    metadata: {},
    amount: null,
    identity,
    summary: "Custom event",
    userName: "Viewer",
    ...overrides
  };
}

function externalRule(id: string, externalIdentity: AlertRule["externalIdentity"] = identity, textTemplate = "{summary}"): AlertRule {
  return {
    id,
    name: id,
    eventType: "external_event",
    externalIdentity,
    enabled: true,
    collectionIds: ["set"],
    conditions: [],
    variants: [{
      id: `${id}-variant`,
      name: "Default",
      enabled: true,
      weight: 1,
      visualAssetId: null,
      audioAssetId: null,
      textTemplate,
      ttsConfig: null,
      durationMs: 1_000,
      layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }
    }],
    cooldownSeconds: 0,
    priority: 0
  };
}

class MemoryRepository implements AlertRepository {
  readonly #collections = new Map<string, AlertCollection>([["set", { id: "set", name: "Set", enabled: true }]]);
  readonly #rules = new Map<string, AlertRule>();
  async saveCollection(collection: AlertCollection) { this.#collections.set(collection.id, collection); return collection; }
  async findCollectionById(collectionId: string) { return this.#collections.get(collectionId) ?? null; }
  async listCollections() { return [...this.#collections.values()]; }
  async deleteCollection(collectionId: string) { this.#collections.delete(collectionId); }
  async saveRule(rule: AlertRule) { this.#rules.set(rule.id, rule); return rule; }
  async findRuleById(ruleId: string) { return this.#rules.get(ruleId) ?? null; }
  async listRules() { return [...this.#rules.values()]; }
  async listActiveRules() { return [...this.#rules.values()]; }
  async deleteRule(ruleId: string) { this.#rules.delete(ruleId); }
}
