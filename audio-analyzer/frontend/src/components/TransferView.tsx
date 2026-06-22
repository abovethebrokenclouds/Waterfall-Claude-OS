import { useEffect, useRef, useState } from "react";
import { syntheticTransfer, type TransferPoint } from "../lib/dsp";

type TransferTrace = "magnitude" | "phase" | "coherence";

const F_MIN = 20;
const F_MAX = 20000;
const COHERENCE_GATE = 0.85;

/**
 * Dual-channel transfer-function view driven by deterministic synthetic data.
 * Clearly labelled as demo data; includes the pink-noise measurement hint.
 */
export function TransferView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trace, setTrace] = useState<TransferTrace>("magnitude");
  const dataRef = useRef<TransferPoint[]>([]);
  if (dataRef.current.length === 0) {
    dataRef.current = syntheticTransfer(F_MIN, F_MAX, 256);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
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
    const data = dataRef.current;
    ctx.clearRect(0, 0, w, h);

    const xAt = (f: number) =>
      ((Math.log10(f) - Math.log10(F_MIN)) /
        (Math.log10(F_MAX) - Math.log10(F_MIN))) *
      w;

    // Range per trace.
    let lo: number;
    let hi: number;
    let color: string;
    let valueOf: (p: TransferPoint) => number;
    if (trace === "magnitude") {
      lo = -18;
      hi = 12;
      color = "#F6A623";
      valueOf = (p) => p.magDb;
    } else if (trace === "phase") {
      lo = -180;
      hi = 180;
      color = "#A855F7";
      valueOf = (p) => p.phaseDeg;
    } else {
      lo = 0;
      hi = 1;
      color = "#2DD4BF";
      valueOf = (p) => p.coherence;
    }
    const yAt = (v: number) => h - ((v - lo) / (hi - lo)) * h;

    // Grid.
    ctx.strokeStyle = "rgba(42,34,51,0.8)";
    ctx.fillStyle = "#A99FB3";
    ctx.font = "10px ui-monospace, monospace";
    for (const gf of [50, 100, 500, 1000, 5000, 10000]) {
      const x = xAt(gf);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(gf >= 1000 ? `${gf / 1000}k` : `${gf}`, x + 2, h - 4);
    }
    // Zero / mid line.
    if (trace !== "coherence") {
      const yMid = yAt(0);
      ctx.strokeStyle = "rgba(169,159,179,0.4)";
      ctx.beginPath();
      ctx.moveTo(0, yMid);
      ctx.lineTo(w, yMid);
      ctx.stroke();
    }

    // Trace, with low-coherence regions dimmed (gating).
    ctx.lineWidth = 2;
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const x = xAt(p.freq);
      const y = yAt(valueOf(p));
      const gated = p.coherence < COHERENCE_GATE;
      if (prevX !== null && prevY !== null) {
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = gated ? "rgba(169,159,179,0.4)" : color;
        ctx.stroke();
      }
      prevX = x;
      prevY = y;
    }

    // Range labels.
    ctx.fillStyle = "#A99FB3";
    if (trace === "magnitude") {
      ctx.fillText("+12 dB", 4, 12);
      ctx.fillText("-18 dB", 4, h - 16);
    } else if (trace === "phase") {
      ctx.fillText("+180°", 4, 12);
      ctx.fillText("-180°", 4, h - 16);
    } else {
      ctx.fillText("1.0", 4, 12);
      ctx.fillText("0.0", 4, h - 16);
    }
  }, [trace]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {(["magnitude", "phase", "coherence"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrace(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                trace === t ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="ml-auto rounded-full border border-rose/40 bg-rose/10 px-2.5 py-1 font-mono text-xs text-rose">
          demo data
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-xl border border-line bg-ink sm:h-80"
        aria-label="Transfer function"
      />

      <p className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-haze">
        Workflow: send pink noise through the system, feed a reference signal to
        the second channel, and align the two before reading magnitude and
        phase. Trust only bands where coherence stays above {COHERENCE_GATE}.
      </p>
    </div>
  );
}
