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

/**
 * A built-in sample transcript. Used in "standalone" mode (no worker configured)
 * so the planning half of the pipeline — highlights, short plans, platform copy —
 * works end to end without Whisper. Real transcription needs the worker.
 */
const SAMPLE_SEGMENTS: WhisperSegment[] = [
  { start: 0, end: 4, text: "Most people think you need a huge budget to grow on social, but that's wrong." },
  { start: 4, end: 9, text: "The single biggest lever is your first three seconds — the hook decides everything." },
  { start: 9, end: 14, text: "We tested hundreds of openings and the pattern was clear: lead with the tension." },
  { start: 14, end: 19, text: "Don't explain the topic. Show the stakes, then promise the payoff." },
  { start: 19, end: 24, text: "Here's the framework we use: hook, context, insight, and a clear call to action." },
  { start: 24, end: 30, text: "If you remember one thing, make the viewer feel the cost of scrolling away." },
  { start: 30, end: 36, text: "That's how a thirty second clip turns into thousands of new followers." },
];

/** Standalone transcription: returns the built-in sample transcript. */
export class SampleTranscriptionService implements TranscriptionService {
  async transcribe(_audioRef: string): Promise<WhisperSegment[]> {
    return SAMPLE_SEGMENTS;
  }
}
