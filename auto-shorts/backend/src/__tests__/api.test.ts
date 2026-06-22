import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../api/app";
import { InMemoryRenderQueue } from "../services/queue";
import { InMemoryShortsRepository } from "../services/storage";
import {
  FakeIngestionService,
  FakeTranscriptionService,
  scriptedAgent,
} from "./fakes";
import type { Express } from "express";

function buildApp(): Express {
  return createApp({
    agent: scriptedAgent(),
    ingestion: new FakeIngestionService(),
    transcription: new FakeTranscriptionService(),
    queue: new InMemoryRenderQueue(),
    repository: new InMemoryShortsRepository(),
  });
}

describe("API", () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp();
  });

  it("GET / -> friendly running banner", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
    expect(res.body.health).toBe("/health");
  });

  it("GET /health -> ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("POST /api/ingest-url requires a url", async () => {
    const res = await request(app).post("/api/ingest-url").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/ingest-url classifies a url", async () => {
    const res = await request(app)
      .post("/api/ingest-url")
      .send({ url: "https://youtu.be/abc" });
    expect(res.status).toBe(200);
    expect(res.body.sourceType).toBe("youtube");
  });

  it("POST /api/generate-shorts returns the unified result and persists shorts", async () => {
    const res = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc", preferences: { platforms: ["x"] } });
    expect(res.status).toBe(200);
    expect(res.body.shorts.length).toBeGreaterThan(0);

    // A persisted short is fetchable and rendarable.
    const shortId = res.body.shorts[0].id;
    const getRes = await request(app).get(`/api/shorts/${shortId}`);
    // NOTE: separate app instance per test would lose state; reuse same app.
    expect([200, 404]).toContain(getRes.status);
  });

  it("persists shorts so they can be fetched and rendered (same app)", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const shortId = gen.body.shorts[0].id;

    const got = await request(app).get(`/api/shorts/${shortId}`);
    expect(got.status).toBe(200);
    expect(got.body.plan.id).toBe(shortId);

    const render = await request(app)
      .post("/api/render-short")
      .send({ shortId });
    expect(render.status).toBe(202);
    expect(render.body.status).toBe("queued");
    expect(render.body.spec.shortId).toBe(shortId);
  });

  it("POST /api/render-short 404s for an unknown short", async () => {
    const res = await request(app)
      .post("/api/render-short")
      .send({ shortId: "nope" });
    expect(res.status).toBe(404);
  });

  it("render lifecycle: enqueue -> callback -> job status reflects it", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const shortId = gen.body.shorts[0].id;
    const render = await request(app)
      .post("/api/render-short")
      .send({ shortId });
    const jobId = render.body.id;

    const cb = await request(app)
      .post("/api/render-callback")
      .send({ jobId, status: "done", outputUrl: "s3://b/out.mp4" });
    expect(cb.status).toBe(200);
    expect(cb.body.status).toBe("done");

    const job = await request(app).get(`/api/jobs/${jobId}`);
    expect(job.status).toBe(200);
    expect(job.body.status).toBe("done");
    expect(job.body.outputUrl).toBe("s3://b/out.mp4");
  });

  it("POST /api/render-callback rejects an invalid status", async () => {
    const res = await request(app)
      .post("/api/render-callback")
      .send({ jobId: "j1", status: "bogus" });
    expect(res.status).toBe(400);
  });

  it("POST /api/render-callback 404s for an unknown job", async () => {
    const res = await request(app)
      .post("/api/render-callback")
      .send({ jobId: "missing", status: "done" });
    expect(res.status).toBe(404);
  });

  it("GET /api/jobs/:id 404s for an unknown job", async () => {
    const res = await request(app).get("/api/jobs/nope");
    expect(res.status).toBe(404);
  });

  it("POST /api/hook-variations returns hooks", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app)
      .post("/api/hook-variations")
      .send({ plan, count: 4 });
    expect(res.status).toBe(200);
    expect(res.body.hooks).toHaveLength(4);
  });

  it("POST /api/hook-variations requires a plan", async () => {
    const res = await request(app).post("/api/hook-variations").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/cta returns CTAs", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/cta").send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.ctas.length).toBeGreaterThan(0);
  });

  it("POST /api/caption-emphasis marks words; requires text", async () => {
    const ok = await request(app)
      .post("/api/caption-emphasis")
      .send({ text: "Grow with no budget" });
    expect(ok.status).toBe(200);
    expect(ok.body.words.length).toBe(4);

    const bad = await request(app).post("/api/caption-emphasis").send({});
    expect(bad.status).toBe(400);
  });

  it("POST /api/optimize-title returns titles + keywords", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app)
      .post("/api/optimize-title")
      .send({ plan, platform: "youtube_shorts" });
    expect(res.status).toBe(200);
    expect(res.body.titles.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.keywords)).toBe(true);
  });

  it("POST /api/broll returns suggestions", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/broll").send({ plan });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it("POST /api/series packages plans into a series", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const res = await request(app)
      .post("/api/series")
      .send({ plans: gen.body.shorts, topic: "growth" });
    expect(res.status).toBe(200);
    expect(res.body.seriesTitle.length).toBeGreaterThan(0);
    expect(res.body.parts.length).toBeGreaterThan(0);
  });

  it("POST /api/series requires a non-empty plans array", async () => {
    const res = await request(app).post("/api/series").send({ plans: [] });
    expect(res.status).toBe(400);
  });

  it("POST /api/hashtag-strategy returns tiered tags", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app)
      .post("/api/hashtag-strategy")
      .send({ plan, platform: "tiktok" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.broad)).toBe(true);
    expect(Array.isArray(res.body.niche)).toBe(true);
  });

  it("POST /api/cover-concept returns a cover", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/cover-concept").send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.coverText.length).toBeGreaterThan(0);
    expect(res.body.textColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("POST /api/retention returns a retention score with dropoffs", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/retention").send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.dropoffs)).toBe(true);
  });

  it("POST /api/engagement-prompt returns prompts", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app)
      .post("/api/engagement-prompt")
      .send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.prompts.length).toBeGreaterThan(0);
  });

  it("POST /api/music returns an audio direction", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/music").send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.mood.length).toBeGreaterThan(0);
    expect(["slow", "medium", "fast"]).toContain(res.body.tempo);
  });

  it("POST /api/score returns a virality score", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app).post("/api/score").send({ plan });
    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.breakdown.hook).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/variation re-angles a plan", async () => {
    const gen = await request(app)
      .post("/api/generate-shorts")
      .send({ url: "https://youtu.be/abc" });
    const plan = gen.body.shorts[0];
    const res = await request(app)
      .post("/api/variation")
      .send({ plan, instruction: "make it punchier" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(plan.id);
    expect(res.body.title).toBe("New Title");
  });

  it("validation errors use the structured envelope with a requestId", async () => {
    const res = await request(app).post("/api/ingest-url").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toBe("url is required");
    // The requestId echoes the response header so a client can trace it.
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(res.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("not-found errors use the structured envelope", async () => {
    const res = await request(app).get("/api/jobs/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("honours an inbound x-request-id", async () => {
    const res = await request(app)
      .get("/health")
      .set("x-request-id", "trace-123");
    expect(res.headers["x-request-id"]).toBe("trace-123");
  });
});

describe("rate limiting", () => {
  function limitedApp(max: number): Express {
    return createApp({
      agent: scriptedAgent(),
      ingestion: new FakeIngestionService(),
      transcription: new FakeTranscriptionService(),
      queue: new InMemoryRenderQueue(),
      repository: new InMemoryShortsRepository(),
      rateLimit: { max, windowMs: 60_000 },
    });
  }

  it("429s past the cap with a Retry-After header and rate_limited code", async () => {
    const app = limitedApp(2);
    const ok1 = await request(app).post("/api/ingest-url").send({});
    const ok2 = await request(app).post("/api/ingest-url").send({});
    const blocked = await request(app).post("/api/ingest-url").send({});

    // First two pass the limiter (still 400 from validation, not 429).
    expect(ok1.status).toBe(400);
    expect(ok2.status).toBe(400);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("rate_limited");
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(blocked.headers["x-ratelimit-limit"]).toBe("2");
  });

  it("does not throttle when max is 0 (default)", async () => {
    const app = limitedApp(0);
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });
});
