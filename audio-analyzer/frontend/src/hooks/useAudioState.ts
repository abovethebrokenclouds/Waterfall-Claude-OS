import { useState } from "react";
import { useAudioDevices } from "./useAudioDevices";

/**
 * App-wide audio + settings state. Wraps useAudioDevices and adds the
 * Performance Mode toggle (smaller FFT, no glow) shared across all tabs.
 */
export function useAudioState() {
  const devices = useAudioDevices();
  const [performanceMode, setPerformanceMode] = useState(false);

  return {
    ...devices,
    performanceMode,
    setPerformanceMode,
  };
}

export type UseAudioState = ReturnType<typeof useAudioState>;
