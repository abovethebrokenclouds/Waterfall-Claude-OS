/**
 * Express app factory. All dependencies are injected so the API can be
 * exercised in tests with fakes and wired with real adapters in `index.ts`.
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import {
  brollSuggestionAgent,
  captionEmphasisAgent,
  coverConceptAgent,
  ctaOptimizerAgent,
  engagementPromptAgent,
  hashtagStrategyAgent,
  hookVariationsAgent,
  musicSuggestionAgent,
  retentionScorer,
  seriesPlannerAgent,
  titleOptimizerAgent,
  urlIngestionAgent,
  variationAgent,
  viralityScorer,
} from "../agents";
import { generateShorts, type OrchestratorDeps } from "../services/orchestrator";
import type { RenderQueue } from "../services/queue";
import type { ShortsRepository } from "../services/storage";
import { logger } from "../config/logger";
import { videoTemplateBuilder } from "../agents";
import { badRequest, notFound, sendError } from "./http";
import { rateLimit, requestContext } from "./middleware";

export interface ApiDeps extends OrchestratorDeps {
  queue: RenderQueue;
  repository: ShortsRepository;
  /**
   * Allowed CORS origins. A list locks the API to those origins (e.g. the
   * Lovable app URL); `null`/omitted reflects any origin (dev/demo).
   */
  corsOrigins?: string[] | null;
  /**
   * Per-IP rate limit for /api routes. Omit or set `max: 0` to disable
   * (default in dev/test). Set a positive cap in production.
   */
  rateLimit?: { max: number; windowMs: number };
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

  // Per-request id + access logging first, so every later line and error
  // envelope can reference the same requestId.
  app.use(requestContext());

  // CORS: allow the (separately hosted) frontend to call the API. A configured
  // allowlist locks it down; otherwise any origin is reflected for dev/demo.
  const origin =
    deps.corsOrigins && deps.corsOrigins.length > 0 ? deps.corsOrigins : true;
  app.use(cors({ origin, methods: ["GET", "POST", "OPTIONS"] }));

  app.use(express.json({ limit: "1mb" }));

  // Optional abuse protection on the API surface (no-op when max is 0).
  app.use(
    "/api",
    rateLimit({
      max: deps.rateLimit?.max ?? 0,
      windowMs: deps.rateLimit?.windowMs ?? 60_000,
    }),
  );

  // Friendly root so opening the bare deploy URL confirms the API is live
  // (instead of Express's default "Cannot GET /").
  app.get("/", (_req, res) => {
    res.json({
      name: "Auto-Shorts API",
      status: "running",
      health: "/health",
      endpoints: [
        "POST /api/generate-shorts",
        "POST /api/variation",
        "POST /api/hook-variations",
        "POST /api/optimize-title",
        "POST /api/cta",
        "POST /api/caption-emphasis",
        "POST /api/hashtag-strategy",
        "POST /api/series",
        "POST /api/broll",
        "POST /api/cover-concept",
        "POST /api/score",
        "POST /api/retention",
        "POST /api/engagement-prompt",
        "POST /api/music",
        "POST /api/render-short",
        "GET /api/jobs/:id",
        "POST /api/ingest-url",
      ],
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Classify a URL only.
  app.post(
    "/api/ingest-url",
    asyncHandler(async (req, res) => {
      const { url, html } = req.body ?? {};
      if (!url || typeof url !== "string") {
        badRequest(res, "url is required");
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
        badRequest(res, "url is required");
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
        badRequest(res, "plan and instruction are required");
        return;
      }
      const updated = await variationAgent({ plan, instruction }, deps.agent);
      res.json(updated);
    }),
  );

  // A/B hook variations for one plan.
  app.post(
    "/api/hook-variations",
    asyncHandler(async (req, res) => {
      const { plan, count } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const hooks = await hookVariationsAgent({ plan, count }, deps.agent);
      res.json({ hooks });
    }),
  );

  // SEO-optimized title variants for one plan.
  app.post(
    "/api/optimize-title",
    asyncHandler(async (req, res) => {
      const { plan, platform } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const result = await titleOptimizerAgent({ plan, platform }, deps.agent);
      res.json(result);
    }),
  );

  // Optimized call-to-action variants for one plan.
  app.post(
    "/api/cta",
    asyncHandler(async (req, res) => {
      const { plan, platform, goal } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const result = await ctaOptimizerAgent({ plan, platform, goal }, deps.agent);
      res.json(result);
    }),
  );

  // Caption word-emphasis (karaoke) for a caption line.
  app.post(
    "/api/caption-emphasis",
    asyncHandler(async (req, res) => {
      const { text } = req.body ?? {};
      if (!text || typeof text !== "string") {
        badRequest(res, "text is required");
        return;
      }
      const result = await captionEmphasisAgent({ text }, deps.agent);
      res.json(result);
    }),
  );

  // Package a set of plans into a numbered series.
  app.post(
    "/api/series",
    asyncHandler(async (req, res) => {
      const { plans, topic } = req.body ?? {};
      if (!Array.isArray(plans) || plans.length === 0) {
        badRequest(res, "plans (non-empty array) is required");
        return;
      }
      const series = await seriesPlannerAgent({ plans, topic }, deps.agent);
      res.json(series);
    }),
  );

  // B-roll suggestions for one plan.
  app.post(
    "/api/broll",
    asyncHandler(async (req, res) => {
      const { plan, transcriptExcerpt, count } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const suggestions = await brollSuggestionAgent(
        { plan, transcriptExcerpt, count },
        deps.agent,
      );
      res.json({ suggestions });
    }),
  );

  // Tiered hashtag strategy for one plan.
  app.post(
    "/api/hashtag-strategy",
    asyncHandler(async (req, res) => {
      const { plan, platform } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const strategy = await hashtagStrategyAgent({ plan, platform }, deps.agent);
      res.json(strategy);
    }),
  );

  // Cover / thumbnail concept for one plan.
  app.post(
    "/api/cover-concept",
    asyncHandler(async (req, res) => {
      const { plan, brandColor } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const concept = await coverConceptAgent({ plan, brandColor }, deps.agent);
      res.json(concept);
    }),
  );

  // Virality score for one plan.
  app.post(
    "/api/score",
    asyncHandler(async (req, res) => {
      const { plan, transcriptExcerpt } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const score = await viralityScorer({ plan, transcriptExcerpt }, deps.agent);
      res.json(score);
    }),
  );

  // Predicted retention curve + drop-off fixes for one plan.
  app.post(
    "/api/retention",
    asyncHandler(async (req, res) => {
      const { plan, transcriptExcerpt } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const result = await retentionScorer({ plan, transcriptExcerpt }, deps.agent);
      res.json(result);
    }),
  );

  // Comment-driving engagement prompts for one plan.
  app.post(
    "/api/engagement-prompt",
    asyncHandler(async (req, res) => {
      const { plan, platform } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const result = await engagementPromptAgent({ plan, platform }, deps.agent);
      res.json(result);
    }),
  );

  // Music / audio direction for one plan.
  app.post(
    "/api/music",
    asyncHandler(async (req, res) => {
      const { plan } = req.body ?? {};
      if (!plan) {
        badRequest(res, "plan is required");
        return;
      }
      const result = await musicSuggestionAgent({ plan }, deps.agent);
      res.json(result);
    }),
  );

  // Enqueue a render for one stored short.
  app.post(
    "/api/render-short",
    asyncHandler(async (req, res) => {
      const { shortId } = req.body ?? {};
      if (!shortId || typeof shortId !== "string") {
        badRequest(res, "shortId is required");
        return;
      }
      const stored = await deps.repository.getShort(shortId);
      if (!stored) {
        notFound(res, "short not found");
        return;
      }
      const spec =
        stored.spec ?? videoTemplateBuilder({ plan: stored.plan });
      const job = await deps.queue.enqueue(spec);
      res.status(202).json(job);
    }),
  );

  // Fetch a render job's status.
  app.get(
    "/api/jobs/:id",
    asyncHandler(async (req, res) => {
      const job = await deps.queue.get(String(req.params.id));
      if (!job) {
        notFound(res, "job not found");
        return;
      }
      res.json(job);
    }),
  );

  // Worker callback: report a render's outcome.
  app.post(
    "/api/render-callback",
    asyncHandler(async (req, res) => {
      const { jobId, status, outputUrl, error } = req.body ?? {};
      const allowed = ["queued", "rendering", "done", "failed"];
      if (!jobId || typeof jobId !== "string" || !allowed.includes(status)) {
        badRequest(res, "jobId and a valid status are required");
        return;
      }
      const updated = await deps.queue.updateStatus(jobId, status, {
        outputUrl,
        error,
      });
      if (!updated) {
        notFound(res, "job not found");
        return;
      }
      res.json(updated);
    }),
  );

  // Fetch a stored short.
  app.get(
    "/api/shorts/:id",
    asyncHandler(async (req, res) => {
      const stored = await deps.repository.getShort(String(req.params.id));
      if (!stored) {
        notFound(res, "short not found");
        return;
      }
      res.json(stored);
    }),
  );

  // Centralised error handler — same envelope as validation errors, with the
  // requestId so a client failure traces to a server log line.
  app.use(
    (err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error("api.error", { requestId: req.requestId, message: err.message });
      sendError(res, 500, "internal_error", err.message);
    },
  );

  return app;
}
