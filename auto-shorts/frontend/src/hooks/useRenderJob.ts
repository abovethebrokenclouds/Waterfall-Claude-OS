import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { isPolling, type RenderUiStatus } from "../lib/render";
import type { RenderJob } from "../lib/types";

/**
 * Kicks off a render for a short and polls the job until it's done or failed.
 * Returns the live job, a coarse status, and a `start` trigger.
 */
export function useRenderJob(shortId: string) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<RenderUiStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setStatus("queued");
    try {
      const created = await api.renderShort(shortId);
      setJob(created);
      setJobId(created.id);
      setStatus(created.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed to start");
      setStatus("failed");
    }
  }, [shortId]);

  useEffect(() => {
    if (!jobId || !isPolling(status)) return;
    let active = true;
    const tick = async () => {
      try {
        const latest = await api.getJob(jobId);
        if (!active) return;
        setJob(latest);
        setStatus(latest.status);
      } catch {
        /* transient error — keep polling */
      }
    };
    const handle = setInterval(tick, 2000);
    return () => {
      active = false;
      clearInterval(handle);
    };
  }, [jobId, status]);

  return { job, status, error, start };
}
