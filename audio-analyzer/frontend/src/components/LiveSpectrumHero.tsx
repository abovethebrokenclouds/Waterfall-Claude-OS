import { useEffect, useRef, useState } from "react";
import { useAudioState } from "../hooks/useAudioState";
import { octaveSmooth, binToFrequency } from "../lib/dsp";

interface LiveSpectrumHeroProps {
  className?: string;
}

const MIN_DB = -100;
const MAX_DB = -10;
const F_MIN = 20;
const F_MAX = 20000;

/**
 * The REAL real-time analyzer, embedded as the landing hero — not a synthetic
 * mock. It taps the live microphone through the same Web Audio engine and DSP
 * the analyzer app uses (AnalyserNode.getFloatFrequencyData → octave smoothing →
 * log-frequency plot). Before the visitor taps "Go live" it shows a gentle
 * synthetic idle trace so the hero is never blank; one tap promotes it to a
 * genuine measurement of whatever the mic hears.
 *
 * Every browser global (AudioContext, getUserMedia, rAF, matchMedia) is reached
 * only inside useEffect / event handlers, so SSR and `tsc --noEmit` stay clean.
 */
export function LiveSpectrumHero({ className }: LiveSpectrumHeroProps) {
  const audio = useAudioState();
  const { engine, start, stop, supported, permission, performanceMode, error } =
    audio;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peak, setPeak] = useState<{ freq: number; db: number } | null>(null);

  const live = !!engine;

  // Clear the stale peak readout when the mic stops, so the next Go-live doesn't
  // flash a prior value before the first fresh sample lands.
  useEffect(() => {
    if (!live) setPeak(null);
  }, [live]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const analyser = engine?.analyser ?? null;
    const sampleRate = engine?.sampleRate ?? 48000;
    const fftSize = analyser?.fftSize ?? 4096;
    const binCount = analyser?.frequencyBinCount ?? fftSize / 2;
    const freqData = new Float32Array(binCount);

    let raf = 0;
    let frame = 0;

    const resize = () => {
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // A calm, pink-tilted idle spectrum with slow-moving resonances. Only used
    // before the mic is live, purely so the hero has motion.
    const idleDb = (i: number, t: number): number => {
      const f = binToFrequency(i, fftSize, sampleRate);
      if (f <= 0) return MIN_DB;
      const logF = Math.log10(f);
      const tilt = -9 * (logF - Math.log10(100));
      const r1 = 16 * Math.exp(-Math.pow((logF - Math.log10(110)) / 0.11, 2));
      const r2 = 11 * Math.exp(-Math.pow((logF - Math.log10(900)) / 0.09, 2));
      const r3 = 8 * Math.exp(-Math.pow((logF - Math.log10(5200)) / 0.1, 2));
      const wobble = prefersReduced
        ? 0
        : 3.5 * Math.sin(t * 0.035 + i * 0.02) +
          2 * Math.sin(t * 0.013 + i * 0.05);
      return Math.max(MIN_DB, Math.min(MAX_DB, -46 + tilt + r1 + r2 + r3 + wobble));
    };

    const xAt = (f: number, w: number) => {
      if (f < F_MIN) return 0;
      return (
        ((Math.log10(f) - Math.log10(F_MIN)) /
          (Math.log10(F_MAX) - Math.log10(F_MIN))) *
        w
      );
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Faint log-frequency grid.
      ctx.strokeStyle = "rgba(42,34,51,0.7)";
      ctx.fillStyle = "#6F6680";
      ctx.lineWidth = 1;
      ctx.font = "10px ui-monospace, monospace";
      for (const gf of [100, 1000, 10000]) {
        const x = xAt(gf, w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(gf >= 1000 ? `${gf / 1000}k` : `${gf}`, x + 3, h - 5);
      }

      // Raw magnitude in dB — REAL mic data when live, idle synthetic otherwise.
      const magsDb = new Float64Array(binCount);
      if (analyser) {
        analyser.getFloatFrequencyData(freqData);
        for (let i = 0; i < binCount; i++) magsDb[i] = freqData[i];
      } else {
        for (let i = 0; i < binCount; i++) magsDb[i] = idleDb(i, frame);
      }

      // dB → linear → 1/6-oct smoothing → dB (same path as the analyzer).
      const lin = new Float64Array(binCount);
      for (let i = 0; i < binCount; i++) lin[i] = Math.pow(10, magsDb[i] / 20);
      const smoothLin = octaveSmooth(lin, fftSize, sampleRate, 6);
      const display = new Float64Array(binCount);
      for (let i = 0; i < binCount; i++) {
        display[i] = smoothLin[i] > 0 ? 20 * Math.log10(smoothLin[i]) : MIN_DB;
      }

      const yAt = (db: number) => {
        const c = Math.max(MIN_DB, Math.min(MAX_DB, db));
        return h - ((c - MIN_DB) / (MAX_DB - MIN_DB)) * h;
      };

      // Filled spectrum (violet → rose → amber).
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "rgba(168,85,247,0.12)");
      grad.addColorStop(0.5, "rgba(255,107,138,0.28)");
      grad.addColorStop(1, "rgba(246,166,35,0.5)");
      ctx.beginPath();
      ctx.moveTo(0, h);
      let started = false;
      let peakIdx = 1;
      let peakDb = -Infinity;
      for (let i = 1; i < binCount; i++) {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN || f > F_MAX) continue;
        const x = xAt(f, w);
        const y = yAt(display[i]);
        ctx.lineTo(x, y);
        started = true;
        if (display[i] > peakDb) {
          peakDb = display[i];
          peakIdx = i;
        }
      }
      if (started) {
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Amber stroke with a soft glow (skipped in Performance Mode).
      ctx.beginPath();
      started = false;
      for (let i = 1; i < binCount; i++) {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN || f > F_MAX) continue;
        const x = xAt(f, w);
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
        ctx.shadowBlur = 12;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Surface a live peak readout a few times a second.
      if (analyser && frame % 12 === 0) {
        const pf = binToFrequency(peakIdx, fftSize, sampleRate);
        if (Number.isFinite(pf) && peakDb > MIN_DB) {
          setPeak({ freq: pf, db: peakDb });
        }
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

  const fmtFreq = (f: number) =>
    f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`;

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* warm aura behind the glass */}
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-amber/5 blur-3xl" />

      <div className="glass-panel relative overflow-hidden rounded-2xl">
        <canvas
          ref={canvasRef}
          className="block h-72 w-full sm:h-80"
          aria-label={
            live ? "Live microphone spectrum" : "Demo spectrum — tap to go live"
          }
        />

        {/* status pill */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${
              live
                ? "bg-amber/15 text-amber-soft"
                : "bg-white/5 text-haze"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "animate-slow-pulse bg-amber" : "bg-haze"
              }`}
            />
            {live ? "LIVE · mic" : "Demo signal"}
          </span>
          {live && peak && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[11px] text-text backdrop-blur">
              peak {fmtFreq(peak.freq)}
            </span>
          )}
        </div>

        {/* start / stop control */}
        <div className="absolute bottom-3 right-3">
          {live ? (
            <button
              type="button"
              onClick={stop}
              className="glass-btn flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-text"
            >
              <span className="h-2.5 w-2.5 rounded-[3px] bg-rose" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={!supported || permission === "requesting"}
              className="glass-btn-primary flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
              </svg>
              {permission === "requesting" ? "Starting…" : "Go live"}
            </button>
          )}
        </div>
      </div>

      {/* terse capture-state note under the hero */}
      <p className="mt-2 text-center text-xs text-haze sm:text-left">
        {!supported
          ? "Mic capture isn’t available here — showing a demo trace."
          : permission === "denied"
            ? error ?? "Grant mic access to measure live."
            : live
              ? "Real-time 1/6-octave spectrum from your microphone."
              : "Tap Go live to measure the room around you — runs on-device, nothing leaves your browser."}
      </p>
    </div>
  );
}
