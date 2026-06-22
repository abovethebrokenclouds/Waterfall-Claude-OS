# API Reference

RTA Insight Pro has three API surfaces:

1. The **local DSP library** (`frontend/src/lib/dsp/`) — pure TypeScript, the
   measurement core. This is the primary, always-present API.
2. The **optional backend** — a small REST surface for session sync and PDF
   report generation. Absent by default; the app works without it.
3. **Export formats** — the JSON and CSV shapes a session snapshot serializes to.

Signatures below mirror the actual exports in
`frontend/src/lib/dsp/`. Treat the source as authoritative if it drifts from
this doc.

---

## 1. Local DSP API (`frontend/src/lib/dsp/`)

All DSP functions are **pure and deterministic** — no Web Audio globals, no DOM —
so they are unit-testable headless. They take and return typed arrays / numbers.

### `fft.ts` — windowing & FFT

```ts
// A Hann window of length n.
function hannWindow(n: number): Float64Array;

// Element-wise multiply a signal by a window.
function applyWindow(signal: ArrayLike<number>, window: ArrayLike<number>): Float64Array;

// True if n is a power of two and > 0.
function isPowerOfTwo(n: number): boolean;

// In-place radix-2 FFT. re/im must be the same power-of-two length. Throws otherwise.
function fftInPlace(re: Float64Array, im: Float64Array): void;

// One-sided magnitude spectrum of a real signal (power-of-two length). Throws otherwise.
function realFftMagnitude(signal: ArrayLike<number>): Float64Array;

// Frequency (Hz) of FFT bin `index` for a given fftSize and sampleRate.
function binToFrequency(index: number, fftSize: number, sampleRate: number): number;

// Linear magnitude → dB (20·log10), floored (default -120) to avoid -Infinity.
function magnitudeToDb(mag: number, floorDb?: number): number;
```

**Notes.** `df = sampleRate / fftSize` is the bin resolution. Window the signal
(`applyWindow(signal, hannWindow(N))`) before `realFftMagnitude` to limit
spectral leakage. Larger `fftSize` gives finer low-frequency resolution at higher
per-frame cost — see [mobile-optimization.md](mobile-optimization.md).

### `octave.ts` — fractional-octave smoothing

```ts
// 1/N-octave smoothing of a magnitude spectrum, length-preserving.
// Averages in the POWER domain (per ANSI S1.11), then converts back to magnitude.
function octaveSmooth(
  spectrum: ArrayLike<number>,
  fftSize: number,
  sampleRate: number,
  fraction: number,        // the N in 1/N octave; N >= 1
): Float64Array;

const OCTAVE_FRACTIONS = [1, 2, 3, 6, 12, 24] as const;
type OctaveFraction = (typeof OCTAVE_FRACTIONS)[number];
```

Band edges are geometric: for center `fc`, the band spans
`fc / 2^(1/2N)` … `fc · 2^(1/2N)`. Averaging power (magnitude²) and not dB is
deliberate — averaging dB underweights peaks.

### `weighting.ts` — A / C / Z weighting (IEC 61672)

```ts
type Weighting = "A" | "C" | "Z";

// Weighting in dB to add at frequency f. Normalized to 0 dB at 1 kHz.
// Z is flat (0 dB everywhere); A rolls off lows, C is near-flat mid-band.
function weightingDb(f: number, weighting: Weighting): number;

// Apply a weighting curve to per-frequency levels; freqs[i] is the freq of levelsDb[i].
function applyWeighting(
  levelsDb: ArrayLike<number>,
  freqs: ArrayLike<number>,
  weighting: Weighting,
): Float64Array;
```

The curves are the IEC 61672 analytic pole/zero forms (constants `F1..F4`), not
hand-typed tables. Unit tests should pin `weightingDb(1000, "A") ≈ 0`.

### `spl.ts` — SPL, Leq, ballistics

