import type { ReactNode } from "react";
import {
  IconWave,
  IconTransfer,
  IconGauge,
  IconRoom,
  IconList,
  IconPulse,
  IconChip,
} from "./icons";
import { LockChip } from "./LockChip";
import { hasFeature, type Edition, type FeatureKey } from "../lib/editions";

export type AnalyzerTab =
  | "rta"
  | "transfer"
  | "spl"
  | "rt60"
  | "ir"
  | "console"
  | "sessions";

interface TabDef {
  id: AnalyzerTab;
  label: string;
  icon: ReactNode;
  /** Feature key that gates this tab (undefined = always available). */
  feature?: FeatureKey;
}

const TABS: TabDef[] = [
  { id: "rta", label: "RTA", icon: <IconWave width={20} height={20} />, feature: "rta" },
  { id: "transfer", label: "Transfer", icon: <IconTransfer width={20} height={20} />, feature: "transfer" },
  { id: "spl", label: "SPL", icon: <IconGauge width={20} height={20} />, feature: "spl" },
  { id: "rt60", label: "RT60", icon: <IconRoom width={20} height={20} /> },
  { id: "ir", label: "IR", icon: <IconPulse width={20} height={20} />, feature: "ir" },
  { id: "console", label: "Console", icon: <IconChip width={20} height={20} />, feature: "ir" },
  { id: "sessions", label: "Sessions", icon: <IconList width={20} height={20} />, feature: "sessions" },
];

interface BottomNavProps {
  active: AnalyzerTab;
  onChange: (tab: AnalyzerTab) => void;
  /** When true, render as a vertical left rail (desktop). */
  vertical?: boolean;
  /** Current edition — drives the lock chips on gated tabs. */
  edition?: Edition;
}

/** Whether a tab is unlocked at the given edition. */
function unlocked(t: TabDef, edition: Edition): boolean {
  return t.feature ? hasFeature(edition, t.feature) : true;
}

/**
 * Navigation that scales to 6+ entries. On desktop it is a vertical left rail;
 * on mobile a horizontally-scrollable thumb-friendly row (snap-aligned) so all
 * modes stay reachable without a cramped fixed grid. Gated tabs show a lock
 * chip but remain navigable in the demo.
 */
export function BottomNav({
  active,
  onChange,
  vertical = false,
  edition = "studio",
}: BottomNavProps) {
  if (vertical) {
    return (
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-line bg-panel/60 p-3">
        {TABS.map((t) => {
          const locked = !unlocked(t, edition);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active === t.id
                  ? "bg-panel2 text-amber-soft"
                  : "text-haze hover:text-text"
              }`}
            >
              {t.icon}
              <span className="flex-1 text-left">{t.label}</span>
              {locked && t.feature && (
                <LockChip edition={t.feature === "ir" ? "studio" : "pro"} />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex snap-x snap-mandatory overflow-x-auto">
        {TABS.map((t) => {
          const locked = !unlocked(t, edition);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              className={`flex min-w-[4.5rem] flex-1 snap-start flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active === t.id ? "text-amber-soft" : "text-haze"
              }`}
            >
              <span
                className={`relative ${
                  active === t.id
                    ? "drop-shadow-[0_0_8px_rgba(246,166,35,0.5)]"
                    : ""
                }`}
              >
                {t.icon}
                {locked && (
                  <span className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-violet" />
                )}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
