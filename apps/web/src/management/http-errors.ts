interface BackendErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly id?: unknown;
    readonly message?: unknown;
    readonly nextStep?: unknown;
    readonly references?: unknown;
  };
}

export interface HttpErrorReference {
  readonly alertId: string;
  readonly name: string;
}

export interface HttpErrorDetails {
  readonly message: string;
  readonly code: string | null;
  readonly referenceId: string | null;
  readonly nextStep: string | null;
  readonly references: readonly HttpErrorReference[];
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
    const nextStep = typeof body.error?.nextStep === "string" ? body.error.nextStep : null;
    const references = Array.isArray(body.error?.references)
      ? body.error.references.flatMap((reference): HttpErrorReference[] => {
          if (typeof reference !== "object" || reference === null) return [];
          if (!("alertId" in reference) || typeof reference.alertId !== "string") return [];
          if (!("name" in reference) || typeof reference.name !== "string") return [];
          return [{ alertId: reference.alertId, name: reference.name }];
        })
      : [];
    return { message, code, referenceId, nextStep, references };
  } catch {
    return { message: fallback, code: null, referenceId: null, nextStep: null, references: [] };
  }
}

export function formatHttpError(details: HttpErrorDetails): string {
  if (details.code !== null && details.referenceId !== null) {
    return `${details.message} (${details.code}, ${details.referenceId})`;
  }
  return details.code === null ? details.message : `${details.message} (${details.code})`;
}
