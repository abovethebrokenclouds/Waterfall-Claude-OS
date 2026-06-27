// Multi-point SPATIAL AVERAGING of a transfer function.
//
// The standard REW / Smaart workflow for tuning a listening AREA (not one mic
// spot): capture the live transfer at several measurement positions and combine
// them into a single room-representative curve.
//
// The physically meaningful spatial average is a COMPLEX / VECTOR average, NOT
// a magnitude (power) average: a real listening area sums the actual pressure
// waves, so positions that disagree in phase partially CANCEL. Averaging the
// magnitudes alone would hide that cancellation and overstate the result.
//
// Per frequency point we:
//   - convert each snapshot's (magDb, phaseDeg) to a complex response
//       H_k = mag·e^{jφ},  mag = 10^(magDb/20)
//   - take the mean complex value  meanH = (1/N)·Σ H_k
//   - report  magDb = 20·log10(|meanH|)   (floored, never -Inf)
//             phaseDeg = atan2(Im, Re)     (wrapped to [-180, 180])
//   - report a SPATIAL coherence measuring agreement across positions:
//       |meanH|² / mean(|H_k|²)  ∈ [0, 1]
//     → 1 when all positions agree (vector sum == scalar sum)
//     → 0 where they cancel / disagree (vector sum collapses)
//
// Pure TypeScript, no DOM — unit-testable headless. Never returns NaN / Inf.

import { wrapPhaseDeg, type TransferPoint } from "./transfer";

/** Magnitude floor in dB so |meanH| → 0 never produces -Infinity. */
const MAG_FLOOR_DB = -120;

/** Linear magnitude from dB. */
function magFromDb(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Spatially average a set of transfer-function snapshots into one
 * room-representative curve using complex (vector) averaging.
 *
 * Snapshots are expected to share the same log-spaced frequency grid (all
 * produced by `computeTransfer` with the same fftSize / points), so they are
 * averaged index-aligned. If lengths differ, the average runs over the minimum
 * common length and keeps `freq` from the first snapshot.
 *
 * Edge cases:
 *   - `[]`            → `[]`
 *   - a single snapshot → returned as-is (already its own spatial average)
 *
 * The output is always finite: empty contributions floor to `MAG_FLOOR_DB` with
 * zero phase and zero spatial coherence.
 */
export function averageTransfers(snapshots: TransferPoint[][]): TransferPoint[] {
  if (snapshots.length === 0) return [];
  if (snapshots.length === 1) {
    // A single position IS its own spatial average — pass it through unchanged.
    return snapshots[0];
  }

  // Align over the shortest snapshot (defensive — they should all match).
  let len = Infinity;
  for (const s of snapshots) {
    if (s.length < len) len = s.length;
  }
  if (!Number.isFinite(len) || len === 0) return [];

  const n = snapshots.length;
  const out: TransferPoint[] = new Array(len);

  for (let i = 0; i < len; i++) {
    let sumRe = 0;
    let sumIm = 0;
    // Mean of |H_k|² across positions — the scalar (incoherent) power sum used
    // to normalize the spatial coherence.
    let sumPow = 0;

    for (let k = 0; k < n; k++) {
      const p = snapshots[k][i];
      const mag = magFromDb(p.magDb);
      const phi = (p.phaseDeg * Math.PI) / 180;
      const re = mag * Math.cos(phi);
      const im = mag * Math.sin(phi);
      sumRe += re;
      sumIm += im;
      sumPow += mag * mag;
    }

    const meanRe = sumRe / n;
    const meanIm = sumIm / n;
    const meanMag = Math.hypot(meanRe, meanIm);
    const meanPow = sumPow / n; // mean(|H_k|²)

    const magDbOut =
      meanMag > 0 ? Math.max(MAG_FLOOR_DB, 20 * Math.log10(meanMag)) : MAG_FLOOR_DB;
    const phaseDegOut =
      meanMag > 0 ? wrapPhaseDeg((Math.atan2(meanIm, meanRe) * 180) / Math.PI) : 0;

    // Spatial coherence: |meanH|² / mean(|H_k|²), clamped to [0, 1].
    let coh = meanPow > 0 ? (meanMag * meanMag) / meanPow : 0;
    if (!Number.isFinite(coh) || coh < 0) coh = 0;
    else if (coh > 1) coh = 1;

    out[i] = {
      freq: snapshots[0][i].freq,
      magDb: magDbOut,
      phaseDeg: phaseDegOut,
      coherence: coh,
    };
  }

  return out;
}
