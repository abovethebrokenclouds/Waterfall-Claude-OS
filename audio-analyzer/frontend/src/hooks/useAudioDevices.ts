import { useCallback, useEffect, useRef, useState } from "react";

export type ChannelRouting = "mono" | "left" | "right";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface AudioEngine {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stream: MediaStream;
  sampleRate: number;
}

export type PermissionState =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unsupported";

interface UseAudioDevices {
  supported: boolean;
  permission: PermissionState;
  devices: AudioInputDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string) => void;
  sampleRate: number;
  setSampleRate: (rate: number) => void;
  routing: ChannelRouting;
  setRouting: (r: ChannelRouting) => void;
  engine: AudioEngine | null;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

const FALLBACK_RATE = 48000;

/**
 * Web Audio / MediaDevices integration for input capture.
 *
 * Every browser global (window, navigator, AudioContext) is guarded so that
 * server-side rendering and `tsc --noEmit` never touch them. getUserMedia is
 * requested with autoGainControl / echoCancellation / noiseSuppression all
 * DISABLED, because those processors corrupt measurement accuracy.
 */
export function useAudioDevices(): UseAudioDevices {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(FALLBACK_RATE);
  const [routing, setRouting] = useState<ChannelRouting>("mono");
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setSupported(false);
      setPermission("unsupported");
      return;
    }
    setSupported(true);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Input ${i + 1}`,
        }));
      setDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(inputs[0].deviceId);
      }
    } catch {
      // Enumeration can fail before permission; ignore quietly.
    }
  }, [selectedDeviceId]);

  const stop = useCallback(() => {
    const e = engineRef.current;
    if (e) {
      e.stream.getTracks().forEach((t) => t.stop());
      void e.ctx.close();
      engineRef.current = null;
      setEngine(null);
    }
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      !AudioCtor
    ) {
      setPermission("unsupported");
      setError("Audio capture is not supported in this browser.");
      return;
    }

    setPermission("requesting");
    setError(null);
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          // Measurement-critical: disable all "helpful" processing.
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
        video: false,
      });

      const ctx = new AudioCtor();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;

      // Channel routing via a splitter for L/R; mono just sums to the analyser.
      if (routing === "mono") {
        source.connect(analyser);
      } else {
        const splitter = ctx.createChannelSplitter(2);
        source.connect(splitter);
        splitter.connect(analyser, routing === "left" ? 0 : 1);
      }

      const newEngine: AudioEngine = {
        ctx,
        analyser,
        stream,
        sampleRate: ctx.sampleRate,
      };
      engineRef.current = newEngine;
      setEngine(newEngine);
      setSampleRate(ctx.sampleRate);
      setPermission("granted");
      await refreshDevices();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        setError("Grant microphone access to start measuring.");
      } else {
        setPermission("denied");
        setError(
          err instanceof Error ? err.message : "Could not access the microphone.",
        );
      }
    }
  }, [selectedDeviceId, routing, refreshDevices, stop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const e = engineRef.current;
      if (e) {
        e.stream.getTracks().forEach((t) => t.stop());
        void e.ctx.close();
      }
    };
  }, []);

  return {
    supported,
    permission,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    sampleRate,
    setSampleRate,
    routing,
    setRouting,
    engine,
    start,
    stop,
    error,
  };
}
