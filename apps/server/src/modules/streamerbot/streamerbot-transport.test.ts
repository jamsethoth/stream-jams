import { testProviderTls } from "../../test-support/provider-tls/transport-test.js";
import { afterEach, describe, expect, it } from "vitest";
import { providerAuthenticationVectors, startProviderFixture, waitForProvider } from "../../test-support/provider-websocket-fixture.js";
import { StreamerBotClient } from "./streamerbot-client.js";
import { createNodeStreamerBotSocket } from "./node-streamerbot-socket.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0; });
async function fixture(options: Parameters<typeof startProviderFixture>[0]) {
  const peer = await startProviderFixture(options); cleanups.push(() => peer.close()); return peer;
}
function client(peer: Awaited<ReturnType<typeof fixture>>, input: { password?: string; allowUnauthenticatedLocalConnection?: boolean } = {}) {
  const ids: unknown[] = [];
  const bot = new StreamerBotClient({ socketFactory: createNodeStreamerBotSocket, onEvent: event => { ids.push(event.data.id); }, requestTimeoutMs: 100, backoffMs: [15] });
  cleanups.push(() => bot.disconnect());
  bot.connect({ host: new URL(peer.url).hostname === "[::1]" ? "::1" : "127.0.0.1", port: peer.port, ...input });
  return { bot, ids };
}
describe("real Streamer.bot transport", () => {
  testProviderTls("streamerbot");
  it.each(["127.0.0.1", "::1"] as const)("authenticates and reauthenticates/re-subscribes once on %s", async host => {
    const peer = await fixture({ kind: "streamerbot", host, expectedAuthentication: providerAuthenticationVectors["fixture-password"] });
    const { bot, ids } = client(peer, { password: "fixture-password" });
    await waitForProvider(() => bot.getStatus().state === "connected");
    await bot.subscribe([{ sourceKey: "Twitch", eventTypes: ["Follow"] }]);
    peer.sendEvent("first"); await waitForProvider(() => ids.length === 1);
    peer.closeClients();
    await waitForProvider(() => peer.connections.length === 2 && bot.getStatus().state === "connected");
    await waitForProvider(() => peer.requests.filter(item => item.message.request === "Subscribe").length === 2);
    peer.sendEvent("second"); await waitForProvider(() => ids.length === 2);
    expect(ids).toEqual(["first", "second"]);
    expect(peer.requests.filter(item => item.message.request === "Authenticate")).toHaveLength(2);
    expect(peer.requests.filter(item => item.message.request === "Subscribe")).toHaveLength(2);
  });
  it.each([undefined, "wrong"])("rejects missing or wrong password %s", async password => {
    const peer = await fixture({ kind: "streamerbot", expectedAuthentication: providerAuthenticationVectors["required"] });
    const { bot, ids } = client(peer, password === undefined ? {} : { password });
    await waitForProvider(() => bot.getStatus().lastErrorAt !== null);
    peer.sendEvent("blocked");
    expect(ids).toEqual([]);
    expect(peer.requests.some(item => item.message.request === "Subscribe")).toBe(false);
  });
  it("requires the second handshake before reconnect event delivery and subscription restore", async () => {
    const peer = await fixture({ kind: "streamerbot", autoRespond: false });
    const { bot, ids } = client(peer, { password: "required" });
    const hello = { request: "Hello", info: {}, authentication: { salt: "salt", challenge: "challenge" } };
    await waitForProvider(() => peer.connections.length === 1);
    peer.send(hello);
    await waitForProvider(() => peer.requests.length === 1);
    peer.send({ id: peer.requests[0]!.message.id, status: "ok" });
    await waitForProvider(() => bot.getStatus().state === "connected");
    const subscribed = bot.subscribe([{ sourceKey: "Twitch", eventTypes: ["Follow"] }]);
    await waitForProvider(() => peer.requests.length === 2);
    peer.send({ id: peer.requests[1]!.message.id, status: "ok" }); await subscribed;
    peer.closeClients();
    await waitForProvider(() => peer.connections.length === 2);
    peer.sendEvent("before-reconnect-Hello"); peer.send(hello);
    await waitForProvider(() => peer.requests.length === 3);
    peer.sendEvent("pending-reconnect-auth");
    peer.send({ id: peer.requests[2]!.message.id, status: "ok" });
    await waitForProvider(() => peer.requests.length === 4);
    expect(peer.requests[3]!.message.request).toBe("Subscribe");
    peer.send({ id: peer.requests[3]!.message.id, status: "ok" });
    peer.sendEvent("after-reconnect-auth"); await waitForProvider(() => ids.length === 1);
    expect(ids).toEqual(["after-reconnect-auth"]);
    expect(peer.requests.filter(request => request.connection === 1 && request.message.request === "Subscribe")).toHaveLength(1);
  });
  it("delivers exactly authenticated events after delayed success", async () => {
    const peer = await fixture({ kind: "streamerbot", autoRespond: false });
    const { bot, ids } = client(peer, { password: "required" });
    await waitForProvider(() => peer.connections.length === 1);
    peer.sendEvent("before-Hello");
    peer.send({ request: "Hello", info: {}, authentication: { salt: "salt", challenge: "challenge" } });
    await waitForProvider(() => peer.requests.length === 1);
    peer.sendEvent("pending-auth");
    peer.send({ id: peer.requests[0]!.message.id, status: "ok" });
    await waitForProvider(() => bot.getStatus().state === "connected");
    peer.sendEvent("authenticated");
    await waitForProvider(() => ids.length === 1);
    expect(ids).toEqual(["authenticated"]);
  });
  it("drops pre-Hello/pending/failure events and stale success after duplicate Hello", async () => {
    const peer = await fixture({ kind: "streamerbot", autoRespond: false });
    const { bot, ids } = client(peer, { password: "required", allowUnauthenticatedLocalConnection: true });
    await waitForProvider(() => peer.connections.length === 1);
    peer.sendEvent("pre-hello");
    peer.send({ request: "Hello", info: {}, authentication: { salt: "salt", challenge: "challenge" } });
    await waitForProvider(() => peer.requests.length === 1);
    peer.sendEvent("pending");
    peer.send({ request: "Hello", info: {} });
    peer.send({ id: peer.requests[0]!.message.id, status: "ok" });
    peer.sendEvent("failed");
    await waitForProvider(() => bot.getStatus().lastErrorAt !== null);
    expect(ids).toEqual([]);
    expect(bot.getStatus().state).not.toBe("connected");
  });
  it.each(["malformed", "downgrade", "no-consent"])("fails closed on %s Hello", async mode => {
    const peer = await fixture({ kind: "streamerbot", autoRespond: false });
    const { bot, ids } = client(peer, mode === "no-consent" ? {} : { password: "required", allowUnauthenticatedLocalConnection: true });
    await waitForProvider(() => peer.connections.length === 1);
    peer.send({ request: "Hello", info: {}, ...(mode === "malformed" ? { authentication: { salt: "salt" } } : {}) });
    await waitForProvider(() => bot.getStatus().lastErrorAt !== null);
    peer.sendEvent("blocked"); expect(ids).toEqual([]);
    expect(peer.requests).toEqual([]);
  });
  it("permits unauthenticated loopback only with consent", async () => {
    const peer = await fixture({ kind: "streamerbot" });
    const { bot, ids } = client(peer, { allowUnauthenticatedLocalConnection: true });
    await waitForProvider(() => bot.getStatus().state === "connected");
    peer.sendEvent("consented"); await waitForProvider(() => ids.length === 1);
    expect(ids).toEqual(["consented"]);
  });
});
