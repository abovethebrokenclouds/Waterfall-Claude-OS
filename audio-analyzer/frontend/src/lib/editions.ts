// Edition / feature-gating model — mirrors the Smaart v9 edition chart.
// Pure TypeScript, no DOM. Unit-tested.
//
// Three editions in a strict superset chain:
//   free   (≈ Smaart LE)   ⊂ pro (≈ Smaart RT) ⊂ studio (≈ Smaart Suite)
// Every feature an edition includes is also included by every higher edition.

export type Edition = "free" | "pro" | "studio";

/** Editions in ascending capability order. */
export const EDITIONS: Edition[] = ["free", "pro", "studio"];

/** Human labels and a one-line Smaart analogue for each edition. */
export const EDITION_META: Record<
  Edition,
  { label: string; smaart: string; tagline: string }
> = {
  free: {
    label: "Free",
    smaart: "≈ Smaart LE",
    tagline: "Simplified real-time spectrum and SPL, fixed settings.",
  },
  pro: {
    label: "Pro",
    smaart: "≈ Smaart RT",
    tagline: "RTA, spectrograph, transfer function, signal tools, traces.",
  },
  studio: {
    label: "Studio",
    smaart: "≈ Smaart Suite",
    tagline: "Everything, plus impulse-response acoustics and SPL logging.",
  },
};

/** Stable feature keys gated across the app. */
export type FeatureKey =
  | "rta"
  | "spl"
  | "spectrograph"
  | "transfer"
  | "signalGenerator"
  | "delayFinder"
  | "traces"
  | "liveAverage"
  | "ir"
  | "splLogging"
  | "sessions";

interface FeatureDef {
  label: string;
  /** Short description for the comparison matrix. */
  detail: string;
  /** The lowest edition that unlocks this feature. */
  minEdition: Edition;
}

const RANK: Record<Edition, number> = { free: 0, pro: 1, studio: 2 };

/**
 * The feature matrix. `editions` is derived (any edition >= minEdition), so the
 * superset invariant (free ⊂ pro ⊂ studio) holds by construction.
 */
export const FEATURES: Record<
  FeatureKey,
  { label: string; detail: string; minEdition: Edition; editions: Edition[] }
> = (() => {
  const defs: Record<FeatureKey, FeatureDef> = {
    rta: {
      label: "Real-time spectrum (RTA)",
      detail: "1/1 – 1/24-octave RTA with peak-hold and averaging.",
      minEdition: "free",
    },
    spl: {
      label: "SPL meter",
      detail: "A / C / Z weighting, Fast / Slow, Leq and peak.",
      minEdition: "free",
    },
    sessions: {
      label: "Session logging",
      detail: "Save, tag, and export measurements.",
      minEdition: "free",
    },
    spectrograph: {
      label: "Spectrograph",
      detail: "Scrolling time-frequency heatmap of the spectrum.",
      minEdition: "pro",
    },
    transfer: {
      label: "Transfer function",
      detail: "Dual-FFT magnitude, phase, and coherence.",
      minEdition: "pro",
    },
    signalGenerator: {
      label: "Signal generator",
      detail: "Pink / white noise, sine, and log sweep.",
      minEdition: "pro",
    },
    delayFinder: {
      label: "Delay finder",
      detail: "Cross-correlation inter-channel delay locator.",
      minEdition: "pro",
    },
    traces: {
      label: "Trace management",
      detail: "Capture, overlay, show / hide static spectrum traces.",
      minEdition: "pro",
    },
    liveAverage: {
      label: "Live averaging",
      detail: "Running average of N spectrum frames.",
      minEdition: "pro",
    },
    ir: {
      label: "Impulse Response mode",
      detail: "RT60 / EDT / C50 / C80 / D50 / Ts / STI from an IR.",
      minEdition: "studio",
    },
    splLogging: {
      label: "SPL logging",
      detail: "Continuous timestamped SPL log with export.",
      minEdition: "studio",
    },
  };

  const out = {} as Record<
    FeatureKey,
    { label: string; detail: string; minEdition: Edition; editions: Edition[] }
  >;
  for (const key of Object.keys(defs) as FeatureKey[]) {
    const d = defs[key];
    out[key] = {
      label: d.label,
      detail: d.detail,
      minEdition: d.minEdition,
      editions: EDITIONS.filter((e) => RANK[e] >= RANK[d.minEdition]),
    };
  }
  return out;
})();

/** Ordered list of feature keys, grouped lowest-edition-first for display. */
export const FEATURE_ORDER: FeatureKey[] = [
  "rta",
  "spl",
  "sessions",
  "spectrograph",
  "transfer",
  "signalGenerator",
  "delayFinder",
  "traces",
  "liveAverage",
  "ir",
  "splLogging",
];

/** True if `edition` includes `key`. */
export function hasFeature(edition: Edition, key: FeatureKey): boolean {
  return RANK[edition] >= RANK[FEATURES[key].minEdition];
}

/** The lowest edition that unlocks `key`. */
export function requiredEdition(key: FeatureKey): Edition {
  return FEATURES[key].minEdition;
}

/** All feature keys an edition includes. */
export function featuresFor(edition: Edition): FeatureKey[] {
  return FEATURE_ORDER.filter((k) => hasFeature(edition, k));
}

/** Narrowing guard for persisted / untrusted edition strings. */
export function isEdition(value: unknown): value is Edition {
  return value === "free" || value === "pro" || value === "studio";
}
