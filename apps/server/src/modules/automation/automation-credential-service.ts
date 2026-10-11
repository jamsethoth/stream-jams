import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const automationScopes = ["timers:read", "timers:control", "playback:read", "playback:pause:alerts", "playback:pause:screen-effects", "playback:skip:alerts", "playback:skip:screen-effects", "playback:clear:alerts", "playback:clear:screen-effects", "playback:mute:alerts", "playback:mute:screen-effects", "videos:read", "videos:submit", "videos:control"] as const;
export type AutomationScope = typeof automationScopes[number];
export const automationScopesSchema = z.array(z.enum(automationScopes)).min(1).max(automationScopes.length).refine(s => new Set(s).size === s.length && (!s.includes("timers:control") || s.includes("timers:read")) && (!s.some(v => v.startsWith("playback:") && v !== "playback:read") || s.includes("playback:read")) && (!s.some(v => v === "videos:submit" || v === "videos:control") || s.includes("videos:read")));
export const pairingInputSchema = z.object({ clientName: z.string().trim().min(1).max(80), scopes: automationScopesSchema, codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();
export const approvalInputSchema = z.object({ scopes: automationScopesSchema }).strict();
export const proofInputSchema = z.object({ verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/u) }).strict();
export interface AutomationGrant { readonly id: string; readonly clientName: string; readonly scopes: readonly AutomationScope[]; readonly createdAt: string; readonly revokedAt: string | null }
export interface StoredAutomationGrant extends AutomationGrant { readonly tokenHash: string; readonly claimedAt: string | null }
export interface AutomationGrantRepository { insert(grant: StoredAutomationGrant): void; findByHash(hash: string): StoredAutomationGrant | null; list(): readonly AutomationGrant[]; revoke(id: string, at: string): boolean; expireUnclaimed(cutoff: string, at: string): void; claim(id: string, at: string): void }
export interface AutomationPairing { readonly id: string; readonly clientName: string; readonly scopes: readonly AutomationScope[]; readonly comparisonCode: string; readonly expiresAt: string; readonly approvalUrl: string; readonly status: "pending" | "approved" | "denied" }
interface Pending { view: AutomationPairing; challenge: string; expiresMs: number; approvedScopes: readonly AutomationScope[] | null }
export class AutomationCredentialError extends Error { constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); } }
export class AutomationCredentialService {
  readonly #pending = new Map<string, Pending>();
  readonly #now: () => number;
  readonly #assertAvailable: () => void;
  constructor(private readonly repository: AutomationGrantRepository, options: { readonly now?: () => number; readonly assertAvailable?: () => void } = {}) { this.#now = options.now ?? Date.now; this.#assertAvailable = options.assertAvailable ?? (() => undefined); this.expireUnclaimed(); }
  createPairing(input: unknown): AutomationPairing {
    this.#assertAvailable(); const parsed = pairingInputSchema.parse(input); this.prune();
    if (this.#pending.size >= 32) throw new AutomationCredentialError(429, "AUTOMATION_PAIRING_LIMIT", "Too many pending pairing requests");
    const id = randomUUID(); const expiresMs = this.#now() + 300_000;
    const view: AutomationPairing = { id, clientName: parsed.clientName, scopes: parsed.scopes, comparisonCode: randomBytes(4).toString("hex").toUpperCase(), expiresAt: new Date(expiresMs).toISOString(), approvalUrl: `/manage/settings?automationPairing=${id}#automation`, status: "pending" };
    this.#pending.set(id, { view, challenge: parsed.codeChallenge, expiresMs, approvedScopes: null }); return view;
  }
  listPairings(): readonly AutomationPairing[] { this.prune(); return [...this.#pending.values()].map(p => p.view); }
  getPairing(id: string): AutomationPairing { return this.pending(id).view; }
  approve(id: string, input: unknown): AutomationPairing {
    this.#assertAvailable(); const parsed = approvalInputSchema.parse(input); const pending = this.pending(id);
    if (pending.view.status !== "pending" || parsed.scopes.some(scope => !pending.view.scopes.includes(scope))) throw new AutomationCredentialError(409, "AUTOMATION_PAIRING_CONFLICT", "Pairing cannot be approved with these scopes");
    pending.approvedScopes = parsed.scopes; pending.view = { ...pending.view, status: "approved" }; return pending.view;
  }
  deny(id: string): AutomationPairing { this.#assertAvailable(); const pending = this.pending(id); if (pending.view.status !== "pending") throw new AutomationCredentialError(409, "AUTOMATION_PAIRING_CONFLICT", "Pairing is already decided"); pending.view = { ...pending.view, status: "denied" }; return pending.view; }
  pairingStatus(id: string, verifier: string): AutomationPairing { return this.prove(id, verifier).view; }
  exchange(id: string, verifier: string): { token: string; grant: AutomationGrant } {
    this.#assertAvailable(); const pending = this.prove(id, verifier);
    if (pending.view.status !== "approved" || pending.approvedScopes === null) throw new AutomationCredentialError(409, "AUTOMATION_PAIRING_NOT_APPROVED", "Pairing is not approved");
    const token = `sja_${randomBytes(32).toString("base64url")}`;
    const grant: AutomationGrant = { id: randomUUID(), clientName: pending.view.clientName, scopes: pending.approvedScopes, createdAt: new Date(this.#now()).toISOString(), revokedAt: null };
    this.repository.insert({ ...grant, tokenHash: hash(token), claimedAt: null }); this.#pending.delete(id); return { token, grant };
  }
  verify(token: string): AutomationGrant | null { this.expireUnclaimed(); if (!/^sja_[A-Za-z0-9_-]{43}$/u.test(token)) return null; const stored = this.repository.findByHash(hash(token)); if (stored === null || stored.revokedAt !== null) return null; if (stored.claimedAt === null) this.repository.claim(stored.id, new Date(this.#now()).toISOString()); return grantView(stored); }
  listGrants(): readonly AutomationGrant[] { this.expireUnclaimed(); return this.repository.list(); }
  revoke(id: string): boolean { this.#assertAvailable(); return this.repository.revoke(id, new Date(this.#now()).toISOString()); }
  clearPending(): void { this.#pending.clear(); }
  private expireUnclaimed(): void { this.#assertAvailable(); this.repository.expireUnclaimed(new Date(this.#now() - 300_000).toISOString(), new Date(this.#now()).toISOString()); }
  private prune(): void { for (const [id, p] of this.#pending) if (p.expiresMs <= this.#now()) this.#pending.delete(id); }
  private pending(id: string): Pending { this.prune(); const p = this.#pending.get(id); if (!p) throw new AutomationCredentialError(404, "AUTOMATION_PAIRING_UNAVAILABLE", "Pairing request is unavailable"); return p; }
  private prove(id: string, verifier: string): Pending { proofInputSchema.parse({ verifier }); const p = this.pending(id); if (!timingSafeEqual(Buffer.from(hash(verifier)), Buffer.from(p.challenge))) throw new AutomationCredentialError(401, "AUTOMATION_PAIRING_PROOF_REQUIRED", "Valid pairing proof is required"); return p; }
}
function hash(value: string): string { return createHash("sha256").update(value).digest("base64url"); }

export function grantView(stored: AutomationGrant): AutomationGrant { return { id: stored.id, clientName: stored.clientName, scopes: stored.scopes, createdAt: stored.createdAt, revokedAt: stored.revokedAt }; }
