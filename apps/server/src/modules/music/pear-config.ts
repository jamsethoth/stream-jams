import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pearConfigurationSchema, type PearConfiguration } from "@stream-jams/core";

export function parsePearConfiguration(input: unknown): PearConfiguration {
  return pearConfigurationSchema.parse(input);
}

export function buildPearAuthUrl(config: PearConfiguration, clientId: string): URL {
  const url = new URL(config.baseUrl);
  url.pathname = `/auth/${encodeURIComponent(clientId)}`;
  return url;
}

export function isLoopbackAddress(address: string): boolean {
  return address === "::1" || (isIP(address) === 4 && address.split(".")[0] === "127");
}

/** Resolve once and pin the destination used by the HTTP request. */
export async function resolvePearDestination(url: URL): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) {
    if (!isLoopbackAddress(host)) throw new Error("Pear destination must be loopback");
    return host;
  }
  if (host.toLowerCase() !== "localhost") throw new Error("Pear destination must be loopback");
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isLoopbackAddress(address))) {
    throw new Error("Pear localhost resolved outside loopback");
  }
  return addresses[0]!.address;
}
