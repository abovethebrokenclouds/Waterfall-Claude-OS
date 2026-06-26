import { useEffect, useRef, useState } from "react";
import type { UseAudioState } from "../hooks/useAudioState";
import {
  octaveSmooth,
  binToFrequency,
  OCTAVE_FRACTIONS,
  REFERENCE_CURVES,
  sampleReference,
} from "../lib/dsp";
import {
  captureTrace,
  sampleTraceDb,
  type SpectrumTrace,
} from "../lib/traces";
import { Spectrograph } from "./Spectrograph";
import { LockChip } from "./LockChip";
import { hasFeature, type Edition } from "../lib/editions";

type RtaMode = "live" | "peak" | "average";

/** A sparse smoothed spectrum reported upward for the insights engine. */
export interface SpectrumSnapshot {
  freq: number[];
  db: number[];
}

/** A full-resolution spectrum tapped off the bridge (per-bin freq + dB). */
export interface BridgeSpectrum {
  freqs: number[];
  db: number[];
}

interface RtaViewProps {
  audio: UseAudioState;
  /** Throttled smoothed-spectrum callback for the insights engine. */
  onSpectrum?: (snapshot: SpectrumSnapshot) => void;
  /** Current edition — gates spectrograph, traces, and live averaging. */
  edition?: Edition;
  /**
   * Live spectrum from a bridge console/network channel. When present it drives
   * the RTA in place of the mic / synthetic path. Null = use the mic path.
   */
  bridgeSpectrum?: BridgeSpectrum | null;
  /** Label for the active bridge source, e.g. "midas M32 · In 1". */
  bridgeLabel?: string | null;
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
export function RtaView({
  audio,
  onSpectrum,
  edition = "studio",
  bridgeSpectrum = null,
  bridgeLabel = null,
}: RtaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fraction, setFraction] = useState<number>(3);
  const [mode, setMode] = useState<RtaMode>("live");
  const [reference, setReference] = useState<string>(REFERENCE_OFF);
  const [view, setView] = useState<"spectrum" | "spectrograph">("spectrum");
  const [liveAverage, setLiveAverage] = useState(false);
  const [avgN, setAvgN] = useState(16);
  const [traces, setTraces] = useState<SpectrumTrace[]>([]);

  const canTraces = hasFeature(edition, "traces");
  const canLiveAvg = hasFeature(edition, "liveAverage");
  const canSpectrograph = hasFeature(edition, "spectrograph");

  const fractionRef = useRef(fraction);
  const modeRef = useRef(mode);
  const referenceRef = useRef(reference);
  const onSpectrumRef = useRef(onSpectrum);
  const tracesRef = useRef(traces);
  const liveAvgRef = useRef(liveAverage && canLiveAvg);
  const avgNRef = useRef(avgN);
  const latestRef = useRef<SpectrumSnapshot | null>(null);
  const bridgeRef = useRef<BridgeSpectrum | null>(bridgeSpectrum);
  bridgeRef.current = bridgeSpectrum;
  fractionRef.current = fraction;
  modeRef.current = mode;
  referenceRef.current = reference;
  onSpectrumRef.current = onSpectrum;
  tracesRef.current = traces;
  liveAvgRef.current = liveAverage && canLiveAvg;
  avgNRef.current = avgN;

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
    const avgRing: Float64Array[] = []; // rolling live-average history

    const analyser = engine?.analyser ?? null;
    // Geometry for the mic / synthetic path. When a bridge spectrum is active
    // it overrides these per-frame (its FFT size / sample rate may differ).
    const baseSampleRate = engine?.sampleRate ?? 48000;
    const baseFftSize = analyser?.fftSize ?? (performanceMode ? 1024 : 4096);
    const baseBinCount = analyser?.frequencyBinCount ?? baseFftSize / 2;
    const freqData = new Float32Array(baseBinCount);
    let lastBinCount = baseBinCount;

