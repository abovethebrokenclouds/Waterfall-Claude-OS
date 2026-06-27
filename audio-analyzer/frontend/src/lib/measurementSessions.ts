// Saved MEASUREMENT sessions: persist a captured transfer-function measurement
// (its multi-position captures + delay + ref/meas labels) so it can be recalled
// to re-render, deleted, and exported / imported as JSON.
//
// Pure TypeScript, DOM-free and unit-testable. localStorage / download / id /
// timestamp wiring lives in the view — nothing here calls Date.now(), random,
// or touches `window`. Mirrors the `sessions.ts` serialization style.

import type { TransferPoint } from "./dsp/transfer";

export interface MeasurementSession {
  id: string;
  name: string;
  /** Epoch ms when saved. Passed in by the caller (module stays pure). */
  savedAt: number;
  refLabel?: string;
  measLabel?: string;
  delay?: { samples: number; ms: number; peak: number };
  /** The captured positions — each an array of transfer points. */
  captures: TransferPoint[][];
}

/** Append a session to the list, newest first. Returns a new array. */
export function addSession(
  list: MeasurementSession[],
  session: MeasurementSession,
): MeasurementSession[] {
  return [session, ...list];
}

/** Remove a session by id. Returns a new array. */
export function removeSession(
  list: MeasurementSession[],
  id: string,
): MeasurementSession[] {
  return list.filter((s) => s.id !== id);
}

/** Pretty-printed JSON for export. */
export function sessionsToJson(list: MeasurementSession[]): string {
  return JSON.stringify(list, null, 2);
}

/**
 * Factory for a saved measurement. `id` and `savedAt` are supplied by the
 * caller so this module performs no Date.now() / random at any scope.
 */
export function makeSession(
  input: {
    name: string;
    captures: TransferPoint[][];
    delay?: { samples: number; ms: number; peak: number };
    refLabel?: string;
    measLabel?: string;
  },
  id: string,
  savedAt: number,
): MeasurementSession {
  const session: MeasurementSession = {
    id,
    name: input.name,
    savedAt,
    // Deep copy captures so later mutation of the source can't alter the saved
    // snapshot.
    captures: input.captures.map((cap) => cap.map((p) => ({ ...p }))),
  };
  if (input.refLabel !== undefined) session.refLabel = input.refLabel;
  if (input.measLabel !== undefined) session.measLabel = input.measLabel;
  if (input.delay !== undefined) {
    session.delay = {
      samples: input.delay.samples,
      ms: input.delay.ms,
      peak: input.delay.peak,
    };
  }
  return session;
}

/** Whether a value is a finite number (rejects NaN / Infinity / non-number). */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate a single transfer point's shape and numeric fields. */
function isValidPoint(p: unknown): p is TransferPoint {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    isFiniteNumber(o.freq) &&
    isFiniteNumber(o.magDb) &&
    isFiniteNumber(o.phaseDeg) &&
    isFiniteNumber(o.coherence)
  );
}

/** Validate a captures matrix: array of arrays of valid points. */
function isValidCaptures(c: unknown): c is TransferPoint[][] {
  if (!Array.isArray(c)) return false;
  return c.every(
    (cap) => Array.isArray(cap) && cap.every((p) => isValidPoint(p)),
  );
}

/** Validate the delay sub-object if present. */
function isValidDelay(
  d: unknown,
): d is { samples: number; ms: number; peak: number } {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    isFiniteNumber(o.samples) && isFiniteNumber(o.ms) && isFiniteNumber(o.peak)
  );
}

/** Validate a single measurement session's shape. */
function isValidSession(s: unknown): s is MeasurementSession {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) return false;
  if (typeof o.name !== "string") return false;
  if (!isFiniteNumber(o.savedAt)) return false;
  if (o.refLabel !== undefined && typeof o.refLabel !== "string") return false;
  if (o.measLabel !== undefined && typeof o.measLabel !== "string")
    return false;
  if (o.delay !== undefined && !isValidDelay(o.delay)) return false;
  if (!isValidCaptures(o.captures)) return false;
  return true;
}

/**
 * Tolerant JSON parser: returns a clean list of valid sessions, dropping any
 * malformed entries. Never throws — returns [] on non-array / parse error.
 */
export function parseSessionsJson(raw: string): MeasurementSession[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: MeasurementSession[] = [];
  for (const item of parsed) {
    if (isValidSession(item)) {
      // Normalize to a canonical session object (strip unknown extra fields,
      // keep optional fields only when present).
      const s = item as MeasurementSession;
      const clean: MeasurementSession = {
        id: s.id,
        name: s.name,
        savedAt: s.savedAt,
        captures: s.captures.map((cap) =>
          cap.map((p) => ({
            freq: p.freq,
            magDb: p.magDb,
            phaseDeg: p.phaseDeg,
            coherence: p.coherence,
          })),
        ),
      };
      if (s.refLabel !== undefined) clean.refLabel = s.refLabel;
      if (s.measLabel !== undefined) clean.measLabel = s.measLabel;
      if (s.delay !== undefined) {
        clean.delay = {
          samples: s.delay.samples,
          ms: s.delay.ms,
          peak: s.delay.peak,
        };
      }
      out.push(clean);
    }
  }
  return out;
}
