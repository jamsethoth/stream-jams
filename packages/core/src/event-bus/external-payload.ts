import { z } from "zod";

/** Serialized size limit for a journaled external payload. Larger payloads are dropped at intake. */
export const externalEventPayloadMaxBytes = 16_384;

export const externalEventPayloadSchema = z.record(z.string(), z.unknown()).refine((value) => {
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= externalEventPayloadMaxBytes;
  }
  // error-provenance: allow expected -- unserializable values (cycles, BigInt) are simply not valid payloads
  catch {
    return false;
  }
}, "External event payloads must be JSON objects within the size limit");
