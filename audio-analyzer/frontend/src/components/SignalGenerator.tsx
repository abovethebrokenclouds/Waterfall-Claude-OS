import { useSignalGenerator, type SignalType } from "../hooks/useSignalGenerator";

const TYPE_LABELS: Record<SignalType, string> = {
  pink: "Pink",
  white: "White",
  sine: "Sine",
  sweep: "Sweep",
};

/**
 * Compact test-signal source panel — pink / white noise, sine, log sweep —
 * with level and a play/stop control. Used from the Transfer tab to drive the
 * system under measurement. All Web Audio access is inside the hook (SSR-safe).
 */
export function SignalGenerator() {
  const gen = useSignalGenerator();

  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-text">Signal generator</span>
        {!gen.supported && (
          <span className="font-mono text-[11px] text-haze">
            unsupported here
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel p-0.5">
          {(Object.keys(TYPE_LABELS) as SignalType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => gen.setType(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                gen.type === t ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => (gen.playing ? gen.stop() : gen.start())}
          disabled={!gen.supported}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-transform hover:scale-[1.03] disabled:opacity-40 ${
            gen.playing
              ? "border border-rose/50 bg-rose/10 text-rose"
              : "bg-gradient-to-r from-amber to-rose text-ink"
          }`}
        >
          {gen.playing ? "Stop" : "Play"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {gen.type === "sine" && (
          <label className="flex items-center gap-2 text-xs text-haze">
            Freq
            <input
              type="range"
              min={20}
              max={20000}
              step={1}
              value={gen.frequency}
              onChange={(e) => gen.setFrequency(Number(e.target.value))}
              className="accent-amber"
            />
            <span className="w-16 font-mono text-text tabular-nums">
              {gen.frequency >= 1000
                ? `${(gen.frequency / 1000).toFixed(2)}k`
                : gen.frequency}{" "}
              Hz
            </span>
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-haze">
          Level
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={gen.level}
            onChange={(e) => gen.setLevel(Number(e.target.value))}
            className="accent-amber"
          />
          <span className="w-10 font-mono text-text tabular-nums">
            {Math.round(gen.level * 100)}%
          </span>
        </label>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-haze">
        Pink noise is the standard excitation for a transfer-function
        measurement. Output plays from this device — keep the level modest on
        speakers.
      </p>
    </div>
  );
}
