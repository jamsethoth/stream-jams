import { z } from "zod";

export const desktopMediaProtocolVersion = 1;
export const localMediaResourceLimits = Object.freeze({ activeStreams: 256, liveGrants: 4096, fileReadBufferBytes: 64 * 1024 });
const identity = z.string().min(1).max(256).refine(value => value.trim() === value);
export const mediaVersionSnapshotSchema = z.object({
  assetId: identity,
  version: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"]),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  durationMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()
}).strict();
/** Trusted worker/main boundary only. Never pass this server capability to a renderer. */
export const trustedMediaGrantSchema = z.object({
  snapshot: mediaVersionSnapshotSchema,
  handle: z.string().regex(/^med_[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
}).strict();
export const privateMediaReferenceSchema = z.object({
  protocolVersion: z.literal(desktopMediaProtocolVersion),
  snapshot: mediaVersionSnapshotSchema,
  handle: z.string().regex(/^private_[A-Za-z0-9_-]{43}$/)
}).strict();
export const mediaPreviewDescriptorSchema = z.object({
  id: z.uuid(),
  url: z.string().regex(/^\/media\/med_[A-Za-z0-9_-]{43}$/),
  snapshot: mediaVersionSnapshotSchema,
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
}).strict();
export const desktopMediaOwnershipSchema = z.object({
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  recipientId: identity,
  ownerId: identity
}).strict();
export function assertDesktopMediaProtocolVersion(candidate: unknown): asserts candidate is typeof desktopMediaProtocolVersion {
  if (candidate !== desktopMediaProtocolVersion) throw new Error("Incompatible desktop media protocol. Restart using a complete matching Stream Jams package.");
}
export type MediaVersionSnapshot = z.infer<typeof mediaVersionSnapshotSchema>;
export type TrustedMediaGrant = z.infer<typeof trustedMediaGrantSchema>;
export type PrivateMediaReference = z.infer<typeof privateMediaReferenceSchema>;
export type MediaPreviewDescriptor = z.infer<typeof mediaPreviewDescriptorSchema>;
export type DesktopMediaOwnership = z.infer<typeof desktopMediaOwnershipSchema>;
