/**
 * Production wiring + server entry. Constructs the real adapters and the
 * Super Agent, then starts the HTTP API.
 */
import { createApp } from "./api/app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { superAgent } from "./config/superAgent";
import { WorkerIngestionService } from "./services/ingestion";
import { WorkerTranscriptionService } from "./services/transcription";
import { InMemoryRenderQueue } from "./services/queue";
import { InMemoryShortsRepository } from "./services/storage";

const workerEndpoint = process.env.WORKER_URL ?? "http://localhost:5001";

const app = createApp({
  agent: superAgent,
  ingestion: new WorkerIngestionService(workerEndpoint),
  transcription: new WorkerTranscriptionService(workerEndpoint),
  queue: new InMemoryRenderQueue(),
  repository: new InMemoryShortsRepository(),
});

app.listen(env.port, () => {
  logger.info("api.listening", { port: env.port, env: env.nodeEnv });
});
