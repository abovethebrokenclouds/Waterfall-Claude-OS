/**
 * Production wiring + server entry. Constructs the real adapters and the
 * Super Agent, then starts the HTTP API. Persistence and the render queue fall
 * back to in-memory implementations when DATABASE_URL / REDIS_URL are unset, so
 * the API boots cleanly in dev.
 */
import { Pool } from "pg";
import { createClient } from "redis";
import { createApp } from "./api/app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { superAgent } from "./config/superAgent";
import { WorkerIngestionService } from "./services/ingestion";
import { WorkerTranscriptionService } from "./services/transcription";
import {
  InMemoryRenderQueue,
  RedisRenderQueue,
  type RenderQueue,
} from "./services/queue";
import {
  InMemoryShortsRepository,
  PostgresShortsRepository,
  type ShortsRepository,
} from "./services/storage";

const workerEndpoint = process.env.WORKER_URL ?? "http://localhost:5001";

function buildRepository(): ShortsRepository {
  if (!env.databaseUrl) {
    logger.warn("storage.in_memory", { reason: "DATABASE_URL unset" });
    return new InMemoryShortsRepository();
  }
  const pool = new Pool({ connectionString: env.databaseUrl });
  logger.info("storage.postgres");
  return new PostgresShortsRepository({
    query: (text, params) => pool.query(text, params),
  });
}

async function buildQueue(): Promise<RenderQueue> {
  if (!env.redisUrl) {
    logger.warn("queue.in_memory", { reason: "REDIS_URL unset" });
    return new InMemoryRenderQueue();
  }
  const client = createClient({ url: env.redisUrl });
  client.on("error", (err) => logger.error("redis.error", { message: String(err) }));
  await client.connect();
  logger.info("queue.redis");
  return new RedisRenderQueue({
    rPush: (key, value) => client.rPush(key, value),
    hSet: (key, field, value) => client.hSet(key, field, value),
    hGet: (key, field) => client.hGet(key, field),
  });
}

async function main(): Promise<void> {
  const app = createApp({
    agent: superAgent,
    ingestion: new WorkerIngestionService(workerEndpoint),
    transcription: new WorkerTranscriptionService(workerEndpoint),
    queue: await buildQueue(),
    repository: buildRepository(),
    corsOrigins: env.corsOrigins,
  });

  app.listen(env.port, () => {
    logger.info("api.listening", { port: env.port, env: env.nodeEnv });
  });
}

main().catch((err) => {
  logger.error("api.boot_failed", { message: String(err) });
  process.exitCode = 1;
});
