/**
 * Agent 2 — Transcript Cleaner & Aligner.
 *
 * Pure, deterministic. Takes raw Whisper segments and produces cleaned,
 * time-aligned caption chunks: trims whitespace, drops empties, and merges
 * fragments that are too short to read into ~readable chunks.
 */
import type { CaptionChunk, Transcript, WhisperSegment } from "../types";

export interface TranscriptCleanerOptions {
  language?: string;
  /** Minimum on-screen duration for a chunk before merging with the next. */
  minChunkSec?: number;
  /** Maximum characters per chunk before forcing a split boundary. */
  maxChars?: number;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function transcriptCleaner(
  segments: WhisperSegment[],
  options: TranscriptCleanerOptions = {},
): Transcript {
  const minChunkSec = options.minChunkSec ?? 1.2;
  const maxChars = options.maxChars ?? 90;

  const cleaned = segments
    .map((s) => ({ ...s, text: normalize(s.text) }))
    .filter((s) => s.text.length > 0 && s.end > s.start);

  const chunks: CaptionChunk[] = [];
  let buffer: { start: number; end: number; text: string } | null = null;

  const flush = () => {
    if (buffer) {
      chunks.push({ index: chunks.length, ...buffer });
      buffer = null;
    }
  };

  for (const seg of cleaned) {
    if (!buffer) {
      buffer = { start: seg.start, end: seg.end, text: seg.text };
      continue;
    }
    const merged = `${buffer.text} ${seg.text}`;
    const tooShort = buffer.end - buffer.start < minChunkSec;
    if (tooShort && merged.length <= maxChars) {
      buffer.end = seg.end;
      buffer.text = merged;
    } else {
      flush();
      buffer = { start: seg.start, end: seg.end, text: seg.text };
    }
  }
  flush();

  const durationSec = cleaned.length
    ? cleaned[cleaned.length - 1].end
    : 0;

  return {
    language: options.language ?? "en",
    durationSec,
    fullText: chunks.map((c) => c.text).join(" "),
    chunks,
  };
}
