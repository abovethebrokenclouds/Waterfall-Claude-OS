/**
 * Render queue boundary. Production uses Redis; the in-memory implementation
 * here keeps the API runnable in dev and deterministic in tests.
 */
import { makeId } from "../agents/ids";
import type { RenderJob, VideoSpec } from "../types";

export interface RenderQueue {
  enqueue(spec: VideoSpec): Promise<RenderJob>;
  get(jobId: string): Promise<RenderJob | undefined>;
}

export class InMemoryRenderQueue implements RenderQueue {
  private jobs = new Map<string, RenderJob>();

  async enqueue(spec: VideoSpec): Promise<RenderJob> {
    const job: RenderJob = {
      id: makeId("job"),
      shortId: spec.shortId,
      spec,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async get(jobId: string): Promise<RenderJob | undefined> {
    return this.jobs.get(jobId);
  }
}