```ts
// RMS of a sample buffer.
function rms(samples: ArrayLike<number>): number;

// RMS (0..1 full scale) → dB SPL. calibrationOffset = dB SPL at 0 dBFS RMS.
function rmsToDbSpl(rmsValue: number, calibrationOffset?: number): number;

// Convenience: dB SPL straight from a sample buffer.
function bufferDbSpl(samples: ArrayLike<number>, calibrationOffset?: number): number;

// Equivalent continuous level: Leq = 10·log10(mean(10^(L/10))).
function leq(levelsDb: ArrayLike<number>): number;

// Exponential meter step for Fast/Slow ballistics. Returns updated smoothed dB.
function ballistics(
  previousDb: number,
  currentDb: number,
  timeConstantSec: number,   // see TIME_CONSTANTS
  deltaSec: number,
): number;

const TIME_CONSTANTS = { fast: 0.125, slow: 1.0 } as const;
```

**Calibration.** `calibrationOffset` is the dB SPL that corresponds to 0 dBFS
RMS; it folds in mic sensitivity and interface gain and must come from a known
reference, not a hardcoded constant. Apply frequency weighting (A/C/Z) **before**
integrating for `LAeq` / `LCeq`.

### `rt60.ts` — reverberation time

```ts
// Schroeder backward-integrated energy decay curve (EDC) in dB, normalized to start at 0 dB.
function schroederDecay(ir: ArrayLike<number>): Float64Array;

interface Rt60Result {
  rt60: number;              // seconds, extrapolated to a 60 dB decay
  slope: number;             // dB/second (negative)
  method: "T20" | "T30";
}

// Estimate RT60 from an impulse response. Prefers T30 (-5..-35 dB), falls back to T20 (-5..-25 dB).
function estimateRt60(ir: ArrayLike<number>, sampleRate: number): Rt60Result;

// Deterministic synthetic exponential decay IR — for demos and tests.
function syntheticIr(rt60: number, sampleRate: number, durationSec: number, seed?: number): Float64Array;
```

For trustworthy results, the impulse response should be truncated near the noise
floor before integration; per-band RT60 band-passes the IR first. The fit is
extrapolated to 60 dB rather than measured directly over 60 dB.

### `transfer.ts` — dual-channel transfer function

```ts
interface TransferPoint {
  freq: number;
  magDb: number;             // magnitude in dB (relative)
  phaseDeg: number;          // phase in degrees, wrapped to [-180, 180]
  coherence: number;         // 0..1
}

// Wrap a phase (degrees) into [-180, 180].
function wrapPhaseDeg(deg: number): number;

// Magnitude (dB) and phase (deg) from a complex transfer value.
function magDb(re: number, im: number): number;
function phaseDeg(re: number, im: number): number;

// Coherence: γ² = |Sxy|² / (Sxx·Syy), clamped to [0, 1].
function coherence(sxy2: number, sxx: number, syy: number): number;

// Log-spaced frequency axis between fMin and fMax (inclusive).
function logFrequencies(fMin: number, fMax: number, points: number): Float64Array;

// Deterministic synthetic "speaker in a room" response — for the demo Transfer tab.
function syntheticTransfer(fMin?: number, fMax?: number, points?: number): TransferPoint[];
```

The estimate `H = Sxy / Sxx` must be **averaged over multiple blocks** to be
meaningful; coherence is identically 1 for a single average. Gate magnitude/phase
on a coherence threshold (e.g. ≥ 0.9) before trusting a region for EQ decisions.

---

## 2. Optional backend (REST sketch)

The backend is **opt-in** and never processes audio. It accepts already-computed
session snapshots (the same JSON the client exports) for cross-device sync and
PDF rendering. If it is not deployed, the app is local-only.

