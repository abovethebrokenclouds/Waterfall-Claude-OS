import { useEffect, useMemo, useRef, useState } from "react";
import {
  syntheticTransfer,
  findDelay,
  compensatePhase,
  whiteNoise,
  averageTransfers,
  type TransferPoint,
} from "../lib/dsp";
import { SignalGenerator } from "./SignalGenerator";
import { LockChip } from "./LockChip";
import { hasFeature, type Edition } from "../lib/editions";
import type { BridgeTransferResult } from "../hooks/useBridgeTransfer";
import {
  addSession,
  removeSession,
  makeSession,
  sessionsToJson,
  parseSessionsJson,
  type MeasurementSession,
} from "../lib/measurementSessions";

type TransferTrace = "magnitude" | "phase" | "coherence";

const F_MIN = 20;
const F_MAX = 20000;
const COHERENCE_GATE = 0.85;

const SR = 48000;
const DEMO_DELAY_SAMPLES = 41; // the "true" inter-channel delay to recover

// Persisted saved-measurement list. SSR-safe: every accessor guards `window`
// and swallows storage errors. id / Date.now() are generated in the handlers,
// never at module scope.
const MEAS_STORAGE_KEY = "rta.measurementSessions";

function loadMeasurementSessions(): MeasurementSession[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(MEAS_STORAGE_KEY);
    if (!raw) return [];
    return parseSessionsJson(raw);
  } catch {
    return [];
  }
}

function persistMeasurementSessions(list: MeasurementSession[]) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(MEAS_STORAGE_KEY, sessionsToJson(list));
  } catch {
    // storage full / blocked — ignore.
  }
}

