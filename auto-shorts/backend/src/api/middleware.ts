/**
 * Cross-cutting HTTP middleware: per-request id + access logging, and a
 * dependency-free in-memory rate limiter. Both are deliberately tiny so the
 * service stays single-process friendly (standalone mode) while still giving
 * production deployments traceability and basic abuse protection.
 */
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../config/logger";
import { sendError } from "./http";

// Augment Express' Request with the per-request id so handlers/log lines can
// reference it without threading it through every signature.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** `req_1a2b3c4d` — short, greppable, collision-safe enough for a request id. */
function newRequestId(): string {
  return `req_${randomUUID().slice(0, 8)}`;
}

/**
 * Assigns a request id (honouring an inbound `x-request-id` so a proxy/front
 * end can correlate), echoes it on the response, and logs one structured line
 * per completed request with method, path, status, and duration.
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const inbound = req.header("x-request-id");
    const requestId = inbound && inbound.length <= 200 ? inbound : newRequestId();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    const start = Date.now();
    res.on("finish", () => {
      logger.info("api.request", {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  };
}

export interface RateLimitOptions {
  /** Max requests per window per client. `0` disables the limiter entirely. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter keyed by client IP. Suitable for a single
 * instance / demo; front it with a shared store (Redis) if you scale out. A
 * `max` of 0 returns a pass-through so tests and dev stay unthrottled.
 */
export function rateLimit(opts: RateLimitOptions) {
  if (opts.max <= 0) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, opts.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      logger.warn("api.rate_limited", { requestId: req.requestId, ip: key });
      sendError(res, 429, "rate_limited", "Too many requests, slow down.");
      return;
    }
    next();
  };
}
