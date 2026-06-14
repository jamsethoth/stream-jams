interface BackendErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly id?: unknown;
    readonly message?: unknown;
  };
}

export async function readHttpError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as BackendErrorEnvelope;
    const message = typeof body.error?.message === "string" ? body.error.message : fallback;
    const code = typeof body.error?.code === "string" ? body.error.code : null;
    const id = typeof body.error?.id === "string" ? body.error.id : null;

    if (code !== null && id !== null) {
      return `${message} (${code}, ${id})`;
    }

    if (code !== null) {
      return `${message} (${code})`;
    }

    return message;
  } catch {
    return fallback;
  }
}
