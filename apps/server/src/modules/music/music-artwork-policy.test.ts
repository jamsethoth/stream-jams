import { describe, expect, it } from "vitest";
import { parseArtworkUrl, pearArtworkPolicy } from "./music-artwork-policy.js";

describe("provider artwork policy", () => {
  it("accepts CDN subdomains without accepting suffix spoofing or alternate transport", () => {
    for (const host of ["i.ytimg.com", "yt3.googleusercontent.com", "new.googleusercontent.com"])
      expect(parseArtworkUrl(`https://${host}/art`, pearArtworkPolicy)?.hostname).toBe(host);
    for (const url of ["https://googleusercontent.com.evil.test/art", "https://evilgoogleusercontent.com/art",
      "http://i.ytimg.com/art", "https://user:secret@i.ytimg.com/art", "https://i.ytimg.com:444/art", "https://i.ytimg.com/art#fragment"])
      expect(parseArtworkUrl(url, pearArtworkPolicy)).toBeNull();
    expect(parseArtworkUrl("https://i.ytimg.com/art", null)).toBeNull();
  });

  it("limits configured-server trust to the exact scheme, host and port", () => {
    const policy = { kind: "configured-server", origin: "http://192.168.1.4:32400" } as const;
    expect(parseArtworkUrl("http://192.168.1.4:32400/library/art", policy)).not.toBeNull();
    for (const url of ["http://192.168.1.5:32400/art", "https://192.168.1.4:32400/art", "http://192.168.1.4/art"])
      expect(parseArtworkUrl(url, policy)).toBeNull();
    expect(parseArtworkUrl("http://192.168.1.4:32400/art", { ...policy, origin: `${policy.origin}/path` })).toBeNull();
  });
});
