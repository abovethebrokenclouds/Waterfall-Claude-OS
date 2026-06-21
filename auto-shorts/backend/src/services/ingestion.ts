/**
 * Media ingestion service boundary. Downloads source media and extracts an
 * audio reference the transcription service can consume. The concrete impl uses
 * yt-dlp / ffmpeg in the worker; tests inject a fake.
 */
import type { IngestionResult } from "../types";

export interface MediaRef {
  /** Opaque reference (path, URL, or object key) to extracted audio. */
  audioRef: string;
  /** Object key/URL for the original media, if retained. */
  sourceRef?: string;
}

export interface MediaIngestionService {
  fetchAudio(ingestion: IngestionResult): Promise<MediaRef>;
}

/** Delegates download + audio extraction to the Python worker. */
export class WorkerIngestionService implements MediaIngestionService {
  constructor(private readonly endpoint: string) {}

  async fetchAudio(ingestion: IngestionResult): Promise<MediaRef> {
    const res = await fetch(`${this.endpoint}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ingestion),
    });
    if (!res.ok) {
      throw new Error(`Ingestion failed: ${res.status}`);
    }
    return (await res.json()) as MediaRef;
  }
}
