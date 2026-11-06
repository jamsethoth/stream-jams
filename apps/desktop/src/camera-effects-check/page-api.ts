import type { Report } from "./check-protocol.js";

/* Browser-side helpers shared by the check pages. Every URL stays under the token path. */

/** `/<token>`, taken from the page's own path. */
export const base = location.pathname.slice(0, location.pathname.indexOf("/", 1));

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(base + path, body === undefined ? { cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `${path} failed with ${response.status}`);
  return payload;
}

export function report(message: Report): void {
  void api("/report", message).catch(
    // error-provenance: allow expected -- a lost diagnostic report is replaced by the next one two seconds later
    () => undefined);
}

export function reportError(role: string, error: unknown): void {
  report({ kind: "error", data: { role, message: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500) } });
}

/** Posts a signal for `role` (the pipeline is `publisher`, each receiver `receiver:<id>`). */
export function signal(role: string, body: unknown): void {
  void api(`/signal/${encodeURIComponent(role)}`, body).catch((error: unknown) => reportError(role, error));
}

/** Polls the mailbox for `role` until the returned function is called. */
export function listen(role: string, handler: (body: unknown) => void | Promise<void>): () => void {
  let after = 0;
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const messages = await api<{ sequence: number; body: unknown }[]>(`/signal/${encodeURIComponent(role)}?after=${after}`);
        for (const message of messages) { after = message.sequence; if (!stopped) await handler(message.body); }
      } catch (error) { reportError(role, error); }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  })();
  return () => { stopped = true; };
}

/** Summarises the connected ICE pair: which candidate kinds carried the stream. */
export async function pairSummary(pc: RTCPeerConnection): Promise<{ local: string | null; remote: string | null; rttMs: number | null } | null> {
  const stats = await pc.getStats();
  let pair: RTCIceCandidatePairStats | null = null;
  stats.forEach((entry: RTCStats) => {
    const candidate = entry as RTCIceCandidatePairStats;
    if (entry.type === "candidate-pair" && candidate.nominated === true && candidate.state === "succeeded") pair = candidate;
  });
  if (pair === null) return null;
  const { localCandidateId, remoteCandidateId, currentRoundTripTime } = pair as RTCIceCandidatePairStats;
  const kind = (id: string) => {
    const candidate = stats.get(id) as { address?: string; candidateType?: string; protocol?: string } | undefined;
    if (candidate === undefined) return null;
    const address = candidate.address ?? "";
    const where = address.endsWith(".local") ? "mdns" : address === "127.0.0.1" || address === "::1" ? "loopback" : address === "" ? "hidden" : "lan";
    return `${candidate.candidateType ?? "?"}:${where}:${candidate.protocol ?? "?"}`.slice(0, 64);
  };
  return { local: kind(localCandidateId), remote: kind(remoteCandidateId), rttMs: currentRoundTripTime === undefined ? null : Math.round(currentRoundTripTime * 1000) };
}

/** Median, 95th percentile and maximum of a rolling sample window. */
export function timing(samples: readonly number[]): { medianMs: number | null; p95Ms: number | null; maxMs: number | null } {
  if (samples.length === 0) return { medianMs: null, p95Ms: null, maxMs: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (fraction: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]! * 10) / 10;
  return { medianMs: pick(0.5), p95Ms: pick(0.95), maxMs: Math.round(sorted.at(-1)! * 10) / 10 };
}

export function pushBounded(list: number[], value: number, limit = 150): void {
  list.push(value);
  if (list.length > limit) list.shift();
}
