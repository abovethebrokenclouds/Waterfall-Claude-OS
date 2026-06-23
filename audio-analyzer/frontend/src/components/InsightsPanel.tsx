import { useState } from "react";
import type { Insight, InsightSeverity } from "../lib/diagnostics";

interface InsightsPanelProps {
  insights: Insight[];
  /** Whether the active measurement is live or demo data (for honest labelling). */
  live?: boolean;
  /** Render as a collapsible block (mobile) instead of an always-open list. */
  collapsible?: boolean;
}

// Warm palette only — NO green. attention=amber, high=rose, info=teal.
const CHIP: Record<InsightSeverity, string> = {
  info: "bg-teal/20 text-teal",
  attention: "bg-amber/20 text-amber-soft",
  high: "bg-rose/20 text-rose",
};

const CHIP_LABEL: Record<InsightSeverity, string> = {
  info: "info",
  attention: "attention",
  high: "high",
};

function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((ins, i) => (
        <li
          key={`${ins.area}-${i}`}
          className="rounded-xl border border-line bg-panel2/60 p-3"
        >
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHIP[ins.severity]}`}
            >
              {CHIP_LABEL[ins.severity]}
            </span>
            <span className="text-xs font-semibold text-text">{ins.area}</span>
          </div>
          <p className="mt-1.5 text-sm leading-snug text-text">{ins.message}</p>
          {ins.suggestion && (
            <p className="mt-1 text-xs leading-snug text-haze">
              {ins.suggestion}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders heuristic diagnostics with severity-coloured chips. Honestly labelled
 * as offline heuristics — there is no model behind it. SSR-safe (pure render).
 */
export function InsightsPanel({
  insights,
  live = false,
  collapsible = false,
}: InsightsPanelProps) {
  const [open, setOpen] = useState(false);

  if (collapsible) {
    return (
      <div className="rounded-xl border border-line bg-panel/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={open}
        >
          <span className="text-sm font-semibold text-text">
            Insights
            <span className="ml-2 rounded-full bg-panel2 px-2 py-0.5 font-mono text-[10px] text-haze">
              {insights.length}
            </span>
          </span>
          <span className="font-mono text-xs text-haze">
            {open ? "hide" : "show"}
          </span>
        </button>
        {open && (
          <div className="border-t border-line px-4 pb-4 pt-3">
            <InsightList insights={insights} />
            <p className="mt-3 text-[11px] leading-snug text-haze">
              Offline heuristics from the {live ? "live" : "demo"} spectrum — not
              an AI model.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <InsightList insights={insights} />
      <p className="mt-4 text-[11px] leading-snug text-haze">
        Offline heuristics from the {live ? "live" : "demo"} spectrum — not an AI
        model.
      </p>
    </div>
  );
}
