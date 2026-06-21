/**
 * Render queue boundary. Production uses Redis; the in-memory implementation
 * here keeps the API runnable in dev and deterministic in tests.
 */
import { makeId } from "../agents/ids";
import type { RenderJob, RenderStatus, VideoSpec } from "../types";

export interface RenderStatusUpdate {
  outputUrl?: string;
  error?: string;
}

export interface RenderQueue {
  enqueue(spec: VideoSpec): Promise<RenderJob>;
  get(jobId: string): Promise<RenderJob | undefined>;
  /** Record a status transition reported by the worker. */
  updateStatus(
    jobId: string,
    status: RenderStatus,
    fields?: RenderStatusUpdate,
  ): Promise<RenderJob | undefined>;
}

/** Apply a status transition to a job, dropping undefined fields. */
function withStatus(
  job: RenderJob,
  status: RenderStatus,
  fields: RenderStatusUpdate = {},
): RenderJob {
  return {
    ...job,
    status,
    ...(fields.outputUrl !== undefined ? { outputUrl: fields.outputUrl } : {}),
    ...(fields.error !== undefined ? { error: fields.error } : {}),
  };
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

  async updateStatus(
    jobId: string,
    status: RenderStatus,
    fields?: RenderStatusUpdate,
  ): Promise<RenderJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const updated = withStatus(job, status, fields);
    this.jobs.set(jobId, updated);
    return updated;
  }
}

/* -------------------------------------------------------------------------- */
/* Redis-backed queue                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The minimal Redis surface the queue needs — satisfied by a `redis` v4 client.
 * A job's JSON is stored in a hash (for `get`) and its id pushed onto a work
 * list the Python worker pops from. Kept as a local interface so this module is
 * testable with an in-memory fake and has no hard driver dependency.
 */
export interface RedisLike {
  rPush(key: string, value: string): Promise<number>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | null | undefined>;
}

export interface RedisQueueOptions {
  /** Work list the worker blocking-pops job ids from. */
  queueKey?: string;
  /** Hash holding each job's JSON by id. */
  jobsKey?: string;
}

export class RedisRenderQueue implements RenderQueue {
  private readonly queueKey: string;
  private readonly jobsKey: string;

  constructor(
    private readonly redis: RedisLike,
    options: RedisQueueOptions = {},
  ) {
    this.queueKey = options.queueKey ?? "auto-shorts:renders";
    this.jobsKey = options.jobsKey ?? "auto-shorts:jobs";
  }

  async enqueue(spec: VideoSpec): Promise<RenderJob> {
    const job: RenderJob = {
      id: makeId("job"),
      shortId: spec.shortId,
      spec,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    await this.redis.hSet(this.jobsKey, job.id, JSON.stringify(job));
    await this.redis.rPush(this.queueKey, job.id);
    return job;
  }

  async get(jobId: string): Promise<RenderJob | undefined> {
    const raw = await this.redis.hGet(this.jobsKey, jobId);
    return raw ? (JSON.parse(raw) as RenderJob) : undefined;
  }

  async updateStatus(
    jobId: string,
    status: RenderStatus,
    fields?: RenderStatusUpdate,
  ): Promise<RenderJob | undefined> {
    const job = await this.get(jobId);
    if (!job) return undefined;
    const updated = withStatus(job, status, fields);
    await this.redis.hSet(this.jobsKey, jobId, JSON.stringify(updated));
    return updated;
  }
}
