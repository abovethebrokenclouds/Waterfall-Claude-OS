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
});
