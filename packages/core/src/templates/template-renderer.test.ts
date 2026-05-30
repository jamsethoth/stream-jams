import type { NormalizedStreamEvent } from "../events/types.js";
import { describe, expect, it } from "vitest";
import { DefaultTemplateRenderer } from "./template-renderer.js";

describe("DefaultTemplateRenderer", () => {
  const renderer = new DefaultTemplateRenderer();

  it("renders dot-path variables from normalized events", () => {
    expect(
      renderer.render({
        template: "Thanks {actor.displayName} for {amount} bits and {metadata.giftCount} gifts!",
        values: createCheerEvent({
          actor: {
            id: "viewer-1",
            displayName: "Jam"
          },
          amount: 500,
          metadata: {
            giftCount: 3
          }
        })
      })
    ).toBe("Thanks Jam for 500 bits and 3 gifts!");
  });

  it("renders event-specific variables from subscriptions and channel point rewards", () => {
    expect(
      renderer.render({
        template: "Tier {tier}",
        values: {
          ...createCheerEvent(),
          type: "subscription",
          tier: "3000"
        } as NormalizedStreamEvent
      })
    ).toBe("Tier 3000");

    expect(
      renderer.render({
        template: "Reward: {rewardTitle}",
        values: {
          ...createCheerEvent(),
          type: "channel_point_redemption",
          amount: null,
          rewardId: "reward-1",
          rewardTitle: "Hydrate",
          userInput: null
        } as NormalizedStreamEvent
      })
    ).toBe("Reward: Hydrate");
  });

  it("renders missing variables as empty text", () => {
    expect(
      renderer.render({
        template: "Hello {actor.displayName}{unknown.path}",
        values: createCheerEvent()
      })
    ).toBe("Hello Viewer");
  });

  it("escapes HTML-sensitive characters by default", () => {
    expect(
      renderer.render({
        template: "{actor.displayName}: {message}",
        values: createCheerEvent({
          actor: {
            id: "viewer-1",
            displayName: "<Jam & Co>"
          },
          message: "5 > 3 \"always\""
        })
      })
    ).toBe("&lt;Jam &amp; Co&gt;: 5 &gt; 3 &quot;always&quot;");
  });

  it("can render trusted text without escaping when explicitly requested", () => {
    expect(
      renderer.render({
        template: "{message}",
        values: createCheerEvent({
          message: "<strong>trusted</strong>"
        }),
        escapeHtml: false
      })
    ).toBe("<strong>trusted</strong>");
  });
});

function createCheerEvent(overrides: Partial<NormalizedStreamEvent> = {}): NormalizedStreamEvent {
  return {
    id: "event-1",
    providerId: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  } as NormalizedStreamEvent;
}
