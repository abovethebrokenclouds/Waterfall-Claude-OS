/**
 * Express app factory. All dependencies are injected so the API can be
 * exercised in tests with fakes and wired with real adapters in `index.ts`.
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { urlIngestionAgent, variationAgent } from "../agents";
import { generateShorts, type OrchestratorDeps } from "../services/orchestrator";
import type { RenderQueue } from "../services/queue";
import type { ShortsRepository } from "../services/storage";
import { logger } from "../config/logger";
import { videoTemplateBuilder } from "../agents";

export interface ApiDeps extends OrchestratorDeps {
  queue: RenderQueue;
  repository: ShortsRepository;
}

/** Wrap an async handler so rejections reach the error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function createApp(deps: ApiDeps): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Classify a URL only.
  app.post(
    "/api/ingest-url",
    asyncHandler(async (req, res) => {
      const { url, html } = req.body ?? {};
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "url is required" });
        return;
      }
      const result = await urlIngestionAgent({ url, html }, deps.agent);
      res.json(result);
    }),
  );

  // Master Orchestrator: URL -> full shorts JSON.
  app.post(
    "/api/generate-shorts",
    asyncHandler(async (req, res) => {
      const { url, html, preferences } = req.body ?? {};
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "url is required" });
        return;
      }
      const result = await generateShorts({ url, html, preferences }, deps);
      await deps.repository.saveResult(result);
      res.json(result);
    }),
  );

  // Re-angle a single plan with the Variation Agent.
  app.post(
    "/api/variation",
    asyncHandler(async (req, res) => {
      const { plan, instruction } = req.body ?? {};
      if (!plan || !instruction) {
        res.status(400).json({ error: "plan and instruction are required" });
        return;
      }
      const updated = await variationAgent({ plan, instruction }, deps.agent);
      res.json(updated);
    }),
  );

  // Enqueue a render for one stored short.
  app.post(
    "/api/render-short",
    asyncHandler(async (req, res) => {
      const { shortId } = req.body ?? {};
      if (!shortId || typeof shortId !== "string") {
        res.status(400).json({ error: "shortId is required" });
        return;
      }
      const stored = await deps.repository.getShort(shortId);
      if (!stored) {
        res.status(404).json({ error: "short not found" });
        return;
      }
      const spec =
        stored.spec ?? videoTemplateBuilder({ plan: stored.plan });
      const job = await deps.queue.enqueue(spec);
      res.status(202).json(job);
    }),
  );

  // Fetch a stored short.
  app.get(
    "/api/shorts/:id",
    asyncHandler(async (req, res) => {
      const stored = await deps.repository.getShort(String(req.params.id));
      if (!stored) {
        res.status(404).json({ error: "short not found" });
        return;
      }
      res.json(stored);
    }),
  );

  // Centralised error handler.
  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error("api.error", { message: err.message });
      res.status(500).json({ error: "internal_error", message: err.message });
    },
  );

  return app;
}
