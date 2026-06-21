/** Pure helpers deriving the render UI state from a job's status. */
import type { RenderJob, RenderStatus } from "./types";

export type RenderUiStatus = "idle" | RenderStatus;

/** A render is downloadable only once it's done and has an output URL. */
export function isDownloadable(job: RenderJob | null): boolean {
  return !!job && job.status === "done" && !!job.outputUrl;
}

/** Whether we should keep polling the job. */
export function isPolling(status: RenderUiStatus): boolean {
  return status === "queued" || status === "rendering";
}

/** Label for the primary render/download action button. */
export function renderButtonLabel(status: RenderUiStatus): string {
  switch (status) {
    case "queued":
      return "Queued…";
    case "rendering":
      return "Rendering…";
    case "done":
      return "Download";
    case "failed":
      return "Retry render";
    default:
      return "Render";
  }
}
