// ratelimit.example.ts — edge-safe rate limiting for a Super Agent / public API
// route using Upstash ratelimit-js (HTTP Redis, runs on Cloudflare Workers).
// Credentials are server secrets (process.env), never VITE_* / client-exposed.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// One limiter per app/route namespace. Sliding window: 20 requests / 60s.
// Tune the window to the route's cost — an AI call is far pricier than a read.
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(), // reads UPSTASH_REDIS_REST_URL / _TOKEN from env (HTTP)
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "verseful:agent",
  analytics: true,
});

function jsonError(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Call at the TOP of an AI / public route handler, before any model work.
export async function enforceRateLimit(opts: { userId?: string; clientIp: string }) {
  // Key on the verified user id when present; fall back to IP for public routes.
  // Never key on a spoofable header alone.
  const id = opts.userId ?? opts.clientIp;
  const { success, limit, remaining, reset } = await ratelimit.limit(id);
  if (!success) {
    return jsonError(429, { error: "rate_limited" }, {
      "Retry-After": String(reset),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
    });
  }
  return null; // allowed — proceed (then route AI through the Super Agent)
}
