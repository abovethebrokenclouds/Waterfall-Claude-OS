import { useEffect, useRef, useState } from "react";
import type { UseAudioState } from "../hooks/useAudioState";
import {
  rms,
  rmsToDbSpl,
  ballistics,
  leq,
  weightingDb,
  TIME_CONSTANTS,
  type Weighting,
} from "../lib/dsp";

interface SplViewProps {
  audio: UseAudioState;
}

const CAL_OFFSET = 100; // demo dBFS->dB SPL offset

/**
 * SPL meter. Computes RMS from the time-domain AnalyserNode when a live engine
 * exists, else simulates a plausible level. A/C/Z weighting toggle, Fast/Slow
 * ballistics, big mono readout, plus Leq and peak.
 */
export function SplView({ audio }: SplViewProps) {
  const { engine } = audio;
  const [weighting, setWeighting] = useState<Weighting>("A");
  const [response, setResponse] = useState<"fast" | "slow">("fast");
  const [display, setDisplay] = useState(0);
  const [peak, setPeak] = useState(0);
  const [leqValue, setLeqValue] = useState(0);

  const weightingRef = useRef(weighting);
  const responseRef = useRef(response);
  weightingRef.current = weighting;
  responseRef.current = response;

  useEffect(() => {
    let raf = 0;
    let smoothed = 60;
    let peakLevel = 0;
    const history: number[] = [];
    let last = typeof performance !== "undefined" ? performance.now() : 0;
    let frame = 0;

    const analyser = engine?.analyser ?? null;
    const td = analyser ? new Float32Array(analyser.fftSize) : null;

    const tick = () => {
      const now = typeof performance !== "undefined" ? performance.now() : last + 16;
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;

      let dbSpl: number;
      if (analyser && td) {
        analyser.getFloatTimeDomainData(td);
        const r = rms(td);
        dbSpl = r > 0 ? rmsToDbSpl(r, CAL_OFFSET) : 0;
      } else {
        // Simulated: a wandering level around 78 dB.
        dbSpl =
          78 +
          6 * Math.sin(frame * 0.01) +
          3 * Math.sin(frame * 0.047) +
          1.5 * Math.sin(frame * 0.13);
      }
      // Apply broadband weighting approximation at a representative 1 kHz +
      // a low-frequency penalty so A reads lower than C/Z on bassy content.
      const wAdj = weightingRef.current === "Z" ? 0 : weightingDb(250, weightingRef.current);
      dbSpl = Math.max(0, dbSpl + wAdj * 0.3);

      const tc =
        responseRef.current === "fast"
          ? TIME_CONSTANTS.fast
          : TIME_CONSTANTS.slow;
      smoothed = ballistics(smoothed, dbSpl, tc, dt);
      if (smoothed > peakLevel) peakLevel = smoothed;

      history.push(smoothed);
      if (history.length > 600) history.shift();

      // Throttle React state updates to ~10 Hz.
      if (frame % 6 === 0) {
        setDisplay(smoothed);
        setPeak(peakLevel);
        setLeqValue(leq(history));
      }

      frame++;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [engine]);

  const resetPeak = () => setPeak(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {(["A", "C", "Z"] as const).map((wq) => (
            <button
              key={wq}
              type="button"
              onClick={() => setWeighting(wq)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                weighting === wq ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {wq}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {(["fast", "slow"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResponse(r)}
              className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                response === r ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-ink p-8 text-center shadow-glow">
        <div className="font-mono text-7xl font-bold tabular-nums text-amber-soft sm:text-8xl">
          {display.toFixed(1)}
        </div>
        <div className="mt-1 font-mono text-sm text-haze">
          dB {weighting} · {response === "fast" ? "Fast" : "Slow"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-panel2/60 p-4">
          <div className="text-xs text-haze">Leq</div>
          <div className="font-mono text-2xl text-text tabular-nums">
            {leqValue.toFixed(1)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel2/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-haze">Peak</span>
            <button
              type="button"
              onClick={resetPeak}
              className="text-xs text-rose hover:text-rose-deep"
            >
              reset
            </button>
          </div>
          <div className="font-mono text-2xl text-text tabular-nums">
            {peak.toFixed(1)}
          </div>
        </div>
      </div>

      {!engine && (
        <p className="font-mono text-xs text-amber-soft">
          Simulated level — press Start to meter live input.
        </p>
      )}
    </div>
  );
}
