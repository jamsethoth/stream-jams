import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { compatibilityAlertTextBoxStyle as boxStyle, compatibilityAlertTextStyle as textStyle } from "../../packages/core/dist/index.js";
import { InMemorySecretStore } from "../../packages/test-support/dist/index.js";
import { createDefaultAppConfig } from "../../apps/server/dist/config/default-config.js";
import { FileConfigStore } from "../../apps/server/dist/config/file-config-store.js";
import { startLocalRuntime, type StartedLocalRuntime } from "../../apps/server/dist/runtime/start-local-runtime.js";

test("authors a Streamer.bot event alert that plays only allowlisted, moderated text for its exact identity", async ({ page, request }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-external-alerts-"));
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated port");
  await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
  const config = { ...createDefaultAppConfig(root), server: { host: "127.0.0.1" as const, port: address.port } };
  let runtime: StartedLocalRuntime | undefined;
  try {
    runtime = await startLocalRuntime({ homeDirectory: root, webBuildDirectory: resolve("apps/web/dist"), configStore: new FileConfigStore({ configFilePath: join(root, "config.json"), defaultConfig: config }), environment: {}, secretStore: new InMemorySecretStore() });
    const url = runtime.url;
    const session = await (await request.post(`${url}/auth/management/sessions`)).json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function management(path: string, data?: unknown, method = "POST") {
      const response = await request.fetch(`${url}${path}`, { method, headers, ...(data === undefined ? {} : { data }) });
      expect(response.ok(), await response.text()).toBe(true);
      return response.status() === 204 ? null : response.json();
    }
    await management("/overlay-modules/alerts/enabled", { enabled: true }, "PATCH");
    await management("/moderation/settings", { renderedText: { blockedTerms: ["badword"] } }, "PATCH");

    await page.goto(`${url}/manage/modules/alerts`);
    await page.getByRole("button", { name: "Add alert", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add alert" });
    await dialog.getByLabel("Event type").selectOption("external_event");
    await dialog.getByLabel("Streamer.bot source").fill("General");
    await dialog.getByLabel("Streamer.bot event type").fill("Custom");
    await dialog.getByLabel("Alert name").fill("Custom event");
    await dialog.getByRole("button", { name: "Create alert" }).click();
    const row = page.getByRole("row", { name: /Custom event/u });
    await expect(row.getByText("Streamer.bot General · Custom")).toBeVisible();
    // No Streamer.bot source subscribes to the identity, so management names the missing setup.
    await expect(row.getByRole("link", { name: "Open Event sources" })).toHaveAttribute("href", "/manage/event-sources");

    const sets = await management("/management/alert-sets", undefined, "GET") as { id: string; active: boolean }[];
    const set = await management(`/management/alert-sets/${sets[0]!.id}`, undefined, "GET") as { overview: { id: string }; inventory: { id: string; eventType: string; externalIdentity?: unknown }[] };
    const alert = set.inventory.find(candidate => candidate.eventType === "external_event")!;
    expect(alert.externalIdentity).toEqual({ providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" });
    const document = await management(`/management/alerts/${alert.id}/editor`, undefined, "GET") as Record<string, unknown> & { targetProfiles: { id: string }[]; layers: unknown[] };
    const animation = { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" };
    await management(`/management/alerts/${alert.id}/editor`, {
      confirmLiveImpact: true,
      document: {
        ...document,
        enabled: true,
        durationMode: "custom",
        durationMs: 5_000,
        layers: [{ id: "message", name: "Message", type: "text", visible: true, order: 0, animation, template: "{userName}: {summary} [{url}]", textStyle, boxStyle }],
        targetProfiles: document.targetProfiles.map(profile => ({ ...profile, enabled: profile.id === "landscape", reviewState: "ready", layerLayouts: profile.id === "landscape" ? [{ layerId: "message", x: 100, y: 100, width: 1200, height: 120, zIndex: 0 }] : [] })),
        outputs: { browserSource: true, deviceRouteIds: [] }
      }
    }, "PUT");
    await management(`/management/alert-sets/${set.overview.id}/starter-review`);
    await management(`/management/alert-sets/${set.overview.id}/activate`, { confirmWarnings: true });

    const output = await management("/management/overlay-outputs/keys", { overlayId: "default", moduleId: null, purpose: "live", scope: "unified" }) as { url: string };
    const overlay = await page.context().newPage();
    const registered = overlay.waitForEvent("websocket").then(socket => socket.waitForEvent("framereceived"));
    await overlay.goto(output.url);
    await expect(overlay.getByTestId("overlay-root")).toBeVisible();
    await registered;

    const trigger = { kind: "streamerbot-event", occurredAt: new Date().toISOString(), providerId: "provider-streamerbot", sourceKey: "General", summary: "badword hello", userName: "Viewer" };
    expect((await runtime.composition.eventIngestionService.ingestEffectTriggers("sb-other", [{ ...trigger, eventId: "sb-other", eventType: "Other" }])).status).toBe("accepted");
    expect((await runtime.composition.eventIngestionService.ingestEffectTriggers("sb-custom", [{ ...trigger, eventId: "sb-custom", eventType: "Custom" }])).status).toBe("accepted");

    await expect(overlay.getByText("Viewer: [moderated] hello []")).toBeVisible();
    const snapshot = runtime.composition.playbackCoordinator.getSnapshot();
    const items = [...(snapshot.current === null ? [] : [snapshot.current]), ...snapshot.queued, ...snapshot.recent];
    expect(items.map(item => item.sourceEvent)).toEqual([expect.objectContaining({
      type: "external_event",
      identity: { providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" },
      summary: "badword hello",
      userName: "Viewer"
    })]);
  } finally {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});
