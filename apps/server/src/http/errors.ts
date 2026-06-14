import type { FastifyReply } from "fastify";

export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly id?: string;
    readonly host?: "127.0.0.1";
    readonly port?: number;
    readonly reason?: string;
    readonly retryAfterSeconds?: number;
    readonly moduleId?: string;
  };
}

export class HttpResponseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly safeMessage: string
  ) {
    super(safeMessage);
  }
}

export function sendHttpError(reply: FastifyReply, statusCode: number, error: HttpErrorBody["error"]): FastifyReply {
  return reply.status(statusCode).send({ error });
}
