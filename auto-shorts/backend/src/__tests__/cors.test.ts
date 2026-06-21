import { describe, it, expect } from "vitest";
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

function buildApp(corsOrigins?: string[] | null): Express {
  return createApp({
    agent: scriptedAgent(),
    ingestion: new FakeIngestionService(),
    transcription: new FakeTranscriptionService(),
    queue: new InMemoryRenderQueue(),
    repository: new InMemoryShortsRepository(),
    corsOrigins,
  });
}

describe("CORS", () => {
  it("reflects any origin when no allowlist is configured", async () => {
    const res = await request(buildApp())
      .get("/health")
      .set("Origin", "https://anything.lovable.app");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://anything.lovable.app",
    );
  });

  it("allows a configured origin", async () => {
    const app = buildApp(["https://my-app.lovable.app"]);
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://my-app.lovable.app");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://my-app.lovable.app",
    );
  });

  it("does not echo a disallowed origin", async () => {
    const app = buildApp(["https://my-app.lovable.app"]);
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).not.toBe(
      "https://evil.example.com",
    );
  });

  it("answers a preflight OPTIONS request", async () => {
    const res = await request(buildApp())
      .options("/api/generate-shorts")
      .set("Origin", "https://my-app.lovable.app")
      .set("Access-Control-Request-Method", "POST");
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });
});
