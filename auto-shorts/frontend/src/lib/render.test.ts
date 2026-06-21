import { describe, it, expect } from "vitest";
import {
  isDownloadable,
  isPolling,
  renderButtonLabel,
} from "./render";
import type { RenderJob } from "./types";

const job = (over: Partial<RenderJob>): RenderJob => ({
  id: "job_1",
  shortId: "short_1",
  status: "queued",
  ...over,
});

describe("isDownloadable", () => {
  it("is true only for a done job with an output url", () => {
    expect(isDownloadable(null)).toBe(false);
    expect(isDownloadable(job({ status: "rendering" }))).toBe(false);
    expect(isDownloadable(job({ status: "done" }))).toBe(false); // no url
    expect(
      isDownloadable(job({ status: "done", outputUrl: "s3://b/o.mp4" })),
    ).toBe(true);
  });
});

describe("isPolling", () => {
  it("polls while queued or rendering, not in terminal/idle states", () => {
    expect(isPolling("queued")).toBe(true);
    expect(isPolling("rendering")).toBe(true);
    expect(isPolling("idle")).toBe(false);
    expect(isPolling("done")).toBe(false);
    expect(isPolling("failed")).toBe(false);
  });
});

describe("renderButtonLabel", () => {
  it("maps each status to a label", () => {
    expect(renderButtonLabel("idle")).toBe("Render");
    expect(renderButtonLabel("queued")).toBe("Queued…");
    expect(renderButtonLabel("rendering")).toBe("Rendering…");
    expect(renderButtonLabel("done")).toBe("Download");
    expect(renderButtonLabel("failed")).toBe("Retry render");
  });
});
