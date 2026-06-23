import { useEffect, useRef, useState } from "react";
import type { UseAudioState } from "../hooks/useAudioState";
import {
  octaveSmooth,
  binToFrequency,
  OCTAVE_FRACTIONS,
  REFERENCE_CURVES,
  sampleReference,
} from "../lib/dsp";

type RtaMode = "live" | "peak" | "average";

/** A sparse smoothed spectrum reported upward for the insights engine. */
export interface SpectrumSnapshot {
  freq: number[];
  db: number[];
}

interface RtaViewProps {
  audio: UseAudioState;
  /** Throttled smoothed-spectrum callback for the insights engine. */
  onSpectrum?: (snapshot: SpectrumSnapshot) => void;
}

const REFERENCE_OFF = "off";

const MIN_DB = -100;
const MAX_DB = -10;
const F_MIN = 20;
const F_MAX = 20000;

/**
 * Real-time spectrum analyzer. Uses AnalyserNode.getFloatFrequencyData when a
 * live engine is available; otherwise renders a synthetic demo spectrum so the
 * view is never blank. All canvas / rAF access is inside useEffect (SSR-safe).
 */
export function RtaView({ audio, onSpectrum }: RtaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fraction, setFraction] = useState<number>(3);
  const [mode, setMode] = useState<RtaMode>("live");
  const [reference, setReference] = useState<string>(REFERENCE_OFF);

  const fractionRef = useRef(fraction);
  const modeRef = useRef(mode);
  const referenceRef = useRef(reference);
  const onSpectrumRef = useRef(onSpectrum);
  fractionRef.current = fraction;
  modeRef.current = mode;
  referenceRef.current = reference;
  onSpectrumRef.current = onSpectrum;

  const { engine, performanceMode } = audio;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let peakHold: Float64Array | null = null;
    let avgAccum: Float64Array | null = null;
    let avgCount = 0;
    let frame = 0;

    const analyser = engine?.analyser ?? null;
    const sampleRate = engine?.sampleRate ?? 48000;
    const fftSize = analyser?.fftSize ?? (performanceMode ? 1024 : 4096);
    const binCount = analyser?.frequencyBinCount ?? fftSize / 2;
    const freqData = new Float32Array(binCount);

    const resize = () => {
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const syntheticDb = (i: number, t: number): number => {
      const f = binToFrequency(i, fftSize, sampleRate);
      if (f <= 0) return MIN_DB;
      const logF = Math.log10(f);
      const tilt = -10 * (logF - Math.log10(100));
      const r1 = 18 * Math.exp(-Math.pow((logF - Math.log10(120)) / 0.1, 2));
      const r2 = 12 * Math.exp(-Math.pow((logF - Math.log10(1500)) / 0.08, 2));
      const wobble = 4 * Math.sin(t * 0.04 + i * 0.02);
      return Math.max(MIN_DB, Math.min(MAX_DB, -45 + tilt + r1 + r2 + wobble));
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Grid.
      ctx.strokeStyle = "rgba(42,34,51,0.8)";
      ctx.lineWidth = 1;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#A99FB3";
      const gridFreqs = [50, 100, 500, 1000, 5000, 10000];
      for (const gf of gridFreqs) {
        const x =
          ((Math.log10(gf) - Math.log10(F_MIN)) /
            (Math.log10(F_MAX) - Math.log10(F_MIN))) *
          w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(gf >= 1000 ? `${gf / 1000}k` : `${gf}`, x + 2, h - 4);
      }

      // Magnitude in dB.
      const magsDb = new Float64Array(binCount);
      if (analyser) {
        analyser.getFloatFrequencyData(freqData);
        for (let i = 0; i < binCount; i++) magsDb[i] = freqData[i];
      } else {
        for (let i = 0; i < binCount; i++) magsDb[i] = syntheticDb(i, frame);
      }

      // Convert dB -> linear for octave smoothing, then back.
      const lin = new Float64Array(binCount);
      for (let i = 0; i < binCount; i++) lin[i] = Math.pow(10, magsDb[i] / 20);
      const smoothLin = octaveSmooth(lin, fftSize, sampleRate, fractionRef.current);
      const smoothDb = new Float64Array(binCount);
      for (let i = 0; i < binCount; i++) {
        smoothDb[i] = smoothLin[i] > 0 ? 20 * Math.log10(smoothLin[i]) : MIN_DB;
      }

      // Mode processing.
      const m = modeRef.current;
      let display: Float64Array = smoothDb;
      if (m === "peak") {
        if (!peakHold) peakHold = smoothDb.slice();
        else {
          for (let i = 0; i < binCount; i++) {
            if (smoothDb[i] > peakHold[i]) peakHold[i] = smoothDb[i];
          }
        }
        display = peakHold;
      } else if (m === "average") {
        if (!avgAccum) {
          avgAccum = smoothDb.slice();
          avgCount = 1;
        } else {
          for (let i = 0; i < binCount; i++) avgAccum[i] += smoothDb[i];
          avgCount++;
        }
        const averaged = new Float64Array(binCount);
        for (let i = 0; i < binCount; i++) averaged[i] = avgAccum[i] / avgCount;
        display = averaged;
      } else {
        peakHold = null;
        avgAccum = null;
        avgCount = 0;
      }

      // Plot as filled spectrum.
      const xAt = (i: number) => {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN) return 0;
        return (
          ((Math.log10(f) - Math.log10(F_MIN)) /
            (Math.log10(F_MAX) - Math.log10(F_MIN))) *
          w
        );
      };
      const yAt = (db: number) => {
        const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
        return h - ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * h;
      };

      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "rgba(168,85,247,0.15)");
      grad.addColorStop(0.5, "rgba(255,107,138,0.3)");
      grad.addColorStop(1, "rgba(246,166,35,0.55)");

      ctx.beginPath();
      ctx.moveTo(0, h);
      let started = false;
      for (let i = 1; i < binCount; i++) {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN || f > F_MAX) continue;
        const x = xAt(i);
        const y = yAt(display[i]);
        if (!started) {
          ctx.lineTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke line on top.
      ctx.beginPath();
      started = false;
      for (let i = 1; i < binCount; i++) {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN || f > F_MAX) continue;
        const x = xAt(i);
        const y = yAt(display[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#F6A623";
      ctx.lineWidth = 2;
      if (!performanceMode) {
        ctx.shadowColor = "rgba(246,166,35,0.5)";
        ctx.shadowBlur = 10;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Reference / target curve overlay (dashed, distinct accent). Anchored
      // so that the curve sits at the display level around 1 kHz.
      const refId = referenceRef.current;
      if (refId && refId !== REFERENCE_OFF) {
        // Anchor the relative target curve to the live trace near 1 kHz.
        let anchorDb = -45;
        {
          let bestBin = 1;
          let bestErr = Infinity;
          for (let i = 1; i < binCount; i++) {
            const err = Math.abs(binToFrequency(i, fftSize, sampleRate) - 1000);
            if (err < bestErr) {
              bestErr = err;
              bestBin = i;
            }
          }
          anchorDb = display[bestBin];
        }
        ctx.beginPath();
        let refStarted = false;
        for (let i = 1; i < binCount; i++) {
          const f = binToFrequency(i, fftSize, sampleRate);
          if (f < F_MIN || f > F_MAX) continue;
          const rel = sampleReference(refId, [f])[0];
          const x = xAt(i);
          const y = yAt(anchorDb + rel);
          if (!refStarted) {
            ctx.moveTo(x, y);
            refStarted = true;
          } else ctx.lineTo(x, y);
        }
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "#2DD4BF"; // teal — distinct from the amber trace
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Report a sparse log-sampled smoothed spectrum upward (~4 Hz throttle).
      const cb = onSpectrumRef.current;
      if (cb && frame % 15 === 0) {
        const freqOut: number[] = [];
        const dbOut: number[] = [];
        for (let i = 1; i < binCount; i++) {
          const f = binToFrequency(i, fftSize, sampleRate);
          if (f < F_MIN || f > F_MAX) continue;
          freqOut.push(f);
          dbOut.push(smoothDb[i]);
        }
        cb({ freq: freqOut, db: dbOut });
      }

      frame++;
      raf = requestAnimationFrame(draw);
    };

    draw();

    let onResize: (() => void) | undefined;
    if (typeof window !== "undefined") {
      onResize = () => resize();
      window.addEventListener("resize", onResize);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (onResize && typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, [engine, performanceMode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-haze">
          Smoothing
          <select
            value={fraction}
            onChange={(e) => setFraction(Number(e.target.value))}
            className="rounded-lg border border-line bg-panel2 px-2 py-1.5 font-mono text-sm text-text"
          >
            {OCTAVE_FRACTIONS.map((f) => (
              <option key={f} value={f}>
                1/{f} oct
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {(["live", "peak", "average"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {m === "average" ? "Avg" : m === "peak" ? "Peak-hold" : "Live"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-haze">
          Target
          <select
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-text"
          >
            <option value={REFERENCE_OFF}>Off</option>
            {REFERENCE_CURVES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <span className="ml-auto font-mono text-xs text-haze">
          {F_MIN} Hz – {F_MAX / 1000} kHz
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-xl border border-line bg-ink sm:h-80"
        aria-label="Real-time spectrum"
      />
      {!engine && (
        <p className="font-mono text-xs text-amber-soft">
          Demo spectrum — press Start in the source bar to measure live.
        </p>
      )}
    </div>
  );
}
