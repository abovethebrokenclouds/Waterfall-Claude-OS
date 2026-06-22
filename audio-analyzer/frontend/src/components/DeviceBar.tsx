import type { UseAudioState } from "../hooks/useAudioState";

const SAMPLE_RATES = [44100, 48000, 96000];

interface DeviceBarProps {
  audio: UseAudioState;
}

/**
 * Top device/source bar: input source, sample-rate, and channel routing.
 * Renders graceful fallback copy when permission or devices are unavailable.
 */
export function DeviceBar({ audio }: DeviceBarProps) {
  const {
    supported,
    permission,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    sampleRate,
    setSampleRate,
    routing,
    setRouting,
    start,
    stop,
    engine,
    error,
  } = audio;

  return (
    <div className="border-b border-line bg-panel/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-haze">
          Source
          <select
            value={selectedDeviceId ?? ""}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={!supported || devices.length === 0}
            className="rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-text disabled:opacity-50"
          >
            {devices.length === 0 ? (
              <option value="">Built-in mic</option>
            ) : (
              devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-haze">
          Rate
          <select
            value={sampleRate}
            onChange={(e) => setSampleRate(Number(e.target.value))}
            className="rounded-lg border border-line bg-panel2 px-2 py-1.5 font-mono text-sm text-text"
          >
            {SAMPLE_RATES.map((r) => (
              <option key={r} value={r}>
                {(r / 1000).toFixed(1)} kHz
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {(["mono", "left", "right"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRouting(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                routing === r ? "bg-amber text-ink" : "text-haze hover:text-text"
              }`}
            >
              {r === "left" ? "L" : r === "right" ? "R" : "Mono"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {engine ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-rose/50 bg-rose/10 px-3 py-1.5 text-sm font-semibold text-rose"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={!supported}
              className="rounded-lg bg-gradient-to-r from-amber to-rose px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {permission === "requesting" ? "Starting…" : "Start"}
            </button>
          )}
        </div>
      </div>

      {!supported && (
        <p className="mx-auto mt-2 max-w-5xl text-xs text-amber-soft">
          Built-in mic only — see limitations. Audio capture is unavailable in
          this environment, so all modes show demo data.
        </p>
      )}
      {supported && permission === "denied" && (
        <p className="mx-auto mt-2 max-w-5xl text-xs text-rose">
          {error ?? "Grant microphone access to start measuring."}
        </p>
      )}
      {supported && permission === "idle" && !engine && (
        <p className="mx-auto mt-2 max-w-5xl text-xs text-haze">
          Press Start and grant microphone access to measure live. Until then,
          each mode shows demo data.
        </p>
      )}
    </div>
  );
}
