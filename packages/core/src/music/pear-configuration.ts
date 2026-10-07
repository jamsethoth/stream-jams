import { z } from "zod";

const loopbackBaseUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "http:" || url.protocol === "https:")
      && (host === "localhost" || /^127(?:\.\d{1,3}){3}$/u.test(host) || host === "[::1]")
      && url.username === "" && url.password === "" && url.search === "" && url.hash === ""
      && url.pathname === "/" && url.port !== "0";
  }
  // error-provenance: allow expected -- malformed endpoint input is rejected by schema validation
  catch {
    return false;
  }
}, "Pear must use a loopback HTTP(S) base URL without credentials, path, query or fragment");

/** SHA-256 fingerprint in Node's colon-separated uppercase form. */
export const pearCertificateFingerprintSchema = z.string().regex(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u, "Invalid certificate fingerprint");

/** A self-signed Pear certificate the user explicitly accepted while pairing; HTTPS and WSS trust only this certificate. */
export const pearTrustedCertificateSchema = z.object({
  sha256: pearCertificateFingerprintSchema,
  pem: z.string().max(16_384).regex(/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/u, "Invalid certificate")
}).strict();

export const pearConfigurationSchema = z.object({
  baseUrl: loopbackBaseUrlSchema.default("http://127.0.0.1:26538"),
  transport: z.enum(["auto", "ws", "poll"]).default("auto"),
  trustedCertificate: pearTrustedCertificateSchema.optional()
}).strict();

export type PearConfiguration = z.infer<typeof pearConfigurationSchema>;
export type PearTrustedCertificate = z.infer<typeof pearTrustedCertificateSchema>;
