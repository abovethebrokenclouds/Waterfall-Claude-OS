import { useEffect, useRef } from "react";
import type { UseAudioState } from "../hooks/useAudioState";
import { binToFrequency } from "../lib/dsp";

interface SpectrographProps {
  audio: UseAudioState;
}

const MIN_DB = -100;
const MAX_DB = -10;
const F_MIN = 20;
const F_MAX = 20000;
const HISTORY = 256; // columns of time kept on screen

/**
 * Warm-colormap time-frequency heatmap. Each animation frame appends one column
 * of the current spectrum and scrolls the canvas left. Frequency runs bottom
 * (low) to top (high) on a log axis; colour maps level ink → violet → rose →
 * amber (NO green). Fed by the same AnalyserNode RtaView uses; synthetic when
 * there is no live engine. All canvas / rAF access is inside useEffect.
 */
export function Spectrograph({ audio }: SpectrographProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { engine, performanceMode } = audio;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;

    const analyser = engine?.analyser ?? null;
    const sampleRate = engine?.sampleRate ?? 48000;
    const fftSize = analyser?.fftSize ?? (performanceMode ? 1024 : 4096);
    const binCount = analyser?.frequencyBinCount ?? fftSize / 2;
    const freqData = new Float32Array(binCount);

    // Off-screen ring history of column data (one Float32Array per column).
    const cols: Float32Array[] = [];

    const resize = () => {
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // ink (low) -> violet -> rose -> amber (high). Warm palette only.
    const STOPS: [number, number, number][] = [
      [12, 10, 18], // ink
      [124, 58, 237], // violet-deep
      [168, 85, 247], // violet
      [255, 107, 138], // rose
      [246, 166, 35], // amber
      [255, 195, 107], // amber-soft
    ];
    const colorFor = (norm: number): string => {
      const t = Math.max(0, Math.min(1, norm));
      const seg = t * (STOPS.length - 1);
      const i = Math.min(STOPS.length - 2, Math.floor(seg));
      const f = seg - i;
      const a = STOPS[i];
      const b = STOPS[i + 1];
      const r = Math.round(a[0] + (b[0] - a[0]) * f);
      const g = Math.round(a[1] + (b[1] - a[1]) * f);
      const bl = Math.round(a[2] + (b[2] - a[2]) * f);
      return `rgb(${r},${g},${bl})`;
    };

    const syntheticDb = (i: number, t: number): number => {
      const ff = binToFrequency(i, fftSize, sampleRate);
      if (ff <= 0) return MIN_DB;
      const logF = Math.log10(ff);
      const tilt = -10 * (logF - Math.log10(100));
      const r1 = 16 * Math.exp(-Math.pow((logF - Math.log10(120 + 40 * Math.sin(t * 0.02))) / 0.1, 2));
      const r2 = 10 * Math.exp(-Math.pow((logF - Math.log10(1500)) / 0.08, 2));
      const wobble = 5 * Math.sin(t * 0.05 + i * 0.03);
      return Math.max(MIN_DB, Math.min(MAX_DB, -45 + tilt + r1 + r2 + wobble));
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Sample current spectrum into a column.
      const col = new Float32Array(binCount);
      if (analyser) {
        analyser.getFloatFrequencyData(freqData);
        for (let i = 0; i < binCount; i++) col[i] = freqData[i];
      } else {
        for (let i = 0; i < binCount; i++) col[i] = syntheticDb(i, frame);
      }
      cols.push(col);
      if (cols.length > HISTORY) cols.shift();

      ctx.clearRect(0, 0, w, h);
      const colW = w / HISTORY;

      // Log-frequency y mapping (bottom = F_MIN, top = F_MAX).
      const yAt = (f: number) => {
        const c = Math.max(F_MIN, Math.min(F_MAX, f));
        return (
          h -
          ((Math.log10(c) - Math.log10(F_MIN)) /
            (Math.log10(F_MAX) - Math.log10(F_MIN))) *
            h
        );
      };

      for (let c = 0; c < cols.length; c++) {
        const data = cols[c];
        const x = c * colW;
        let prevY = h;
        for (let i = 1; i < binCount; i++) {
          const f = binToFrequency(i, fftSize, sampleRate);
          if (f < F_MIN || f > F_MAX) continue;
          const y = yAt(f);
          const norm = (data[i] - MIN_DB) / (MAX_DB - MIN_DB);
          ctx.fillStyle = colorFor(norm);
          ctx.fillRect(x, y, colW + 0.6, Math.max(0.6, prevY - y) + 0.6);
          prevY = y;
        }
      }

      // Frequency gridline labels on the left.
      ctx.fillStyle = "#A99FB3";
      ctx.font = "10px ui-monospace, monospace";
      for (const gf of [100, 1000, 10000]) {
        const y = yAt(gf);
        ctx.fillText(gf >= 1000 ? `${gf / 1000}k` : `${gf}`, 3, y - 2);
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
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-xl border border-line bg-ink sm:h-80"
        aria-label="Spectrograph time-frequency heatmap"
      />
      <div className="flex items-center justify-between text-xs text-haze">
        <span className="font-mono">time →</span>
        <div className="flex items-center gap-2">
          <span className="font-mono">quiet</span>
          <span
            className="h-2 w-24 rounded-full"
            style={{
              background:
                "linear-gradient(90deg,#0C0A12,#7C3AED,#A855F7,#FF6B8A,#F6A623,#FFC36B)",
            }}
          />
          <span className="font-mono">loud</span>
        </div>
      </div>
      {!engine && (
        <p className="font-mono text-xs text-amber-soft">
          Demo spectrograph — press Start in the source bar to scroll live.
        </p>
      )}
    </div>
  );
}
