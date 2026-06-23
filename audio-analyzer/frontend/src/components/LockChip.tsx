import { EDITION_META, type Edition } from "../lib/editions";

interface LockChipProps {
  /** The edition required to unlock the gated feature. */
  edition: Edition;
}

/**
 * A small "Pro" / "Studio" lock chip shown on controls and tabs the current
 * edition does not include. Tasteful, warm-palette, and purely informational —
 * features stay navigable in the demo.
 */
export function LockChip({ edition }: LockChipProps) {
  const tone =
    edition === "studio"
      ? "border-violet/40 bg-violet/10 text-violet"
      : "border-amber/40 bg-amber/10 text-amber-soft";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${tone}`}
      title={`${EDITION_META[edition].label} feature`}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {EDITION_META[edition].label}
    </span>
  );
}