function downloadJson(filename: string, content: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface TransferViewProps {
  edition?: Edition;
  /**
   * A live transfer function measured from two bridge taps (ref + meas). When
   * present, the view renders THIS instead of the synthetic demo curve. Carries
   * the (optionally delay-compensated) points plus the measured delay.
   */
  bridgeTransfer?: BridgeTransferResult | null;
  /** Label of the reference tap, for the live banner. */
  refLabel?: string | null;
  /** Label of the measurement tap, for the live banner. */
  measLabel?: string | null;
  /** Whether the live phase trace is delay-compensated (default on). */
  compensate?: boolean;
  /** Toggle live delay compensation. */
  onCompensateChange?: (next: boolean) => void;
}

/**
 * Dual-channel transfer-function view. Renders a live dual-FFT measurement from
 * two bridge taps when one is wired (`bridgeTransfer`), otherwise a deterministic
 * synthetic demo curve. Includes the pink-noise measurement hint.
 */
export function TransferView({
  edition = "studio",
  bridgeTransfer = null,
  refLabel = null,
  measLabel = null,
  compensate = true,
  onCompensateChange,
}: TransferViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trace, setTrace] = useState<TransferTrace>("magnitude");
  const [delaySamples, setDelaySamples] = useState<number | null>(null);
  const [compensated, setCompensated] = useState(false);

  // Multi-point spatial averaging: each capture is a deep snapshot of the live
  // transfer at one measurement position; toggling `showAverage` renders the
  // complex (vector) average across the captured positions.
  const [captures, setCaptures] = useState<TransferPoint[][]>([]);
  const [showAverage, setShowAverage] = useState(false);

  // Persisted saved measurements (captures + delay + labels), recallable later.
  const [saved, setSaved] = useState<MeasurementSession[]>([]);
  const [savedHydrated, setSavedHydrated] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  // When a saved measurement is recalled into the live captures, remember its
  // metadata so its labels/delay can be shown alongside the re-rendered traces.
  const [recalled, setRecalled] = useState<MeasurementSession | null>(null);

  const canDelay = hasFeature(edition, "delayFinder");
  const canGen = hasFeature(edition, "signalGenerator");

  const isLive =
    bridgeTransfer !== null && bridgeTransfer.points.length > 0;

  const baseData = useMemo(() => syntheticTransfer(F_MIN, F_MAX, 256), []);

  // The displayed data: a live bridge measurement when wired, otherwise the
  // synthetic demo curve (optionally phase-compensated once a delay is found).
  const data = useMemo<TransferPoint[]>(() => {
    // Spatial average across captured positions takes precedence whenever
    // captures exist (live OR recalled from a saved measurement): combine the
    // captured snapshots into one room-representative curve.
    if (showAverage && captures.length >= 1) {
      return averageTransfers(captures);
    }
    // A recalled measurement with no average requested: show its first captured
    // position so the recalled traces render even when not live.
    if (!isLive && recalled && captures.length >= 1) {
      return captures[0];
    }
    if (isLive && bridgeTransfer) return bridgeTransfer.points;
    if (!compensated || delaySamples === null) return baseData;
    return baseData.map((p) => ({
      ...p,
      phaseDeg: compensatePhase(p.phaseDeg, p.freq, delaySamples, SR),
    }));
  }, [
    isLive,
    showAverage,
    captures,
    recalled,
    bridgeTransfer,
    baseData,
    compensated,
    delaySamples,
  ]);

  const dataRef = useRef<TransferPoint[]>(data);
  dataRef.current = data;

  /** Snapshot the current live transfer as one measurement position. */
  const handleCapture = () => {
    if (!bridgeTransfer || bridgeTransfer.points.length === 0) return;
    // Deep copy so later live updates don't mutate the captured position.
    const snap = bridgeTransfer.points.map((p) => ({ ...p }));
    setCaptures((prev) => [...prev, snap]);
  };

  const handleClearCaptures = () => {
    setCaptures([]);
    setShowAverage(false);
    setRecalled(null);
  };

  // Hydrate saved measurements from localStorage after mount (SSR-safe).
  useEffect(() => {
    setSaved(loadMeasurementSessions());
    setSavedHydrated(true);
  }, []);

  useEffect(() => {
    if (savedHydrated) persistMeasurementSessions(saved);
  }, [saved, savedHydrated]);

  /** Persist the current captures + delay + ref/meas labels as a session. */
  const handleSaveMeasurement = () => {
    if (captures.length === 0) return;
    const name = saveName.trim() || `Measurement ${saved.length + 1}`;
    const delay = bridgeTransfer
      ? {
          samples: bridgeTransfer.delay.samples,
          ms: bridgeTransfer.delay.ms,
          peak: bridgeTransfer.delay.peak,
        }
      : undefined;
    const session = makeSession(
      {
        name,
        captures,
        delay,
        refLabel: refLabel ?? undefined,
        measLabel: measLabel ?? undefined,
      },
      `meas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Date.now(),
    );
    setSaved((prev) => addSession(prev, session));
    setSaveName("");
  };

  /** Recall a saved measurement: repopulate captures so traces re-render. */
  const handleRecall = (session: MeasurementSession) => {
    setCaptures(session.captures.map((cap) => cap.map((p) => ({ ...p }))));
    setShowAverage(session.captures.length >= 1);
    setRecalled(session);
  };

  const handleDeleteSaved = (id: string) =>
    setSaved((prev) => removeSession(prev, id));

  const handleExportSaved = () =>
    downloadJson("rta-measurements.json", sessionsToJson(saved));

  const handleImportSaved = () => {
    const incoming = parseSessionsJson(importText);
    if (incoming.length === 0) return;
    // Merge, de-duplicating by id (incoming wins).
    setSaved((prev) => {
      const ids = new Set(incoming.map((s) => s.id));
      const kept = prev.filter((s) => !ids.has(s.id));
      return [...incoming, ...kept];
    });
    setImportText("");
    setImportOpen(false);
  };

  /** Cross-correlate a reference against a delayed measurement to recover the lag. */
  const handleFindDelay = () => {
    const ref = whiteNoise(2048, 13);
    const meas = new Float64Array(ref.length);
    for (let i = 0; i < ref.length; i++) {
      const src = i - DEMO_DELAY_SAMPLES;
      meas[i] = src >= 0 && src < ref.length ? ref[src] : 0;
    }
    const r = findDelay(ref, meas, SR);
    setDelaySamples(r.samples);
    setCompensated(true);
  };

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
    const points = dataRef.current;
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
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
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
  }, [trace, data]);

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
        {isLive ? (
          <span className="ml-auto rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 font-mono text-xs text-teal">
            live · bridge taps
          </span>
        ) : (
          <span className="ml-auto rounded-full border border-rose/40 bg-rose/10 px-2.5 py-1 font-mono text-xs text-rose">
            demo data
          </span>
        )}
      </div>

      {isLive && (
        <p className="rounded-lg border border-violet/40 bg-violet/10 px-3 py-2 text-xs text-text">
          Source: Bridge taps — <span className="text-amber">ref</span>{" "}
          <span className="font-mono">{refLabel ?? "—"}</span>{" "}
          <span className="text-haze">/</span>{" "}
          <span className="text-rose">meas</span>{" "}
          <span className="font-mono">{measLabel ?? "—"}</span>
        </p>
      )}

      {/* Multi-point spatial averaging (live only): capture several positions
          and combine them into one room-representative average. */}
      {isLive && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCapture}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose to-violet px-3 py-1.5 text-xs font-semibold text-ink transition-transform hover:scale-[1.03]"
            >
              Capture position
            </button>
            <span className="font-mono text-rose">
              {captures.length} position{captures.length === 1 ? "" : "s"}
            </span>
            {captures.length > 0 && (
              <button
                type="button"
                onClick={handleClearCaptures}
                className="rounded-md border border-line px-2 py-1 text-haze transition-colors hover:text-text"
              >
                Clear
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-haze">
              <input
                type="checkbox"
                checked={showAverage}
                onChange={(e) => setShowAverage(e.target.checked)}
                disabled={captures.length === 0}
                className="accent-violet disabled:opacity-40"
              />
              Show spatial average
            </label>
          </div>
          {showAverage && captures.length >= 1 && (
            <span className="font-mono text-[11px] text-violet">
              Spatial average — {captures.length} position
              {captures.length === 1 ? "" : "s"}
            </span>
          )}
          {/* Save the current captures + delay + labels as a measurement. */}
          {captures.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-rose/20 pt-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="measurement name"
                className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-text placeholder:text-haze"
              />
              <button
                type="button"
                onClick={handleSaveMeasurement}
                className="glass-btn-primary rounded-md px-3 py-1 text-xs font-semibold"
              >
                Save measurement
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recalled-measurement banner (shown when not live). */}
      {!isLive && recalled && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet/40 bg-violet/10 px-3 py-2 text-xs text-text">
          <span className="font-semibold text-violet">Recalled</span>
          <span className="font-mono">{recalled.name}</span>
          <span className="text-haze">
            {recalled.captures.length} position
            {recalled.captures.length === 1 ? "" : "s"}
          </span>
          {(recalled.refLabel || recalled.measLabel) && (
            <span className="font-mono text-[11px] text-haze">
              <span className="text-amber">ref</span>{" "}
              {recalled.refLabel ?? "—"}{" "}
              <span className="text-rose">meas</span>{" "}
              {recalled.measLabel ?? "—"}
            </span>
          )}
          {recalled.delay && (
            <span className="font-mono text-[11px] text-amber">
              Δ {recalled.delay.ms.toFixed(2)} ms ({recalled.delay.samples} smp)
            </span>
          )}
          <button
            type="button"
            onClick={handleClearCaptures}
            className="ml-auto rounded-md border border-line px-2 py-1 text-haze transition-colors hover:text-text"
          >
            Clear
          </button>
        </div>
      )}

      {/* Recalled spatial average + delay info needs the average controls even
          when not live: surface a compact toggle so the average re-renders. */}
      {!isLive && recalled && captures.length >= 1 && (
        <label className="flex items-center gap-2 px-1 text-xs text-haze">
          <input
            type="checkbox"
            checked={showAverage}
            onChange={(e) => setShowAverage(e.target.checked)}
            className="accent-violet"
          />
          Show spatial average ({captures.length} position
          {captures.length === 1 ? "" : "s"})
        </label>
      )}

      {/* Live delay readout + compensation toggle (the "find delay" step). */}
      {isLive && bridgeTransfer && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs">
          <span className="font-mono text-amber">
            Delay {bridgeTransfer.delay.ms.toFixed(2)} ms (
            {bridgeTransfer.delay.samples} smp · conf{" "}
            {bridgeTransfer.delay.peak.toFixed(2)})
          </span>
          <label className="flex items-center gap-2 text-haze">
            <input
              type="checkbox"
              checked={compensate}
              onChange={(e) => onCompensateChange?.(e.target.checked)}
              className="accent-amber"
            />
            Compensate delay
          </label>
          <span className="ml-auto font-mono text-[11px] text-teal">
            {bridgeTransfer.compensated ? "phase aligned" : "raw phase ramp"}
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="h-64 w-full rounded-xl border border-line bg-ink sm:h-80"
        aria-label="Transfer function"
      />

      {/* Delay finder / time alignment. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel2/40 p-3">
        <button
          type="button"
          onClick={handleFindDelay}
          disabled={!canDelay}
          className="glass-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Find delay
          {!canDelay && <LockChip edition="pro" />}
        </button>
        {delaySamples !== null && (
          <span className="font-mono text-xs text-text">
            Δ {delaySamples} samples ·{" "}
            {((delaySamples / SR) * 1000).toFixed(2)} ms
          </span>
        )}
        {delaySamples !== null && (
          <label className="flex items-center gap-2 text-xs text-haze">
            <input
              type="checkbox"
              checked={compensated}
              onChange={(e) => setCompensated(e.target.checked)}
              className="accent-amber"
            />
            Compensate phase
          </label>
        )}
        <span className="ml-auto font-mono text-[11px] text-haze">
          {compensated ? "phase aligned" : "raw phase"}
        </span>
      </div>

      {canGen ? (
        <SignalGenerator />
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel2/40 p-3 text-xs text-haze">
          Signal generator <LockChip edition="pro" />
          <span>— pink noise excitation is a Pro feature.</span>
        </div>
      )}

      <p className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-haze">
        Workflow: send pink noise through the system, feed a reference signal to
        the second channel, then <span className="text-text">Find delay</span>{" "}
        and compensate before reading magnitude and phase. Trust only bands where
        coherence stays above {COHERENCE_GATE}.
      </p>

      {/* Saved measurements: recall / delete / export / import. */}
      <div className="flex flex-col gap-2 rounded-xl border border-violet/30 bg-panel2/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-violet">
            Saved measurements
          </span>
          <span className="font-mono text-[11px] text-haze">
            {saved.length}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleExportSaved}
              disabled={saved.length === 0}
              className="rounded-md border border-line bg-panel2 px-2.5 py-1 text-xs text-text disabled:opacity-40"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="rounded-md border border-line bg-panel2 px-2.5 py-1 text-xs text-text"
            >
              Import
            </button>
          </div>
        </div>

        {importOpen && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste exported measurements JSON here"
              rows={3}
              className="w-full rounded-md border border-line bg-ink px-2 py-1.5 font-mono text-[11px] text-text placeholder:text-haze"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImportSaved}
                disabled={importText.trim().length === 0}
                className="rounded-md bg-gradient-to-r from-violet to-teal px-3 py-1 text-xs font-semibold text-ink disabled:opacity-40"
              >
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportText("");
                  setImportOpen(false);
                }}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-haze hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {saved.length === 0 ? (
          <p className="text-xs text-haze">
            None yet. Capture positions above, then{" "}
            <span className="text-text">Save measurement</span> to keep a
            transfer for later recall.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saved.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-text">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] text-haze">
                    {s.captures.length} position
                    {s.captures.length === 1 ? "" : "s"}
                    {s.delay ? ` · Δ ${s.delay.ms.toFixed(2)} ms` : ""} ·{" "}
                    {new Date(s.savedAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRecall(s)}
                    className="text-teal hover:text-teal/80"
                  >
                    Recall
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSaved(s.id)}
                    className="text-rose hover:text-rose-deep"
                  >
                    delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
