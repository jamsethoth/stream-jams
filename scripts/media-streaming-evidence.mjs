import { z } from 'zod';
import { Buffer } from 'node:buffer';
const text = z.string().max(1024);
const number = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const integer = number.int();
const rows = schema => z.array(schema).max(10000);
const object = fields => z.strictObject(fields);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const memory = object({ rss: integer, heapTotal: integer, heapUsed: integer, external: integer, arrayBuffers: integer });
const renderer = object({ usedJSHeapSize: integer, totalJSHeapSize: integer, jsHeapSizeLimit: integer.optional() }).nullable();
const ipc = rows(object({ channel: z.enum(['stream-jams:audio-command', 'stream-jams:overlay-command']), sizeBytes: integer, bodyField: z.boolean(), trustedHandle: z.boolean() }));
const contentRange = z.string().max(100).regex(/^bytes (?:\d+-\d+|\*)\/\d+$/).nullable();
const native = { muted: z.boolean(), volume: number.max(1), privateUrl: z.boolean(), error: integer.max(4).nullable() };
const sample = { at: integer, main: memory, processes: z.array(object({ pid: integer, type: z.string().max(64), memory: object({ workingSetSize: number, peakWorkingSetSize: number, privateBytes: number.optional() }) })).max(64) };
const limitations = z.array(text).max(20);
const acceptance = object({
  packageSha256: hash, profile: text, files: rows(object({ name: text, sizeBytes: integer, sha256: hash, pass: z.enum(['first-process-use', 'warm-repeat']), onsetObservedMs: number, playback: object({ ...native, currentTime: number, duration: number.nullable(), sinkId: z.string().max(256), seekTarget: number, seekTime: number, seekMs: number }) })),
  requests: rows(object({ status: integer.min(100).max(599), range: z.string().max(100).regex(/^bytes=\d*-\d*$/).nullable(), contentRange })),
  samples: rows(object({ label: text, ...sample, renderer })), ipc, limitations,
  images: z.array(object({ mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), sizeBytes: integer, sha256: hash, native: object({ width: integer, height: integer, privateUrl: z.boolean() }) })).max(4).optional(),
  packaged: object({ packaged: z.boolean(), appPath: text, versions: object({ node: z.string().max(64).regex(/^[\d.a-z+-]+$/), electron: z.string().max(64).regex(/^[\d.a-z+-]+$/), chrome: z.string().max(64).regex(/^[\d.a-z+-]+$/) }) }).optional(),
  error: z.literal('ACCEPTANCE_FAILED').optional(), quitError: z.literal('QUIT_FAILED').optional(), logError: z.literal('TIMING_LOG_FAILED').optional(),
  quit: object({ elapsedMs: number, exitCode: z.number().int().min(-1).max(255).nullable(), capturedPidsExited: z.boolean() }).optional(),
  nativeTiming: rows(object({ preparationDurationMs: number.optional(), scheduledStartEpochMs: integer.optional(), actualStartEpochMs: integer.optional(), terminalOutcome: z.enum(['completed', 'failed', 'stopped', 'timed-out']).optional() }))
});
const resources = object({
  profile: text, packageSha256: hash,
  results: z.array(object({ sizeMiB: z.union([z.literal(1), z.literal(25), z.literal(100)]), sizeBytes: integer, pass: integer.max(1), onsetObservedMs: number, native: object({ ...native, target: number, actual: number }), rendererHeap: renderer })).max(6),
  ranges: rows(object({ status: integer.min(100).max(599), contentRange })),
  observation: object({ ipc, samples: rows(object(sample)) }).optional(),
  utilityResources: z.array(object({ label: z.string().max(32).regex(/^(?:1|25|100)MiB:[01]$/), pid: integer, before: memory, peak: memory, afterGC: memory, cleanup: object({ owners: integer, grants: integer, readers: integer, storeReaders: integer }), reads: rows(object({ expectedSizeBytes: integer, readBytes: integer, maximumChunkBytes: integer, highWaterMark: integer })) })).max(6),
  utilityScope: text, quitMs: number.optional(), exitCode: z.number().int().min(-1).max(255).nullable(), capturedPidsExited: z.boolean(), failures: z.array(z.enum(['PLAYBACK_FAILED', 'OBSERVATION_FAILED', 'QUIT_FAILED'])).max(3), limitations
});
const failure = object({ status: z.literal('invalid-evidence'), failures: z.array(z.enum(['EVIDENCE_VALIDATION_FAILED', 'ACCEPTANCE_FAILED', 'PLAYBACK_FAILED', 'OBSERVATION_FAILED', 'QUIT_FAILED', 'TIMING_LOG_FAILED'])).min(1).max(4).refine(codes => codes[0] === 'EVIDENCE_VALIDATION_FAILED') });

/** Never expose Zod issue input or arbitrary exception text in saved evidence. */
export function serializeMediaStreamingEvidence(kind, input) {
  const schema = { acceptance, resources, failure }[kind];
  const parsed = schema?.safeParse(input);
  if (!parsed?.success) throw new Error('Media streaming evidence validation failed');
  const serialized = JSON.stringify(parsed.data, null, 2);
  if (Buffer.byteLength(serialized) > 16 * 1024 * 1024) throw new Error('Media streaming evidence validation failed');
  return serialized;
}
