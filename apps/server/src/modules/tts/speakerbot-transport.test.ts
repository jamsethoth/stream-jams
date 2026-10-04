import { testProviderTls } from "../../test-support/provider-tls/transport-test.js";
import { afterEach, describe, expect, it } from "vitest";
import { startProviderFixture, waitForProvider } from "../../test-support/provider-websocket-fixture.js";
import { createNodeStreamerBotSocket } from "../streamerbot/node-streamerbot-socket.js";
import { SpeakerBotClient } from "./speakerbot-client.js";

const peers: Awaited<ReturnType<typeof startProviderFixture>>[] = [];
afterEach(async () => { await Promise.all(peers.splice(0).map(peer => peer.close())); });
const speakInput = { voice: "fixture", message: "Muted test request", badWordFilter: true };
describe("real Speaker.bot transport", () => {
  testProviderTls("speakerbot");
  it.each(["127.0.0.1", "::1"] as const)("matches Speak responses on %s", async host => {
    const peer = await startProviderFixture({ kind: "speakerbot", host, autoRespond: false }); peers.push(peer);
    const client = new SpeakerBotClient({ socketFactory: createNodeStreamerBotSocket, timeoutMs: 500, generateRequestId: () => "matching" });
    const response = client.speak(peer.url, speakInput);
    await waitForProvider(() => peer.requests.length === 1);
    peer.send({ id: "different", status: "ok" });
    peer.send({ id: "matching", status: "ok", marker: "matched" });
    await expect(response).resolves.toMatchObject({ marker: "matched" });
    expect(peer.requests[0]?.message).toMatchObject({ request: "Speak", ...speakInput });
  });
  it.each(["error", "invalid", "drop", "timeout"])("rejects %s response", async mode => {
    const peer = await startProviderFixture({ kind: "speakerbot", autoRespond: false }); peers.push(peer);
    const client = new SpeakerBotClient({ socketFactory: createNodeStreamerBotSocket, timeoutMs: 100, generateRequestId: () => "matching" });
    const response = expect(client.speak(peer.url, speakInput)).rejects.toThrow();
    await waitForProvider(() => peer.requests.length === 1);
    if (mode === "drop") peer.closeClients();
    else if (mode !== "timeout") peer.send({ id: "matching", status: mode === "error" ? "error" : "unknown" });
    await response;
  });
});
