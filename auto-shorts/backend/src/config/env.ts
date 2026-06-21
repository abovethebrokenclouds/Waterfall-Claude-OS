/**
 * Centralised environment access. Read env vars here, never scattered through
 * the codebase, so configuration is documented in one place.
 */

/**
 * Allowed CORS origins. Comma-separated list in CORS_ORIGINS (e.g. the Lovable
 * app URL). Empty/unset => reflect any origin (convenient for dev/demo; lock
 * this down in production by setting the env var).
 */
function parseCorsOrigins(): string[] | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  corsOrigins: parseCorsOrigins(),
  // Empty => "standalone" mode: no worker; the backend uses a built-in sample
  // transcript so planning/copy work without Whisper/FFmpeg.
  workerUrl: process.env.WORKER_URL ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  whisperModel: process.env.WHISPER_MODEL ?? "base",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    bucket: process.env.S3_BUCKET ?? "",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
  },
};

export type Env = typeof env;
