/** Typed client for the Auto-Shorts backend API. */
import type { GenerateShortsResult, ShortPlan } from "./types";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

export interface GeneratePreferences {
  numShorts?: number;
  platforms?: string[];
}

export const api = {
  generateShorts(url: string, preferences?: GeneratePreferences) {
    return post<GenerateShortsResult>("/api/generate-shorts", {
      url,
      preferences,
    });
  },

  variation(plan: ShortPlan, instruction: string) {
    return post<ShortPlan>("/api/variation", { plan, instruction });
  },

  renderShort(shortId: string) {
    return post<{ id: string; status: string }>("/api/render-short", {
      shortId,
    });
  },
};
