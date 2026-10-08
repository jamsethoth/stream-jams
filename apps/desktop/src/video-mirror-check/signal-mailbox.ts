/** A bounded per-role message queue for the check's WebRTC signaling over local HTTP. */
export class SignalMailbox {
  readonly #messages = new Map<string, { readonly sequence: number; readonly body: unknown }[]>();
  #sequence = 0;

  constructor(private readonly limit = 256) {}

  post(role: string, body: unknown): number {
    const queue = this.#messages.get(role) ?? [];
    this.#sequence += 1;
    queue.push({ sequence: this.#sequence, body });
    if (queue.length > this.limit) queue.splice(0, queue.length - this.limit);
    this.#messages.set(role, queue);
    return this.#sequence;
  }

  /** Messages for `role` newer than `after`, oldest first. */
  read(role: string, after: number): { readonly sequence: number; readonly body: unknown }[] {
    return (this.#messages.get(role) ?? []).filter(message => message.sequence > after);
  }

  clear(): void {
    this.#messages.clear();
  }
}
