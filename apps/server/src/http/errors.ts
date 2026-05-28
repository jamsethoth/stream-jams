import type { FastifyReply } from "fastify";

export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly host?: "127.0.0.1";
    readonly port?: number;
  };
}

export function sendHttpError(reply: FastifyReply, statusCode: number, error: HttpErrorBody["error"]): FastifyReply {
  return reply.status(statusCode).send({ error });
}
