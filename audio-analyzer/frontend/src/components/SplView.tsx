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
import { LockChip } from "./LockChip";
import { hasFeature, type Edition } from "../lib/editions";

interface SplViewProps {
  audio: UseAudioState;
  /** Current edition — gates continuous SPL logging. */
  edition?: Edition;
}

interface SplLogEntry {
  t: number; // ms since log start
  spl: number;
  leq: number;
  weighting: Weighting;
}

/**
 * SPL meter. Computes RMS from the time-domain AnalyserNode when a live engine
 * exists, else simulates a plausible level. A/C/Z weighting toggle, Fast/Slow
 * ballistics, big mono readout, plus Leq and peak. Absolute level uses the
 * active device's calibration offset (shared via useAudioState).
 */
export function SplView({ audio, edition = "studio" }: SplViewProps) {
  const {
    engine,
    calibrationOffset,
    activeCalibration,
    isCalibrated,
    defaultCalibrationOffset,
    calibrateFromReference,
    setManualOffset,
    clearCalibration,
  } = audio;
  const [weighting, setWeighting] = useState<Weighting>("A");
  const [response, setResponse] = useState<"fast" | "slow">("fast");
  const [display, setDisplay] = useState(0);
  const [peak, setPeak] = useState(0);
  const [leqValue, setLeqValue] = useState(0);
  const [logging, setLogging] = useState(false);
  const [log, setLog] = useState<SplLogEntry[]>([]);

  // Calibration UI state.
  const [refSpl, setRefSpl] = useState("94");
  const [manualDb, setManualDb] = useState("");

  const canLog = hasFeature(edition, "splLogging");

  const weightingRef = useRef(weighting);
  const responseRef = useRef(response);
  const loggingRef = useRef(logging && canLog);
  const logStartRef = useRef(0);
  // Latest raw dBFS (20·log10(rms), pre-weighting, pre-calibration) for a
  // reference capture, and the live calibration offset for the metering loop.
  const latestDbfsRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const calOffsetRef = useRef(calibrationOffset);
  weightingRef.current = weighting;
  responseRef.current = response;
  loggingRef.current = logging && canLog;
  calOffsetRef.current = calibrationOffset;

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
        // Keep the raw dBFS around so "Capture reference" can solve the offset.
        latestDbfsRef.current = r > 0 ? 20 * Math.log10(r) : Number.NEGATIVE_INFINITY;
        dbSpl = r > 0 ? rmsToDbSpl(r, calOffsetRef.current) : 0;
      } else {
        latestDbfsRef.current = Number.NEGATIVE_INFINITY;
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

      // SPL logging cadence (~1 Hz) when active.
      if (loggingRef.current && frame % 60 === 0) {
        const tMs = now - logStartRef.current;
        const lq = leq(history);
        const wq = weightingRef.current;
        setLog((prev) =>
          prev.length > 7200
            ? prev
            : [...prev, { t: tMs, spl: smoothed, leq: lq, weighting: wq }],
        );
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

  // Calibrate from a known reference level present on the mic right now.
  const captureReference = () => {
    const dbfs = latestDbfsRef.current;
    const ref = Number(refSpl);
    if (!engine || !Number.isFinite(dbfs) || !Number.isFinite(ref)) return;
    calibrateFromReference(dbfs, ref);
  };
  // Apply a known offset directly (advanced / published mic sensitivity).
  const applyManual = () => {
    const v = Number(manualDb);
    if (!Number.isFinite(v)) return;
    setManualOffset(v);
    setManualDb("");
  };

  const toggleLogging = () => {
    if (!canLog) return;
    setLogging((on) => {
      if (!on) {
        logStartRef.current =
          typeof performance !== "undefined" ? performance.now() : 0;
        setLog([]);
      }
      return !on;
    });
  };

  const download = (filename: string, mime: string, text: string) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = "time_s,spl_db,leq_db,weighting";
    const rows = log.map(
      (e) =>
        `${(e.t / 1000).toFixed(1)},${e.spl.toFixed(1)},${e.leq.toFixed(1)},${e.weighting}`,
    );
    download("spl-log.csv", "text/csv", [header, ...rows].join("\n"));
  };

  const exportJson = () => {
    download(
      "spl-log.json",
      "application/json",
      JSON.stringify(
        log.map((e) => ({
          time_s: e.t / 1000,
          spl_db: e.spl,
          leq_db: e.leq,
          weighting: e.weighting,
        })),
        null,
        2,
      ),
    );
  };

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

      {/* Calibration — per-device dBFS→dB SPL offset (shared app-wide). */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text">Calibration</span>
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
              isCalibrated ? "bg-amber/15 text-amber-soft" : "bg-white/5 text-haze"
            }`}
          >
            {isCalibrated
              ? `+${calibrationOffset.toFixed(1)} dB @ 0 dBFS`
              : "Uncalibrated"}
          </span>
        </div>
        <p className="text-xs text-haze">
          {isCalibrated
            ? `Calibrated for this input${
                activeCalibration?.label ? ` · ${activeCalibration.label}` : ""
              } — absolute dB SPL is trustworthy.`
            : `Using the default ${defaultCalibrationOffset} dB offset, so levels are relative. Play a known reference (e.g. a 94 dB acoustic calibrator) and capture it, or enter a known offset.`}
        </p>

        {/* Reference capture */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-haze">
            Reference
            <input
              type="number"
              inputMode="decimal"
              value={refSpl}
              onChange={(e) => setRefSpl(e.target.value)}
              className="w-20 rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs text-text"
            />
            dB SPL
          </label>
          <button
            type="button"
            onClick={captureReference}
            disabled={!engine}
            className="glass-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Capture reference
          </button>
          {isCalibrated && (
            <button
              type="button"
              onClick={clearCalibration}
              className="glass-btn rounded-lg px-3 py-1.5 text-xs font-semibold text-rose"
            >
              Clear
            </button>
          )}
        </div>

        {/* Manual offset */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-haze">
            Manual offset
            <input
              type="number"
              inputMode="decimal"
              placeholder={String(defaultCalibrationOffset)}
              value={manualDb}
              onChange={(e) => setManualDb(e.target.value)}
              className="w-20 rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs text-text"
            />
            dB
          </label>
          <button
            type="button"
            onClick={applyManual}
            disabled={!Number.isFinite(Number(manualDb)) || manualDb.trim() === ""}
            className="glass-btn rounded-lg px-3 py-1.5 text-xs font-semibold text-text disabled:opacity-40"
          >
            Set offset
          </button>
        </div>

        {!engine && (
          <p className="text-xs text-amber-soft">
            Start the mic to capture a reference level.
          </p>
        )}
      </div>

      {/* SPL logging (Studio). */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2/40 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-text">SPL log</span>
          <button
            type="button"
            onClick={toggleLogging}
            disabled={!canLog}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-transform hover:scale-[1.03] disabled:opacity-40 ${
              logging && canLog
                ? "border border-rose/50 bg-rose/10 text-rose"
                : "bg-gradient-to-r from-amber to-rose text-ink"
            }`}
          >
            {logging && canLog ? "Stop logging" : "Start logging"}
            {!canLog && <LockChip edition="studio" />}
          </button>
          {canLog && log.length > 0 && (
            <>
              <span className="font-mono text-xs text-haze">
                {log.length} samples
              </span>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs text-text hover:border-haze"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs text-text hover:border-haze"
              >
                JSON
              </button>
            </>
          )}
        </div>
        {canLog && log.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-lg border border-line/60">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-panel2 text-haze">
                <tr>
                  <th className="px-2 py-1">t (s)</th>
                  <th className="px-2 py-1">SPL</th>
                  <th className="px-2 py-1">Leq</th>
                  <th className="px-2 py-1">W</th>
                </tr>
              </thead>
              <tbody className="text-text">
                {log.slice(-12).map((e) => (
                  <tr key={e.t} className="border-t border-line/40">
                    <td className="px-2 py-0.5 tabular-nums">{(e.t / 1000).toFixed(0)}</td>
                    <td className="px-2 py-0.5 tabular-nums">{e.spl.toFixed(1)}</td>
                    <td className="px-2 py-0.5 tabular-nums">{e.leq.toFixed(1)}</td>
                    <td className="px-2 py-0.5">{e.weighting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canLog && log.length === 0 && (
          <p className="text-xs text-haze">
            Logs SPL and Leq once per second; export to CSV or JSON for a show
            report.
          </p>
        )}
      </div>

      {!engine && (
        <p className="font-mono text-xs text-amber-soft">
          Simulated level — press Start to meter live input.
        </p>
      )}
    </div>
  );
}
