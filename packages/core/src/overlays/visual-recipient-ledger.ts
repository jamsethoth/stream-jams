import { visualRecipientKeySchema, type VisualRecipientKey } from "./visual-recipient.js";

/** Tracks only outstanding obligations; settled identities consume no storage. */
export class VisualRecipientLedger {
  readonly #pending = new Map<string, string>();
  add(candidate: VisualRecipientKey): void {
    const key = visualRecipientKeySchema.parse(candidate);
    this.#pending.set(identity(key), key.occurrenceId);
  }
  settle(candidate: VisualRecipientKey): boolean {
    return this.#pending.delete(identity(visualRecipientKeySchema.parse(candidate)));
  }
  pending(occurrenceId: string): number {
    let count = 0;
    for (const occurrence of this.#pending.values()) if (occurrence === occurrenceId) count++;
    return count;
  }
}
function identity(key: VisualRecipientKey): string {
  return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]);
}
