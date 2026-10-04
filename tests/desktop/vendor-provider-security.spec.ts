import { createConnection } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { StreamerBotClient } from "../../apps/server/src/modules/streamerbot/streamerbot-client.js";
import { SpeakerBotClient } from "../../apps/server/src/modules/tts/speakerbot-client.js";
import { createVendorProvider } from "./fixtures/vendor-provider-harness.js";
import { createNodeStreamerBotSocket as createProviderSocket } from "../../apps/server/src/modules/streamerbot/node-streamerbot-socket.js";

async function ready(port: number) {
  await expect.poll(async () => new Promise<boolean>(resolveReady => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolveReady(true); });
    socket.once("error", () => resolveReady(false));
  }), { timeout: 30_000, message: "Vendor local WebSocket server did not start; inspect the owned temporary profile logs." }).toBe(true);
}

for (const authentication of [undefined, { password: "synthetic-vendor-password", enforce: false }, { password: "synthetic-vendor-password", enforce: true }]) {
  test(`installed Streamer.bot ${authentication === undefined ? "authentication disabled with consent" : `authentication enabled Enforce ${authentication.enforce}`} reconnects with the production client`, async ({ browserName }, testInfo) => {
    const vendor = await createVendorProvider("streamerbot", authentication);
    const frames: unknown[] = [];
    const client = new StreamerBotClient({ socketFactory(url) {
      const socket = createProviderSocket(url);
      socket.addEventListener("message", event => {
        const frame = JSON.parse(String(event.data)) as Record<string, unknown>;
        frames.push({ request: frame.request, status: frame.status, hasAuthentication: "authentication" in frame, error: frame.error });
      });
      return socket;
    }, onEvent() {}, backoffMs: [100, 250], requestTimeoutMs: 5000 });
    try {
      vendor.start();
      await ready(vendor.port);
      const connection = { protocol: "ws" as const, host: "127.0.0.1", port: vendor.port, endpoint: "/", allowUnauthenticatedLocalConnection: authentication === undefined, ...(authentication === undefined ? {} : { password: authentication.password }) };
      if (authentication === undefined) {
        client.connect({ ...connection, allowUnauthenticatedLocalConnection: false });
        await expect.poll(() => client.getStatus().referenceId, { timeout: 10_000 }).not.toBeNull();
        expect(client.getStatus().state).not.toBe("connected");
        await expect(client.getEvents()).rejects.toThrow();
        client.disconnect();
      }
      client.connect(connection);
      await expect.poll(() => client.getStatus().state, { timeout: 10_000 }).toBe("connected");
      const info = await client.getInfo();
      expect(JSON.stringify(info)).toContain("1.0.7");
      expect(Object.keys(await client.getEvents()).length).toBeGreaterThan(0);
      await vendor.stop();
      await expect.poll(() => client.getStatus().state, { timeout: 10_000 }).not.toBe("connected");
      vendor.start();
      await ready(vendor.port);
      await expect.poll(() => client.getStatus().state, { timeout: 10_000 }).toBe("connected");
      expect(Object.keys(await client.getEvents()).length).toBeGreaterThan(0);
      if (authentication !== undefined) {
        client.disconnect();
        client.connect({ ...connection, password: "wrong-synthetic-password" });
        await expect.poll(() => client.getStatus().referenceId, { timeout: 10_000 }).not.toBeNull();
        expect(client.getStatus().state).not.toBe("connected");
        await expect(client.getEvents()).rejects.toThrow();
        expect(JSON.stringify(client.getStatus())).not.toContain("synthetic-vendor-password");
        expect(JSON.stringify(client.getStatus())).not.toContain("wrong-synthetic-password");
      }
    } finally {
      await testInfo.attach("provider-protocol-summary", { body: JSON.stringify({ browserName, frames, state: client.getStatus().state, message: client.getStatus().message }), contentType: "application/json" });
      client.disconnect(); await vendor.close();
    }
  });
}

test("installed Speaker.bot validates, rejects an unknown voice, and silently saves local SAPI speech", async () => {
  const vendor = await createVendorProvider("speakerbot");
  const client = new SpeakerBotClient({ socketFactory: createProviderSocket, timeoutMs: 5000 });
  try {
    vendor.start();
    await ready(vendor.port);
    await client.validateConnection(vendor.url);
    await expect(client.speak(vendor.url, { voice: "nonexistent-security-alias", message: "Synthetic security acceptance", badWordFilter: true })).rejects.toThrow();
    expect((await readdir(vendor.audioFolder)).filter(name => name.toLowerCase().endsWith(".wav"))).toEqual([]);
    await client.speak(vendor.url, { voice: "SecurityTestVoice", message: "Synthetic security acceptance", badWordFilter: true });
    await expect.poll(async () => (await readdir(vendor.audioFolder)).filter(name => name.toLowerCase().endsWith(".wav")).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const files = (await readdir(vendor.audioFolder)).filter(name => name.toLowerCase().endsWith(".wav"));
    const wav = await readFile(join(vendor.audioFolder, files[0]!));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    let byteRate = 0;
    let dataBytes = 0;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const chunk = wav.subarray(offset, offset + 4).toString();
      const length = wav.readUInt32LE(offset + 4);
      if (offset + 8 + length > wav.length) throw new Error("Saved WAV contains a truncated chunk");
      if (chunk === "fmt " && length >= 16) byteRate = wav.readUInt32LE(offset + 16);
      if (chunk === "data") dataBytes += length;
      offset += 8 + length + length % 2;
    }
    expect(byteRate).toBeGreaterThan(0);
    expect(dataBytes).toBeGreaterThan(0);
    expect(dataBytes / byteRate).toBeGreaterThan(0);
  } finally { await vendor.close(); }
});
