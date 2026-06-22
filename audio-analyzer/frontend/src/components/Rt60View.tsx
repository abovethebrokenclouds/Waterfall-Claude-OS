import { useEffect, useMemo, useRef } from "react";
import { syntheticIr, schroederDecay, estimateRt60 } from "../lib/dsp";

const SAMPLE_RATE = 16000;
const DURATION = 2.0;
const TARGET_RT = 0.9;

/**
 * RT60 view: a Schroeder decay curve plus a waterfall-style canvas, with the
 * estimated RT60 and a plain-language summary. Driven by a deterministic
 * synthetic impulse response (clearly demo data).
 */
export function Rt60View() {
  const decayRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<HTMLCanvasElement | null>(null);

  const { edc, result } = useMemo(() => {
    const ir = syntheticIr(TARGET_RT, SAMPLE_RATE, DURATION, 7);
    return { edc: schroederDecay(ir), result: estimateRt60(ir, SAMPLE_RATE) };
  }, []);

  // Decay curve.
  useEffect(() => {
    const canvas = decayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const minDb = -60;
    const yAt = (db: number) => {
      const c = Math.max(minDb, Math.min(0, db));
      return ((0 - c) / -minDb) * h;
    };

    // Grid lines at -10..-50 dB.
    ctx.strokeStyle = "rgba(42,34,51,0.8)";
    ctx.fillStyle = "#A99FB3";
    ctx.font = "10px ui-monospace, monospace";
    for (let db = -10; db >= -50; db -= 10) {
      const y = yAt(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    ctx.beginPath();
    const n = edc.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = yAt(Number.isFinite(edc[i]) ? edc[i] : minDb);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#F6A623";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(246,166,35,0.5)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [edc]);

  // Waterfall-style decay viz (per "band" rows decaying over time).
  useEffect(() => {
    const canvas = waterfallRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const bands = 18;
    const cols = 64;
    const cellW = w / cols;
    const rowH = h / bands;
    for (let b = 0; b < bands; b++) {
      // Lower bands decay slower (longer RT in the low end).
      const bandRt = TARGET_RT * (1.6 - b / bands);
      for (let c = 0; c < cols; c++) {
        const t = (c / cols) * DURATION;
        const level = Math.exp(-t / (bandRt / 6.9078)); // 0..1
        const energy = Math.max(0, level);
        const alpha = Math.pow(energy, 0.6);
        // amber -> rose -> violet across the band index.
        const hueMix = b / bands;
        const r = Math.round(246 - hueMix * 78);
        const g = Math.round(166 - hueMix * 81);
        const bl = Math.round(35 + hueMix * 212);
        ctx.fillStyle = `rgba(${r},${g},${bl},${alpha})`;
        ctx.fillRect(c * cellW, b * rowH, cellW + 0.5, rowH + 0.5);
      }
    }
  }, []);

  const summary = useMemo(() => {
    if (result.rt60 > 1.2) {
      return "Low-end decay is long — consider bass trapping in the corners.";
    }
    if (result.rt60 > 0.6) {
      return "Reverberation is moderate — broadband absorption would tighten it up.";
    }
    return "The room is fairly dead — there's room to add a little liveliness.";
  }, [result.rt60]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-ink p-5 text-center shadow-glow">
          <div className="text-xs text-haze">RT60 ({result.method})</div>
          <div className="font-mono text-5xl font-bold text-amber-soft tabular-nums">
            {result.rt60.toFixed(2)}
            <span className="ml-1 text-xl text-haze">s</span>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-panel2/60 p-5">
          <div className="text-xs text-haze">Decay slope</div>
          <div className="font-mono text-3xl text-text tabular-nums">
            {result.slope.toFixed(1)}
          </div>
          <div className="text-xs text-haze">dB / s</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-haze">Energy decay curve</div>
        <canvas
          ref={decayRef}
          className="h-40 w-full rounded-xl border border-line bg-ink"
          aria-label="Energy decay curve"
        />
      </div>

      <div>
        <div className="mb-1 text-xs text-haze">Decay by band (waterfall)</div>
        <canvas
          ref={waterfallRef}
          className="h-40 w-full rounded-xl border border-line bg-ink"
          aria-label="Decay waterfall"
        />
      </div>

      <p className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-sm text-amber-soft">
        {summary}
      </p>
      <p className="font-mono text-xs text-haze">
        Demo measurement from a synthetic impulse response.
      </p>
    </div>
  );
}
