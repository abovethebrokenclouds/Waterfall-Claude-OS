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
import {
  StandaloneIngestionService,
  WorkerIngestionService,
  type MediaIngestionService,
} from "./services/ingestion";
import {
  SampleTranscriptionService,
  WorkerTranscriptionService,
  type TranscriptionService,
} from "./services/transcription";
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

/**
 * Media + transcription wiring. With a WORKER_URL we call the Python worker;
 * without one we run "standalone" on a built-in sample transcript so the planning
 * pipeline (highlights, plans, copy) works from a single service — no worker,
 * DB, or Redis required.
 */
function buildMedia(): {
  ingestion: MediaIngestionService;
  transcription: TranscriptionService;
} {
  if (!env.workerUrl) {
    logger.warn("worker.standalone", {
      note: "WORKER_URL unset — using the built-in sample transcript; real transcription/rendering disabled",
    });
    return {
      ingestion: new StandaloneIngestionService(),
      transcription: new SampleTranscriptionService(),
    };
  }
  logger.info("worker.configured", { workerUrl: env.workerUrl });
  return {
    ingestion: new WorkerIngestionService(env.workerUrl),
    transcription: new WorkerTranscriptionService(env.workerUrl),
  };
}

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
  const media = buildMedia();
  const app = createApp({
    agent: superAgent,
    ingestion: media.ingestion,
    transcription: media.transcription,
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
