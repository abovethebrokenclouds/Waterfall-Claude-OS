/**
 * Consistent HTTP error envelope. Every error response — validation, not-found,
 * rate-limit, and uncaught — serialises the same shape so clients (and the
 * Lovable frontend) can parse failures uniformly:
 *
 *   { "error": { "code": "bad_request", "message": "url is required" },
 *     "requestId": "req_1a2b3c4d" }
 *
 * `requestId` echoes the per-request id (see requestContext middleware) so a
 * client-side failure can be traced to a server log line.
 */
import type { Request, Response } from "express";

export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "internal_error";

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
  requestId?: string;
}

/** Write a structured error response, carrying the request id when present. */
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
): void {
  const requestId = (res.req as Request | undefined)?.requestId;
  const body: ErrorBody = { error: { code, message } };
  if (requestId) body.requestId = requestId;
  res.status(status).json(body);
}

/** 400 with a validation message. */
export function badRequest(res: Response, message: string): void {
  sendError(res, 400, "bad_request", message);
}

/** 404 for a missing resource. */
export function notFound(res: Response, message: string): void {
  sendError(res, 404, "not_found", message);
}
