// Microphone SPL calibration — pure, DOM-free model + store helpers.
//
// The analyzer measures a signal in dBFS (dB relative to full scale). To report
// a trustworthy ABSOLUTE sound-pressure level we need one number per input
// device: the dB SPL that corresponds to 0 dBFS RMS. That is exactly the
// `calibrationOffset` the SPL DSP already consumes:
//
//     dBSPL = 20·log10(rms) + offsetDb            (see lib/dsp/spl.ts)
//
// Two ways to obtain it:
//   1. Reference capture — put a known level on the mic (an acoustic calibrator
//      at 94 dB @ 1 kHz, or an SPL meter reading next to it), read the live
//      dBFS, and solve  offset = referenceSpl − measuredDbfs.
//   2. Manual entry — an advanced user types a known offset directly.
//
// Calibration is stored PER DEVICE (keyed by MediaDeviceInfo.deviceId) so
// switching between the built-in mic and a calibrated measurement mic recalls
// the right offset. This module is clock-free (the caller injects `calibratedAt`)
// and never throws on parse, so it is trivially unit-testable.

export interface MicCalibration {
  /** MediaDeviceInfo.deviceId, or "default" for the unnamed default input. */
  deviceId: string;
  /** dB SPL that corresponds to 0 dBFS RMS. */
  offsetDb: number;
  /** Device label captured at calibration time (for display). */
  label?: string;
  /** The reference SPL used for a reference-capture calibration (for display). */
  referenceSpl?: number;
  /** Epoch ms — INJECTED by the caller so this module stays clock-free. */
  calibratedAt: number;
}

/** Uncalibrated fallback offset (dBFS→dB SPL). Matches the prior SPL demo value. */
export const DEFAULT_CAL_OFFSET = 100;

/** Sane bounds for a calibration offset, in dB. */
export const MIN_OFFSET_DB = 0;
export const MAX_OFFSET_DB = 160;

/** localStorage key for the per-device calibration table. */
export const CALIBRATION_STORAGE_KEY = "rtai.micCalibration.v1";

/** Clamp an offset into the sane range; non-finite → DEFAULT_CAL_OFFSET. */
export function clampOffset(db: number): number {
  if (!Number.isFinite(db)) return DEFAULT_CAL_OFFSET;
  return Math.min(MAX_OFFSET_DB, Math.max(MIN_OFFSET_DB, db));
}

/**
 * Normalize a deviceId into a stable storage key. The default/unnamed input
 * reports "" (or null) before permission is granted; collapse those to
 * "default" so the calibration still round-trips.
 */
export function keyForDevice(deviceId: string | null | undefined): string {
  return deviceId && deviceId.length > 0 ? deviceId : "default";
}

/**
 * Offset implied by a reference-level capture.
 *   dBSPL = dBFS + offset  ⇒  offset = referenceSpl − measuredDbfs
 * `measuredDbfs` is 20·log10(rms) (a negative number for any real level).
 * Result is clamped to the sane range.
 */
export function offsetFromReference(measuredDbfs: number, referenceSpl: number): number {
  if (!Number.isFinite(measuredDbfs) || !Number.isFinite(referenceSpl)) {
    return DEFAULT_CAL_OFFSET;
  }
  return clampOffset(referenceSpl - measuredDbfs);
}

/** Find the calibration for a device, or null. */
export function findCalibration(
  list: readonly MicCalibration[],
  deviceId: string | null | undefined,
): MicCalibration | null {
  const key = keyForDevice(deviceId);
  return list.find((c) => c.deviceId === key) ?? null;
}

/** Resolve the offset for a device, falling back to the uncalibrated default. */
export function offsetForDevice(
  list: readonly MicCalibration[],
  deviceId: string | null | undefined,
): number {
  const cal = findCalibration(list, deviceId);
  return cal ? clampOffset(cal.offsetDb) : DEFAULT_CAL_OFFSET;
}

/**
 * Insert or replace the calibration for its device (immutable). The offset is
 * clamped and the deviceId normalized before storing.
 */
export function upsertCalibration(
  list: readonly MicCalibration[],
  cal: MicCalibration,
): MicCalibration[] {
  const normalized: MicCalibration = {
    ...cal,
    deviceId: keyForDevice(cal.deviceId),
    offsetDb: clampOffset(cal.offsetDb),
  };
  const rest = list.filter((c) => c.deviceId !== normalized.deviceId);
  return [...rest, normalized];
}

/** Remove a device's calibration (immutable). */
export function removeCalibration(
  list: readonly MicCalibration[],
  deviceId: string | null | undefined,
): MicCalibration[] {
  const key = keyForDevice(deviceId);
  return list.filter((c) => c.deviceId !== key);
}

/** Serialize the calibration table to JSON. */
export function calibrationsToJson(list: readonly MicCalibration[]): string {
  return JSON.stringify(list);
}

/**
 * Parse a stored calibration table. NEVER throws: malformed JSON → [], and any
 * entry missing a string deviceId or a finite offset is dropped. Offsets are
 * clamped; non-finite optional fields are dropped.
 */
export function parseCalibrationsJson(json: string | null | undefined): MicCalibration[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: MicCalibration[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.deviceId !== "string" || rec.deviceId.length === 0) continue;
    if (typeof rec.offsetDb !== "number" || !Number.isFinite(rec.offsetDb)) continue;
    if (seen.has(rec.deviceId)) continue; // first wins; ignore duplicates

    const cal: MicCalibration = {
      deviceId: rec.deviceId,
      offsetDb: clampOffset(rec.offsetDb),
      calibratedAt:
        typeof rec.calibratedAt === "number" && Number.isFinite(rec.calibratedAt)
          ? rec.calibratedAt
          : 0,
    };
    if (typeof rec.label === "string") cal.label = rec.label;
    if (typeof rec.referenceSpl === "number" && Number.isFinite(rec.referenceSpl)) {
      cal.referenceSpl = rec.referenceSpl;
    }
    out.push(cal);
    seen.add(rec.deviceId);
  }
  return out;
}
