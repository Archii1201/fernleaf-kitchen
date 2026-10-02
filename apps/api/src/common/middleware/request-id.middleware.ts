import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_RESPONSE_HEADER = 'X-Request-ID';

/** Conservative shape for client supplied ids: short, opaque, log-safe. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Attaches a request id to every incoming request and echoes it back on the
 * response, so a problem reported by a client can be traced in the logs.
 *
 * Registered with `app.use()` in the bootstrap because it must run before any
 * route handling and has no injected dependencies.
 */
export function requestIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    const requestId =
      candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();

    (req as RequestWithId).requestId = requestId;
    res.setHeader(REQUEST_ID_RESPONSE_HEADER, requestId);

    next();
  };
}

/** Reads the request id attached by {@link requestIdMiddleware}. */
export function getRequestId(req: unknown): string | undefined {
  if (typeof req === 'object' && req !== null && 'requestId' in req) {
    const value = (req as RequestWithId).requestId;
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}
