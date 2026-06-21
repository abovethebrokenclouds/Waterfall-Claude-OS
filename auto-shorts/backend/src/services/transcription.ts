/**
 * Transcription service boundary. The orchestrator depends on this interface so
 * Whisper can be swapped for a hosted API or a fake in tests. The concrete
 * Whisper implementation runs in the Python render-worker; here we model the
 * boundary and provide an HTTP-backed adapter placeholder.
 */
import type { WhisperSegment } from "../types";

export interface TranscriptionService {
  transcribe(audioRef: string): Promise<WhisperSegment[]>;
}

/**
 * Adapter that delegates to the Python worker's transcription endpoint.
 * Wired in production; unit tests inject a fake instead.
 */
export class WorkerTranscriptionService implements TranscriptionService {
  constructor(private readonly endpoint: string) {}

  async transcribe(audioRef: string): Promise<WhisperSegment[]> {
    const res = await fetch(`${this.endpoint}/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioRef }),
    });
    if (!res.ok) {
      throw new Error(`Transcription failed: ${res.status}`);
    }
    const data = (await res.json()) as { segments: WhisperSegment[] };
    return data.segments;
  }
}
