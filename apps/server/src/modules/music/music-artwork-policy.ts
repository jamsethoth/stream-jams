/** Server-private trust selected by the authenticated adapter, never by track metadata. */
export type MusicArtworkPolicy =
  | { readonly kind: "public-cdn"; readonly domains: readonly string[] }
  | { readonly kind: "configured-server"; readonly origin: string };

export interface PrivateArtworkDescriptor { readonly url: string; }

/** Domain families include subdomains, with a dot boundary to prevent suffix spoofing. */
export const pearArtworkPolicy: MusicArtworkPolicy = Object.freeze({
  kind: "public-cdn", domains: Object.freeze(["ytimg.com", "googleusercontent.com"])
});

export function parseArtworkUrl(input: string, policy: MusicArtworkPolicy | null): URL | null {
  if (policy === null || input.length > 4096) return null;
  try {
    const url = new URL(input);
    if (url.username || url.password || url.hash) return null;
    if (policy.kind === "public-cdn") {
      if (url.protocol !== "https:" || url.port !== "") return null;
      return policy.domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null;
    }
    const server = new URL(policy.origin);
    if (server.username || server.password || server.pathname !== "/" || server.search || server.hash
      || !["https:", "http:"].includes(server.protocol)) return null;
    return url.origin === server.origin ? url : null;
  }
  // error-provenance: allow expected -- malformed artwork and configured origins fail closed
  catch { return null; }
}
