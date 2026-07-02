import { useCallback, useEffect, useMemo, useState } from "react";
import { useAudioDevices } from "./useAudioDevices";
import {
  CALIBRATION_STORAGE_KEY,
  DEFAULT_CAL_OFFSET,
  calibrationsToJson,
  findCalibration,
  offsetForDevice,
  offsetFromReference,
  parseCalibrationsJson,
  removeCalibration,
  upsertCalibration,
  type MicCalibration,
} from "../lib/calibration";

/**
 * App-wide audio + settings state. Wraps useAudioDevices and adds:
 *  - Performance Mode (smaller FFT, no glow) shared across all tabs.
 *  - Per-device microphone SPL calibration (the dBFS→dB SPL offset), persisted
 *    to localStorage and resolved for the currently-selected input so every
 *    measurement view reports the same trustworthy absolute level.
 */
export function useAudioState() {
  const devices = useAudioDevices();
  const [performanceMode, setPerformanceMode] = useState(false);

  const { selectedDeviceId } = devices;
  const [calibrations, setCalibrations] = useState<MicCalibration[]>([]);

  // Load persisted calibrations once (SSR-guarded; localStorage may be absent).
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      setCalibrations(
        parseCalibrationsJson(window.localStorage.getItem(CALIBRATION_STORAGE_KEY)),
      );
    } catch {
      // corrupt / unavailable storage — start empty
    }
  }, []);

  const persist = useCallback((next: MicCalibration[]) => {
    setCalibrations(next);
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(CALIBRATION_STORAGE_KEY, calibrationsToJson(next));
    } catch {
      // ignore quota / unavailable storage
    }
  }, []);

  /** Calibrate the current device from a live reading + a known reference SPL. */
  const calibrateFromReference = useCallback(
    (measuredDbfs: number, referenceSpl: number) => {
      const offsetDb = offsetFromReference(measuredDbfs, referenceSpl);
      persist(
        upsertCalibration(calibrations, {
          deviceId: selectedDeviceId ?? "",
          offsetDb,
          referenceSpl,
          label: devices.devices.find((d) => d.deviceId === selectedDeviceId)?.label,
          calibratedAt: Date.now(),
        }),
      );
    },
    [calibrations, persist, selectedDeviceId, devices.devices],
  );

  /** Set the current device's offset directly (advanced / known-sensitivity). */
  const setManualOffset = useCallback(
    (offsetDb: number) => {
      persist(
        upsertCalibration(calibrations, {
          deviceId: selectedDeviceId ?? "",
          offsetDb,
          label: devices.devices.find((d) => d.deviceId === selectedDeviceId)?.label,
          calibratedAt: Date.now(),
        }),
      );
    },
    [calibrations, persist, selectedDeviceId, devices.devices],
  );

  /** Clear the current device's calibration (revert to the uncalibrated default). */
  const clearCalibration = useCallback(() => {
    persist(removeCalibration(calibrations, selectedDeviceId));
  }, [calibrations, persist, selectedDeviceId]);

  const activeCalibration = useMemo(
    () => findCalibration(calibrations, selectedDeviceId),
    [calibrations, selectedDeviceId],
  );
  const calibrationOffset = useMemo(
    () => offsetForDevice(calibrations, selectedDeviceId),
    [calibrations, selectedDeviceId],
  );

  return {
    ...devices,
    performanceMode,
    setPerformanceMode,
    // Calibration
    calibrations,
    activeCalibration,
    calibrationOffset,
    isCalibrated: activeCalibration !== null,
    defaultCalibrationOffset: DEFAULT_CAL_OFFSET,
    calibrateFromReference,
    setManualOffset,
    clearCalibration,
  };
}

export type UseAudioState = ReturnType<typeof useAudioState>;
