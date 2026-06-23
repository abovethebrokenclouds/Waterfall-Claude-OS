// Static-trace capture/overlay model for the RTA view. Pure TypeScript, no DOM.
// A trace is a frozen snapshot of a smoothed spectrum, given a name and a colour
// drawn from the warm palette (amber / rose / violet / teal — never green).

export interface SpectrumTrace {
  id: string;
  name: string;
  /** Hex colour from the warm palette. */
  color: string;
  /** Frequencies (Hz) in ascending order. */
  freq: number[];
  /** Levels (dB) aligned to `freq`. */
  db: number[];
  visible: boolean;
}

/** Warm-palette trace colours, cycled as traces are captured (no green). */
export const TRACE_COLORS = [
  "#F6A623", // amber
  "#FF6B8A", // rose
  "#A855F7", // violet
  "#2DD4BF", // teal
  "#FFC36B", // amber-soft
  "#E5447B", // rose-deep
] as const;

/** Pick the next trace colour given how many traces already exist. */
export function nextTraceColor(count: number): string {
  return TRACE_COLORS[count % TRACE_COLORS.length];
}

let counter = 0;

/** Build a captured trace from a spectrum snapshot. */
export function captureTrace(
  snapshot: { freq: number[]; db: number[] },
  existingCount: number,
  name?: string,
): SpectrumTrace {
  counter += 1;
  const idx = existingCount + 1;
  return {
    id: `trace-${Date.now().toString(36)}-${counter}`,
    name: name && name.trim() ? name.trim() : `Trace ${idx}`,
    color: nextTraceColor(existingCount),
    freq: snapshot.freq.slice(),
    db: snapshot.db.slice(),
    visible: true,
  };
}

/** Linear interpolation of a trace's dB level at an arbitrary frequency. */
export function sampleTraceDb(trace: SpectrumTrace, freq: number): number | null {
  const { freq: fs, db } = trace;
  if (fs.length === 0) return null;
  if (freq <= fs[0]) return db[0];
  if (freq >= fs[fs.length - 1]) return db[db.length - 1];
  // Binary search for the bracketing pair.
  let lo = 0;
  let hi = fs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fs[mid] <= freq) lo = mid;
    else hi = mid;
  }
  const span = fs[hi] - fs[lo];
  if (span <= 0) return db[lo];
  const t = (freq - fs[lo]) / span;
  return db[lo] + t * (db[hi] - db[lo]);
}
