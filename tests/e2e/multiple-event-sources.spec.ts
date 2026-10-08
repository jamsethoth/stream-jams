import { expect, test, type Page } from "@playwright/test";

const twitch = {
  id: "provider-twitch-e2e",
  name: "Main Twitch",
  kind: "twitch",
  capability: "event-source",
  active: true,
  connectionState: "connected",
  intakeState: "active",
  liveStatus: "healthy",
  validatedAt: "2026-10-08T12:00:00.000Z",
  error: null,
  usedByAlertCount: 2
};

const streamerBot = {
  ...twitch,
  id: "provider-streamerbot-e2e",
  name: "Studio Streamer.bot",
  kind: "streamerbot",
  active: false,
  intakeState: "inactive"
};

const overlapWarning = {
  summary: "Twitch events will arrive from two sources",
  cause: "Main Twitch and Studio Streamer.bot both deliver the same Twitch events. Duplicates are merged, so each event plays once.",
  nextStep: "Confirm to use both, or turn off Twitch forwarding in Studio Streamer.bot so direct Twitch is the only Twitch path.",
  severity: "warning",
  occurredAt: "2026-10-08T12:00:00.000Z",
  referenceId: null,
  correction: { label: "Review Twitch forwarding", route: `/manage/event-sources?provider=${streamerBot.id}` }
};

async function mockEventSources(page: Page) {
  const state = { streamerBotActive: false, forwardTwitchEvents: true, activations: [] as unknown[], forwardingBodies: [] as unknown[] };
  const currentStreamerBot = () => ({ ...streamerBot, active: state.streamerBotActive, intakeState: state.streamerBotActive ? "active" : "inactive" });
  const catalog = () => ({
    providerId: streamerBot.id,
    forwardTwitchEvents: state.forwardTwitchEvents,
    available: true,
    sources: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }],
    selected: [],
    unavailableSelections: [],
    twitchBroadcasterId: null
  });
  const detail = (provider: object, configuration: object) => ({ provider, configuration, availableVoices: [], ttsSafety: null });

  await page.route("**/auth/management/sessions", (route) => route.fulfill({ json: { id: "mgmt_sources_e2e", csrfToken: "csrf_sources_e2e" } }));
  await page.route("**/management/providers?capability=event-source", (route) => route.fulfill({ json: [twitch, currentStreamerBot()] }));
  await page.route(`**/management/providers/${twitch.id}`, (route) => route.fulfill({ json: detail(twitch, { broadcasterId: "broadcaster-e2e" }) }));
  await page.route(`**/management/providers/${streamerBot.id}`, (route) => route.fulfill({
    json: detail(currentStreamerBot(), {
      protocol: "ws",
      host: "127.0.0.1",
      port: 8080,
      endpoint: "/",
      twitchBroadcasterId: null,
      externalSubscriptions: [],
      forwardTwitchEvents: state.forwardTwitchEvents
    })
  }));
  await page.route(`**/management/providers/${streamerBot.id}/activation-impact`, (route) => route.fulfill({
    json: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [overlapWarning] }
  }));
  await page.route(`**/management/providers/${streamerBot.id}/activate`, async (route) => {
    state.activations.push(route.request().postDataJSON());
    state.streamerBotActive = true;
    await route.fulfill({
      json: { provider: currentStreamerBot(), replacedProviderId: null, impact: { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] } }
    });
  });
  await page.route("**/twitch/auth/status", (route) => route.fulfill({
    json: {
      connected: true,
      authorizationState: "ready",
      missingScopes: [],
      account: {
        accountId: "broadcaster-e2e",
        login: "streamer",
        displayName: "Streamer",
        scopes: ["channel:read:redemptions"],
        connectedAt: "2026-10-08T12:00:00.000Z",
        updatedAt: "2026-10-08T12:00:00.000Z"
      }
    }
  }));
  await page.route(`**/providers/${streamerBot.id}/streamerbot-subscriptions`, (route) => route.fulfill({ json: catalog() }));
  await page.route(`**/providers/${streamerBot.id}/streamerbot-forwarding`, async (route) => {
    const body = route.request().postDataJSON() as { forwardTwitchEvents: boolean };
    state.forwardingBodies.push(body);
    state.forwardTwitchEvents = body.forwardTwitchEvents;
    await route.fulfill({ json: catalog() });
  });
  return state;
}

test("uses Streamer.bot alongside direct Twitch and turns off its Twitch forwarding", async ({ page }) => {
  const state = await mockEventSources(page);

  await page.goto(`/manage/event-sources?provider=${streamerBot.id}`);
  await page.getByRole("button", { name: `Activate ${streamerBot.name}` }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Studio Streamer.bot will be used alongside Main Twitch.");
  await expect(dialog).toContainText("Twitch events will arrive from two sources");
  await dialog.getByRole("button", { name: "Activate event source" }).click();

  await expect.poll(() => state.activations).toEqual([{ confirmWarnings: true }]);
  await expect(page.getByText("In use", { exact: true })).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: `Deactivate ${twitch.name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Deactivate ${streamerBot.name}` })).toBeVisible();

  const forwarding = page.getByRole("checkbox", { name: "Forward Twitch events from Streamer.bot" });
  await expect(forwarding).toBeChecked();
  await forwarding.uncheck();
  await page.getByRole("button", { name: "Save forwarding" }).click();

  await expect.poll(() => state.forwardingBodies).toEqual([{ forwardTwitchEvents: false }]);
  await expect(page.getByText("Studio Streamer.bot no longer forwards Twitch events.")).toBeVisible();
  await expect(forwarding).not.toBeChecked();
});