> **Assumption.** These routes are a design sketch for the frontend/backend
> agents; auth, base path, and exact field names are to be finalized. AI used
> anywhere in this app routes through the platform Super Agent — never a raw
> model fetch, hardcoded model string, or manual token cap.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/sessions` | Store a session snapshot; returns an id. |
| `GET`  | `/sessions/:id` | Retrieve a synced session snapshot. |
| `GET`  | `/sessions` | List the caller's synced sessions (metadata only). |
| `DELETE` | `/sessions/:id` | Delete a synced session. |
| `POST` | `/reports` | Render a session snapshot → PDF; returns a download URL or the bytes. |

`POST /sessions` request body is a session-export object (schema below).
`POST /reports` accepts the same object plus report options (title, units),
and returns a PDF.

```http
POST /sessions
Content-Type: application/json

{ "schemaVersion": "1.0", "session": { ...export object... } }
```

```http
201 Created
{ "id": "ses_8f3a...", "createdAt": "2026-06-22T18:04:11Z" }
```

---

## 3. Export formats

A session snapshot is the unit of export. It captures the mode, the result, and
the exact capture settings, so a measurement is reproducible and inspectable.

### JSON export (single session)

```json
{
  "schemaVersion": "1.0",
  "id": "ses_8f3a2c10",
  "name": "Main PA — center, mix position",
  "createdAt": "2026-06-22T18:04:11Z",
  "mode": "transfer",
  "device": {
    "label": "Focusrite USB Audio",
    "channelCount": 2,
    "requestedSampleRate": 48000,
    "actualSampleRate": 48000
  },
  "capture": {
    "fftSize": 8192,
    "window": "hann",
    "octaveFraction": 6,
    "weighting": "Z",
    "timeWeighting": "slow",
    "calibrationOffset": 120.0,
    "averages": 16
  },
  "result": {
    "transfer": [
      { "freq": 100.0,  "magDb": 2.1,  "phaseDeg": -34.0, "coherence": 0.97 },
      { "freq": 1000.0, "magDb": 0.0,  "phaseDeg": 0.0,   "coherence": 0.99 },
      { "freq": 4000.0, "magDb": 6.0,  "phaseDeg": 41.0,  "coherence": 0.95 }
    ]
  },
  "notes": "System is ~6 dB hotter at 4 kHz than 1 kHz before EQ."
}
```

Mode-specific `result` shapes:

| mode | `result` key | element shape |
|------|--------------|---------------|
| `spectrum` | `spectrum` | `{ "freq": number, "magDb": number, "peakDb"?: number }` |
| `spl` | `spl` | `{ "spl": number, "weighting": "A"\|"C"\|"Z", "leq": number, "min": number, "max": number }` |
| `transfer` | `transfer` | `{ "freq": number, "magDb": number, "phaseDeg": number, "coherence": number }` |
| `rt60` | `rt60` | `{ "band": number, "rt60": number, "method": "T20"\|"T30", "slope": number }` |

### CSV export

CSV mirrors the per-mode `result` array. A short header block (commented with
`#`) carries the session metadata, followed by typed columns.

Spectrum:

```csv
# schemaVersion,1.0
# name,Main PA — center, mix position
# mode,spectrum
# createdAt,2026-06-22T18:04:11Z
# fftSize,8192
# octaveFraction,6
# actualSampleRate,48000
freq_hz,mag_db,peak_db
20.0,-18.4,-12.1
1000.0,-6.2,-3.0
4000.0,-0.2,2.4
```

Transfer:

```csv
# mode,transfer
# averages,16
freq_hz,mag_db,phase_deg,coherence
100.0,2.1,-34.0,0.97
1000.0,0.0,0.0,0.99
4000.0,6.0,41.0,0.95
```

RT60 (per band):

```csv
# mode,rt60
band_hz,rt60_s,method,slope_db_per_s
125,0.62,T30,-96.8
1000,0.41,T30,-146.3
4000,0.33,T20,-181.8
```

SPL (single reading or a logged series):

```csv
# mode,spl
# weighting,A
# timeWeighting,slow
# calibrationOffset,120.0
timestamp,spl_db,leq_db,min_db,max_db
2026-06-22T18:04:11Z,92.4,90.1,71.2,101.7
```

> **Assumption.** `schemaVersion` is "1.0" for the initial release. Numeric
> precision in exports follows the UI display precision unless a future option
> overrides it.
