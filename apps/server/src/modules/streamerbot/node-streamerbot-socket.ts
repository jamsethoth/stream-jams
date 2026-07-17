import WebSocket from "ws";
import type { StreamerBotSocket } from "./streamerbot-client.js";

export function createNodeStreamerBotSocket(url: string): StreamerBotSocket {
  return new WebSocket(url);
}
