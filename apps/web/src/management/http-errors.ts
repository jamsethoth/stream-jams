interface BackendErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly id?: unknown;
    readonly message?: unknown;
  };
}

export interface HttpErrorDetails {
  readonly message: string;
  readonly code: string | null;
  readonly referenceId: string | null;
}

export async function readHttpError(response: Response, fallback: string): Promise<string> {
  return formatHttpError(await readHttpErrorDetails(response, fallback));
}

export async function readHttpErrorDetails(response: Response, fallback: string): Promise<HttpErrorDetails> {
  try {
    const body = (await response.json()) as BackendErrorEnvelope;
    const message = typeof body.error?.message === "string" ? body.error.message : fallback;
    const code = typeof body.error?.code === "string" ? body.error.code : null;
    const referenceId = typeof body.error?.id === "string" ? body.error.id : null;
    return { message, code, referenceId };
  } catch {
    return { message: fallback, code: null, referenceId: null };
  }
}

export function formatHttpError(details: HttpErrorDetails): string {
  if (details.code !== null && details.referenceId !== null) {
    return `${details.message} (${details.code}, ${details.referenceId})`;
  }
  return details.code === null ? details.message : `${details.message} (${details.code})`;
}
