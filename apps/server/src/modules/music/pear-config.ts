import { X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as tls from "node:tls";
import { pearConfigurationSchema, type PearConfiguration } from "@stream-jams/core";

const inspectTimeoutMs = 5_000;

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

/** The certificate a Pear HTTPS endpoint presented, and whether default trust (system CAs and hostname) accepted it. */
export interface PresentedPearCertificate {
  readonly pem: string;
  readonly sha256: string;
  readonly subject: string;
  readonly issuer: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly authorized: boolean;
}

/**
 * TLS options for Pear HTTPS and WSS. A certificate the user accepted while pairing becomes the only trust anchor and
 * must match its fingerprint exactly; otherwise default trust applies.
 */
export function pearTlsOptions(config: PearConfiguration, hostname: string): tls.ConnectionOptions {
  const host = hostname.replace(/^\[|\]$/g, "");
  // An IP address is not a valid SNI server name (RFC 6066).
  const servername = isIP(host) === 0 ? { servername: host } : {};
  const pinned = config.trustedCertificate;
  if (pinned === undefined) return servername;
  if (new X509Certificate(pinned.pem).fingerprint256 !== pinned.sha256) throw new Error("Pear trusted certificate does not match its fingerprint");
  return {
    ...servername,
    ca: pinned.pem,
    // Lets a CA-issued leaf (for example from mkcert) be the trust anchor without trusting its issuer.
    allowPartialTrustChain: true,
    checkServerIdentity: (_host, certificate) => certificate.fingerprint256 === pinned.sha256 ? undefined : new Error("Pear certificate changed")
  };
}

/** Read the certificate Pear presents without sending any request or credential. Returns null for plain HTTP. */
export async function inspectPearCertificate(config: PearConfiguration, signal: AbortSignal): Promise<PresentedPearCertificate | null> {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "https:") return null;
  const destination = await resolvePearDestination(url);
  const combined = AbortSignal.any([signal, AbortSignal.timeout(inspectTimeoutMs)]);
  if (combined.aborted) throw combined.reason;
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ ...pearTlsOptions({ ...config, trustedCertificate: undefined }, url.hostname), host: destination, port: Number(url.port) || 443, rejectUnauthorized: false });
    const abort = () => { socket.destroy(); reject(combined.reason); };
    combined.addEventListener("abort", abort, { once: true });
    socket.once("secureConnect", () => {
      combined.removeEventListener("abort", abort);
      const raw = socket.getPeerCertificate(true).raw as Buffer | undefined;
      const authorized = socket.authorized;
      socket.destroy();
      if (raw === undefined || raw.length === 0) { reject(new Error("Pear did not present a certificate")); return; }
      const certificate = new X509Certificate(raw);
      resolve({
        pem: certificate.toString(), sha256: certificate.fingerprint256, subject: certificate.subject.replaceAll("\n", ", "),
        issuer: certificate.issuer.replaceAll("\n", ", "), validFrom: certificate.validFrom, validTo: certificate.validTo, authorized
      });
    });
    socket.once("error", error => { combined.removeEventListener("abort", abort); reject(error); });
  });
}
