import { expect, test } from "@playwright/test";

test("configures explicit Screen Effects events on the active Streamer.bot provider", async ({ page }) => {
  const provider = {
    id: "provider-streamerbot-e2e",
    name: "Studio Streamer.bot",
    kind: "streamerbot",
    capability: "event-source",
    active: true,
    connectionState: "connected",
    intakeState: "active",
    liveStatus: "healthy",
    validatedAt: "2026-09-08T12:00:00.000Z",
    error: null,
    usedByAlertCount: 2
  };
  const updateBodies: unknown[] = [];
  let selected: { sourceKey: string; eventTypes: string[] }[] = [];

  await page.route("**/auth/management/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { id: "mgmt_streamerbot_e2e", csrfToken: "csrf_streamerbot_e2e" }
    });
  });
  await page.route("**/management/providers?capability=event-source", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [provider] });
  });
  await page.route(`**/management/providers/${provider.id}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        provider,
        configuration: {
          protocol: "ws",
          host: "127.0.0.1",
          port: 8080,
          endpoint: "/",
          twitchBroadcasterId: null,
          externalSubscriptions: selected
        },
        availableVoices: [],
        ttsSafety: null
      }
    });
  });
  await page.route("**/twitch/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        connected: true,
        authorizationState: "ready",
        missingScopes: [],
        account: {
          accountId: "broadcaster-e2e",
          login: "streamer",
          displayName: "Streamer",
          scopes: ["channel:read:redemptions"],
          connectedAt: "2026-09-08T12:00:00.000Z",
          updatedAt: "2026-09-08T12:00:00.000Z"
        }
      }
    });
  });
  await page.route(`**/providers/${provider.id}/streamerbot-subscriptions`, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        twitchBroadcasterId: string | null;
        externalSubscriptions: { sourceKey: string; eventTypes: string[] }[];
      };
      updateBodies.push(body);
      selected = body.externalSubscriptions;
      await route.fulfill({
        contentType: "application/json",
        json: {
          providerId: provider.id,
          available: true,
          sources: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted", "SceneChanged"] }],
          selected,
          unavailableSelections: [],
          twitchBroadcasterId: body.twitchBroadcasterId
        }
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      json: {
        providerId: provider.id,
        available: true,
        sources: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted", "SceneChanged"] }],
        selected,
        unavailableSelections: [],
        twitchBroadcasterId: null
      }
    });
  });
  await page.route(`**/providers/${provider.id}/streamerbot-subscriptions`, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        twitchBroadcasterId: string | null;
        externalSubscriptions: { sourceKey: string; eventTypes: string[] }[];
      };
      updateBodies.push(body);
      selected = body.externalSubscriptions;
      await route.fulfill({
        contentType: "application/json",
        json: {
          providerId: provider.id,
          available: true,
          sources: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted", "SceneChanged"] }],
          selected,
          unavailableSelections: [],
          twitchBroadcasterId: body.twitchBroadcasterId
        }
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      json: {
        providerId: provider.id,
        available: true,
        sources: [{ sourceKey: "OBS", eventTypes: ["RecordingStarted", "SceneChanged"] }],
        selected,
        unavailableSelections: [],
        twitchBroadcasterId: null
      }
    });
  });

  await page.goto(`/manage/event-sources?provider=${provider.id}`);
  await page.getByRole("checkbox", { name: "SceneChanged" }).check();
  await page.getByLabel("Twitch reward broadcaster").selectOption("broadcaster-e2e");
  await expect(page.getByRole("button", { name: "Save subscriptions" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand saving changes/ }).check();
  await page.getByRole("button", { name: "Save subscriptions" }).click();

  await expect.poll(() => updateBodies).toEqual([{
    twitchBroadcasterId: "broadcaster-e2e",
    externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
  }]);
  await expect(page.getByRole("checkbox", { name: "SceneChanged" })).toBeChecked();
});
