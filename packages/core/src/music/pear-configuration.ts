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

export const pearConfigurationSchema = z.object({
  baseUrl: loopbackBaseUrlSchema.default("http://127.0.0.1:26538"),
  transport: z.enum(["auto", "ws", "poll"]).default("auto")
}).strict();

export type PearConfiguration = z.infer<typeof pearConfigurationSchema>;