    const resize = () => {
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const syntheticDb = (i: number, t: number, fftSize: number, sampleRate: number): number => {
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

      // Effective geometry for this frame. A live bridge spectrum (full-
      // resolution, per-bin freq+dB) takes precedence over the mic / synthetic
      // path and defines its own FFT size / sample rate.
      const bridge = bridgeRef.current;
      const bridgeActive = bridge !== null && bridge.db.length > 1;
      let fftSize = baseFftSize;
      let sampleRate = baseSampleRate;
      let binCount = baseBinCount;
      if (bridgeActive && bridge) {
        binCount = bridge.db.length; // fftSize/2 + 1
        fftSize = (binCount - 1) * 2;
        // Infer sample rate from the Nyquist-bin frequency.
        const fNyq = bridge.freqs[binCount - 1];
        sampleRate = Number.isFinite(fNyq) && fNyq > 0 ? fNyq * 2 : baseSampleRate;
      }
      // Reset rolling accumulators if the bin geometry changed (mic↔bridge).
      if (binCount !== lastBinCount) {
        peakHold = null;
        avgAccum = null;
        avgCount = 0;
        avgRing.length = 0;
        lastBinCount = binCount;
      }

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
      if (bridgeActive && bridge) {
        for (let i = 0; i < binCount; i++) magsDb[i] = bridge.db[i];
      } else if (analyser) {
        analyser.getFloatFrequencyData(freqData);
        for (let i = 0; i < binCount; i++) magsDb[i] = freqData[i];
      } else {
        for (let i = 0; i < binCount; i++) magsDb[i] = syntheticDb(i, frame, fftSize, sampleRate);
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

      // Live averaging — a rolling mean of the last N display frames. Applies
      // on top of the selected mode (independent of cumulative "average").
      if (liveAvgRef.current) {
        const copy = display.slice();
        avgRing.push(copy);
        const cap = Math.max(1, avgNRef.current);
        while (avgRing.length > cap) avgRing.shift();
        const rolled = new Float64Array(binCount);
        for (const f of avgRing) {
          for (let i = 0; i < binCount; i++) rolled[i] += f[i];
        }
        for (let i = 0; i < binCount; i++) rolled[i] /= avgRing.length;
        display = rolled;
      } else if (avgRing.length) {
        avgRing.length = 0;
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

      // Captured static traces (warm-palette overlays).
      const trs = tracesRef.current;
      for (const tr of trs) {
        if (!tr.visible) continue;
        ctx.beginPath();
        let tStarted = false;
        for (let i = 1; i < binCount; i++) {
          const f = binToFrequency(i, fftSize, sampleRate);
          if (f < F_MIN || f > F_MAX) continue;
          const v = sampleTraceDb(tr, f);
          if (v === null) continue;
          const x = xAt(i);
          const y = yAt(v);
          if (!tStarted) {
            ctx.moveTo(x, y);
            tStarted = true;
          } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Report a sparse log-sampled smoothed spectrum upward (~4 Hz throttle),
      // and keep the most recent snapshot for trace capture.
      const freqOut: number[] = [];
      const dbOut: number[] = [];
      for (let i = 1; i < binCount; i++) {
        const f = binToFrequency(i, fftSize, sampleRate);
        if (f < F_MIN || f > F_MAX) continue;
        freqOut.push(f);
        dbOut.push(display[i]);
      }
      latestRef.current = { freq: freqOut, db: dbOut };
      const cb = onSpectrumRef.current;
      if (cb && frame % 15 === 0) {
        cb({ freq: freqOut.slice(), db: dbOut.slice() });
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

  const handleCapture = () => {
    const snap = latestRef.current;
    if (!snap) return;
    setTraces((prev) => [...prev, captureTrace(snap, prev.length)]);
  };
  const toggleTrace = (id: string) =>
    setTraces((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
    );
  const deleteTrace = (id: string) =>
    setTraces((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {/* Spectrum / Spectrograph sub-view toggle. */}
      <div className="flex items-center gap-1 self-start rounded-lg border border-line bg-panel2 p-0.5">
        <button
          type="button"
          onClick={() => setView("spectrum")}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            view === "spectrum" ? "bg-amber text-ink" : "text-haze hover:text-text"
          }`}
        >
          Spectrum
        </button>
        <button
          type="button"
          onClick={() => canSpectrograph && setView("spectrograph")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            view === "spectrograph"
              ? "bg-amber text-ink"
              : "text-haze hover:text-text"
          }`}
        >
          Spectrograph
          {!canSpectrograph && <LockChip edition="pro" />}
        </button>
      </div>

      {view === "spectrograph" && canSpectrograph ? (
        <Spectrograph audio={audio} />
      ) : (
        <>
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
        <label className="flex items-center gap-2 text-xs text-haze">
          <input
            type="checkbox"
            checked={liveAverage && canLiveAvg}
            disabled={!canLiveAvg}
            onChange={(e) => setLiveAverage(e.target.checked)}
            className="accent-amber disabled:opacity-40"
          />
          Live avg
          {!canLiveAvg && <LockChip edition="pro" />}
          {canLiveAvg && liveAverage && (
            <select
              value={avgN}
              onChange={(e) => setAvgN(Number(e.target.value))}
              className="rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-mono text-xs text-text"
            >
              {[8, 16, 32, 64].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </label>
        <span className="ml-auto font-mono text-xs text-haze">
          {F_MIN} Hz – {F_MAX / 1000} kHz
        </span>
      </div>

      {bridgeLabel && (
        <p className="flex items-center gap-2 rounded-lg border border-teal/40 bg-teal/10 px-3 py-2 text-xs text-teal">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-teal"
            aria-hidden
          />
          Source: Bridge — <span className="font-mono">{bridgeLabel}</span>
        </p>
      )}

      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-xl border border-line bg-ink sm:h-80"
        aria-label="Real-time spectrum"
      />

      {/* Trace management. */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text">Traces</span>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!canTraces}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:border-haze disabled:opacity-40"
          >
            Capture trace
            {!canTraces && <LockChip edition="pro" />}
          </button>
        </div>
        {traces.length === 0 ? (
          <p className="text-xs text-haze">
            Capture the current curve to overlay it as a static reference.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {traces.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 text-xs text-haze"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="flex-1 truncate text-text">{t.name}</span>
                <button
                  type="button"
                  onClick={() => toggleTrace(t.id)}
                  className="text-haze hover:text-text"
                >
                  {t.visible ? "hide" : "show"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTrace(t.id)}
                  className="text-rose hover:text-rose-deep"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!engine && !bridgeLabel && (
        <p className="font-mono text-xs text-amber-soft">
          Demo spectrum — press Start in the source bar to measure live.
        </p>
      )}
        </>
      )}
    </div>
  );
}
