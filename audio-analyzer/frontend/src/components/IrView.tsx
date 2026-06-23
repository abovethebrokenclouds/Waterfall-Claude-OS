import { useEffect, useMemo, useRef, useState } from "react";
import { irMetrics, syntheticImpulseResponse, type IrMetrics } from "../lib/dsp";

const SAMPLE_RATE = 16000;
const DURATION = 2.5;

interface IrConfig {
  rt60: number;
  reflectionMs: number;
  reflectionGain: number;
  seed: number;
}

const PRESETS: { label: string; cfg: IrConfig }[] = [
  { label: "Small room", cfg: { rt60: 0.45, reflectionMs: 9, reflectionGain: 0.4, seed: 3 } },
  { label: "Live room", cfg: { rt60: 0.9, reflectionMs: 14, reflectionGain: 0.5, seed: 7 } },
  { label: "Hall", cfg: { rt60: 1.8, reflectionMs: 22, reflectionGain: 0.35, seed: 11 } },
];

/** Plain-language interpretation lines keyed off the metric values. */
function interpret(m: IrMetrics): string[] {
  const lines: string[] = [];
  const rt = m.rt60;
  if (rt < 0.6) {
    lines.push(`RT60 ~${rt.toFixed(2)} s — controlled, tight decay for a small room.`);
  } else if (rt < 1.2) {
    lines.push(`RT60 ~${rt.toFixed(2)} s — moderately live; broadband absorption would tighten it.`);
  } else {
    lines.push(`RT60 ~${rt.toFixed(2)} s — reverberant; treat corners and early reflections.`);
  }
  if (m.c50 > 0) {
    lines.push(`C50 ${m.c50.toFixed(1)} dB — speech clarity is good (early energy dominates).`);
  } else {
    lines.push(`C50 ${m.c50.toFixed(1)} dB — speech may smear; reduce late energy.`);
  }
  if (m.c80 > 0) {
    lines.push(`C80 ${m.c80.toFixed(1)} dB — music stays defined.`);
  } else {
    lines.push(`C80 ${m.c80.toFixed(1)} dB — music feels washed; reduce reverberation.`);
  }
  if (m.sti >= 0.6) {
    lines.push(`STI ${m.sti.toFixed(2)} — good intelligibility (≈${m.alcons.toFixed(1)}% ALcons).`);
  } else if (m.sti >= 0.45) {
    lines.push(`STI ${m.sti.toFixed(2)} — fair intelligibility (≈${m.alcons.toFixed(1)}% ALcons).`);
  } else {
    lines.push(`STI ${m.sti.toFixed(2)} — poor intelligibility (≈${m.alcons.toFixed(1)}% ALcons).`);
  }
  return lines;
}

/**
 * Impulse Response mode (Studio): an energy-time-curve (ETC) display of the IR
 * plus the full clarity/intelligibility metric set with plain-language notes.
 * Driven by a deterministic synthetic impulse response (clearly demo data).
 * All canvas access is inside useEffect (SSR-safe).
 */
export function IrView() {
  const [cfg, setCfg] = useState<IrConfig>(PRESETS[1].cfg);
  const etcRef = useRef<HTMLCanvasElement | null>(null);

  const { ir, metrics } = useMemo(() => {
    const sig = syntheticImpulseResponse({
      rt60: cfg.rt60,
      sampleRate: SAMPLE_RATE,
      durationSec: DURATION,
      reflectionMs: cfg.reflectionMs,
      reflectionGain: cfg.reflectionGain,
      seed: cfg.seed,
    });
    return { ir: sig, metrics: irMetrics(sig, SAMPLE_RATE) };
  }, [cfg]);

  // ETC: 10*log10 of the squared IR envelope on a log-time-ish linear axis.
  useEffect(() => {
    const canvas = etcRef.current;
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

    // dB grid.
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

    const n = ir.length;
    // Normalise to the peak so the ETC starts near 0 dB.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ir[i]));
    if (peak <= 0) peak = 1;

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, "rgba(168,85,247,0.12)");
    grad.addColorStop(0.6, "rgba(255,107,138,0.22)");
    grad.addColorStop(1, "rgba(246,166,35,0.45)");

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const amp = Math.abs(ir[i]) / peak;
      const db = amp > 0 ? 20 * Math.log10(amp) : minDb;
      ctx.lineTo(x, yAt(db));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line.
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const amp = Math.abs(ir[i]) / peak;
      const db = amp > 0 ? 20 * Math.log10(amp) : minDb;
      const y = yAt(db);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#F6A623";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Time axis labels.
    ctx.fillStyle = "#A99FB3";
    for (const ms of [0, 500, 1000, 1500, 2000]) {
      const x = (ms / 1000 / DURATION) * w;
      ctx.fillText(`${ms}ms`, Math.min(w - 28, x + 2), h - 4);
    }
  }, [ir]);

  const notes = useMemo(() => interpret(metrics), [metrics]);

  const cards: { label: string; value: string }[] = [
    { label: `RT60 (${metrics.rtMethod})`, value: `${metrics.rt60.toFixed(2)} s` },
    { label: "EDT", value: `${metrics.edt.toFixed(2)} s` },
    { label: "C50", value: `${metrics.c50.toFixed(1)} dB` },
    { label: "C80", value: `${metrics.c80.toFixed(1)} dB` },
    { label: "D50", value: `${(metrics.d50 * 100).toFixed(0)} %` },
    { label: "Ts", value: `${(metrics.ts * 1000).toFixed(0)} ms` },
    { label: "STI", value: metrics.sti.toFixed(2) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setCfg(p.cfg)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                cfg.rt60 === p.cfg.rt60
                  ? "bg-amber text-ink"
                  : "text-haze hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCfg((c) => ({ ...c, seed: (c.seed % 97) + 7 }))}
          className="rounded-lg bg-gradient-to-r from-amber to-rose px-3 py-1.5 text-xs font-semibold text-ink transition-transform hover:scale-[1.03]"
        >
          Generate sweep IR (demo)
        </button>
        <span className="ml-auto rounded-full border border-rose/40 bg-rose/10 px-2.5 py-1 font-mono text-xs text-rose">
          demo data
        </span>
      </div>

      <div>
        <div className="mb-1 text-xs text-haze">Energy-time curve (ETC)</div>
        <canvas
          ref={etcRef}
          className="h-48 w-full rounded-xl border border-line bg-ink"
          aria-label="Impulse response energy-time curve"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-line bg-panel2/60 p-3 text-center"
          >
            <div className="text-[11px] text-haze">{c.label}</div>
            <div className="font-mono text-lg text-amber-soft tabular-nums">
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2">
        <ul className="flex flex-col gap-1.5 text-sm text-amber-soft">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <p className="font-mono text-xs text-haze">
        Demo metrics from a synthetic swept-sine impulse response.
      </p>
    </div>
  );
}
