import process from "node:process";
import { URL } from "node:url";
import { setTimeout } from "node:timers";
import console from "node:console";
import { StreamerBotClient } from "../../../dist/modules/streamerbot/streamerbot-client.js";
import { createNodeStreamerBotSocket } from "../../../dist/modules/streamerbot/node-streamerbot-socket.js";
import { SpeakerBotClient } from "../../../dist/modules/tts/speakerbot-client.js";

const [kind, url] = process.argv.slice(2);
let client;
try {
  if (kind === "speakerbot") {
    client = new SpeakerBotClient({ socketFactory: createNodeStreamerBotSocket, timeoutMs: 500 });
    await client.speak(url, { voice: "fixture", message: "Silent fixture", badWordFilter: true });
  } else {
    client = new StreamerBotClient({ socketFactory: createNodeStreamerBotSocket, onEvent() {}, backoffMs: [10_000], requestTimeoutMs: 500 });
    const parsed = new URL(url);
    client.connect({ protocol: "wss", host: parsed.hostname, port: Number(parsed.port), password: "public-fixture-password" });
    const end = Date.now() + 2_000;
    while (client.getStatus().state !== "connected") {
      if (client.getStatus().lastErrorAt !== null || Date.now() > end) throw new Error("TLS connection rejected");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await client.getEvents();
  }
  console.log("provider-tls:accepted");
} catch {
  console.log("provider-tls:rejected");
} finally {
  if (kind === "streamerbot") client?.disconnect();
}
process.exit(0);
