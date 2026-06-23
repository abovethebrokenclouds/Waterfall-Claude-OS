import { useCallback, useEffect, useRef, useState } from "react";
import { makePinkFilter } from "../lib/dsp/noise";

export type SignalType = "pink" | "white" | "sine" | "sweep";

export interface UseSignalGenerator {
  supported: boolean;
  playing: boolean;
  type: SignalType;
  setType: (t: SignalType) => void;
  /** Sine frequency in Hz (used by the "sine" type). */
  frequency: number;
  setFrequency: (f: number) => void;
  /** Output level 0..1. */
  level: number;
  setLevel: (l: number) => void;
  start: () => void;
  stop: () => void;
}

const SWEEP_SECONDS = 4;

/**
 * Web Audio test-signal source: pink / white noise, sine, and a log sweep.
 * Every browser global (window, AudioContext, AudioBuffer) is guarded behind
 * typeof checks and a useEffect, so SSR and `tsc --noEmit` never touch them.
 */
export function useSignalGenerator(): UseSignalGenerator {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [type, setType] = useState<SignalType>("pink");
  const [frequency, setFrequency] = useState(1000);
  const [level, setLevel] = useState(0.3);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nodeRef = useRef<AudioNode | null>(null);

  const typeRef = useRef(type);
  const freqRef = useRef(frequency);
  const levelRef = useRef(level);
  typeRef.current = type;
  freqRef.current = frequency;
  levelRef.current = level;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    setSupported(!!Ctor);
  }, []);

  const stop = useCallback(() => {
    const node = nodeRef.current;
    if (node) {
      try {
        (node as OscillatorNode | AudioBufferSourceNode).stop?.();
      } catch {
        // already stopped
      }
      node.disconnect();
      nodeRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
    const ctx = ctxRef.current;
    if (ctx) {
      void ctx.close();
      ctxRef.current = null;
    }
    setPlaying(false);
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    stop();

    const ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    ctxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = levelRef.current;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    const sr = ctx.sampleRate;
    const t = typeRef.current;

    if (t === "sine") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqRef.current;
      osc.connect(gain);
      osc.start();
      nodeRef.current = osc;
    } else if (t === "sweep") {
      const dur = SWEEP_SECONDS;
      const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const ch = buf.getChannelData(0);
      const f0 = 20;
      const f1 = 20000;
      const k = Math.log(f1 / f0);
      for (let i = 0; i < ch.length; i++) {
        const tt = i / sr;
        const phase =
          ((2 * Math.PI * f0 * dur) / k) * (Math.exp((tt / dur) * k) - 1);
        ch[i] = Math.sin(phase) * 0.9;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
      nodeRef.current = src;
    } else {
      // pink / white noise — a looping 2-second buffer.
      const len = Math.floor(sr * 2);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      if (t === "white") {
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      } else {
        const filt = makePinkFilter();
        for (let i = 0; i < len; i++) filt(Math.random() * 2 - 1); // warm-up
        for (let i = 0; i < len; i++) ch[i] = filt(Math.random() * 2 - 1);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
      nodeRef.current = src;
    }

    setPlaying(true);
  }, [stop]);

  // Live updates while playing.
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = level;
  }, [level]);

  useEffect(() => {
    const node = nodeRef.current;
    if (node && type === "sine" && "frequency" in node) {
      (node as OscillatorNode).frequency.value = frequency;
    }
  }, [frequency, type]);

  // Restart when the signal type changes mid-play (different node graph).
  useEffect(() => {
    if (playing) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    playing,
    type,
    setType,
    frequency,
    setFrequency,
    level,
    setLevel,
    start,
    stop,
  };
}
