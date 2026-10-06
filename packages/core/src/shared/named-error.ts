/** Browser-compatible naming and native cause mechanics; domain ownership stays with leaves. */
export class NamedError extends Error {
  constructor(name: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = name;
  }
}
